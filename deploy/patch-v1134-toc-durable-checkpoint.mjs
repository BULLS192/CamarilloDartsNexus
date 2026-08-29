import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

// This patch intentionally runs AFTER v0914. v0914 installs the durable-resume
// structure; this follow-up switches checkpoint I/O to small SECURITY DEFINER RPCs
// and stops renewing the lease on every single shard.
const helpersRe=/const TOC_DURABLE_CHECKPOINT_SOURCE='dartstoc-best-known';[\s\S]*?\n\nexport async function startTocSync\(\)\{/;
if(!helpersRe.test(toc))throw new Error('V1.13.4 follow-up: durable checkpoint helper block not found');

const helpers=`const TOC_DURABLE_CHECKPOINT_SOURCE='dartstoc-best-known';
const TOC_DURABLE_CHECKPOINT_EVERY=Math.max(100,Math.min(5000,Number(process.env.TOC_DURABLE_CHECKPOINT_EVERY)||500));
const TOC_LEASE_RENEW_MS=Math.max(30_000,Math.min(240_000,Number(process.env.TOC_LEASE_RENEW_MS)||60_000));

function compactTocResumeQueue(queue=[]){
  return (Array.isArray(queue)?queue:[]).map(s=>String(typeof s==='string'?s:(s?.prefix??''))).filter(Boolean);
}

async function loadTocDurableCheckpoint(){
  if(!REMOTE)return null;
  const {data}=await remoteFetch('rpc/camarillo_get_toc_sync_checkpoint',{method:'POST',body:{p_source:TOC_DURABLE_CHECKPOINT_SOURCE}});
  const row=Array.isArray(data)?data[0]||null:data;
  const resumeQueue=Array.isArray(row?.resume_queue)?row.resume_queue:[];
  return row&&resumeQueue.length?{...row,resumeQueue}:null;
}

async function saveTocDurableCheckpoint(owner,p={},force=false){
  if(!REMOTE)return false;
  const page=Number(p.page||p.shardsProcessed||0);
  if(!force&&page!==1&&page%TOC_DURABLE_CHECKPOINT_EVERY!==0)return false;
  const resumeQueue=compactTocResumeQueue(p.queueSnapshot||p.resumeQueue||[]);
  const {data}=await remoteFetch('rpc/camarillo_save_toc_sync_checkpoint',{method:'POST',body:{
    p_source:TOC_DURABLE_CHECKPOINT_SOURCE,
    p_owner:String(owner||''),
    p_strategy:TOC_SYNC_STRATEGY,
    p_resume_queue:resumeQueue,
    p_pages:page,
    p_rows_seen:Number(p.totalSeen||p.rowsSeen||0),
    p_unique_rows:Number(p.uniqueRows||0),
    p_persisted_rows:Number(p.persistedRows||0),
    p_queued_shards:resumeQueue.length,
    p_failed_shards:Number(p.failedShards||0)
  }});
  return data===true;
}

async function clearTocDurableCheckpoint(owner){
  if(!REMOTE)return false;
  const {data}=await remoteFetch('rpc/camarillo_clear_toc_sync_checkpoint',{method:'POST',body:{p_source:TOC_DURABLE_CHECKPOINT_SOURCE,p_owner:String(owner||'')}});
  return data===true;
}

export async function startTocSync(){`;
toc=toc.replace(helpersRe,helpers);

const hotLease="const crawl=await crawlBestKnownSharded({resumeQueue,onProgress:async p=>{if(!(await acquireTocAtomicLease(runId)))throw new Error('TOC atomic sync lease lost during crawl checkpoint.');await saveTocDurableCheckpoint(runId,p).catch(()=>{});";
if(!toc.includes(hotLease))throw new Error('V1.13.4 follow-up: per-shard lease renewal anchor not found');
toc=toc.replace(hotLease,"let lastTocLeaseRenewAt=Date.now();const crawl=await crawlBestKnownSharded({resumeQueue,onProgress:async p=>{if(Date.now()-lastTocLeaseRenewAt>=TOC_LEASE_RENEW_MS){if(!(await acquireTocAtomicLease(runId)))throw new Error('TOC atomic sync lease lost during crawl checkpoint.');lastTocLeaseRenewAt=Date.now()}await saveTocDurableCheckpoint(runId,p).catch(()=>{});");

fs.writeFileSync(tocPath,toc);
