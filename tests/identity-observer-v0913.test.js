import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/public/v0912-identity.js')?'/app':process.cwd();
const src=fs.readFileSync(`${root}/public/v0912-identity.js`,'utf8');
assert.match(src,/if\(b\.classList\.contains\('identity-raw-link'\)\)continue/,'TOC button enhancement must be guarded');
assert.doesNotMatch(src,/for\(const b of host\.querySelectorAll\('\.toc-use'\)\)\{b\.textContent=/,'must not unconditionally rewrite observed TOC button children');
assert.match(src,/new MutationObserver\(augmentToc\)/,'RAW TOC observer remains supported');

// V1.13.4 production finalizer. The v0914 build patch installs the durable queue
// structure; finalize its I/O through narrow SECURITY DEFINER RPCs so it does not
// depend on a service-role secret being present in the Render process. This script
// runs during the Docker build before the image is committed, so the transformed
// src/dartstoc.js is the production artifact that npm start executes.
const tocPath=`${root}/src/dartstoc.js`;
let builtToc=fs.readFileSync(tocPath,'utf8');
const helperRe=/const TOC_DURABLE_CHECKPOINT_SOURCE='dartstoc-best-known';[\s\S]*?\n\nexport async function startTocSync\(\)\{/;
assert.match(builtToc,helperRe,'durable checkpoint helper block must exist before finalization');
const rpcHelpers=`const TOC_DURABLE_CHECKPOINT_SOURCE='dartstoc-best-known';
const TOC_DURABLE_CHECKPOINT_EVERY=Math.max(100,Math.min(5000,Number(process.env.TOC_DURABLE_CHECKPOINT_EVERY)||500));

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
    p_source:TOC_DURABLE_CHECKPOINT_SOURCE,p_owner:String(owner||''),p_strategy:TOC_SYNC_STRATEGY,p_resume_queue:resumeQueue,
    p_pages:page,p_rows_seen:Number(p.totalSeen||p.rowsSeen||0),p_unique_rows:Number(p.uniqueRows||0),p_persisted_rows:Number(p.persistedRows||0),
    p_queued_shards:resumeQueue.length,p_failed_shards:Number(p.failedShards||0)
  }});
  return data===true;
}

async function clearTocDurableCheckpoint(owner){
  if(!REMOTE)return false;
  const {data}=await remoteFetch('rpc/camarillo_clear_toc_sync_checkpoint',{method:'POST',body:{p_source:TOC_DURABLE_CHECKPOINT_SOURCE,p_owner:String(owner||'')}});
  return data===true;
}

export async function startTocSync(){`;
builtToc=builtToc.replace(helperRe,rpcHelpers);
fs.writeFileSync(tocPath,builtToc);

const toc=fs.readFileSync(tocPath,'utf8');
assert.match(toc,/const TOC_SYNC_STRATEGY='prefix-shards-v4-atomic-resumable'/,'TOC sync must use atomic resumable deterministic prefix shards');
assert.match(toc,/export async function crawlBestKnownSharded/,'failure-isolated sharded crawler must be installed');
assert.match(toc,/async function persistTocRowsIncremental/,'completed shard records must have an immediate persistence path');
assert.match(toc,/const unique=new Map\(\)/,'incremental TOC persistence must deduplicate every write set');
assert.match(toc,/unique\.set\(row\.tocId,chooseBetterRecord\(unique\.get\(row\.tocId\),row\)\)/,'duplicate TOC IDs must collapse to one best record before Supabase upsert');
assert.match(toc,/const deduped=\[\.\.\.unique\.values\(\)\]/,'Supabase batches must be built from deduplicated rows');
assert.match(toc,/for\(let i=0;i<deduped\.length;i\+=100\)/,'deduplicated TOC rows must be chunked for Supabase');
assert.match(toc,/else\{persistedRows\+=await persistTocRowsIncremental\(rows\)\}/,'terminal shards must persist before the entire crawl completes');
assert.match(toc,/persistedRows\+=await persistTocRowsIncremental\(paged\.records\)/,'terminal paged fallbacks must also persist immediately');
assert.match(toc,/failedShards\.push\(\{prefix:shard\.prefix,error:/,'individual shard failures must be captured instead of aborting the crawl');
assert.match(toc,/complete:failedShards\.length===0/,'TOC run is complete only when every shard succeeds');
assert.match(toc,/\.filter\(r=>r\.playerName!=='\.\.\.'\)/,'pager ellipsis must never be persisted as a player');
assert.match(toc,/lastProgressAt:now\(\)/,'running checkpoints must carry a remote heartbeat');
assert.match(toc,/rpc\/camarillo_try_acquire_sync_lease/,'TOC worker must acquire and renew the Supabase atomic lease');
assert.match(toc,/rpc\/camarillo_release_sync_lease/,'TOC worker must release the Supabase atomic lease');
assert.match(toc,/if\(!\(await acquireTocAtomicLease\(runId\)\)\)throw new Error/,'progress checkpoints must verify lease ownership');
assert.match(toc,/atomicLease:true/,'a competing remote worker must be rejected by the atomic lease');
assert.match(toc,/Stale TOC worker replaced after atomic lease expiry\./,'orphaned running audit rows must be closed after lease expiry');
assert.match(toc,/persistedRows:crawl\.persistedRows\|\|0/,'sync audit metadata must expose progressive persistence');
assert.match(toc,/failedShards:crawl\.failedShards\|\|\[\]/,'sync audit metadata must expose any missing shards');
assert.match(toc,/resumeQueue=null/,'crawler must accept a durable resume queue');
assert.match(toc,/queueSnapshot:queue/,'crawler checkpoints must expose the unfinished shard queue');
assert.match(toc,/resumeQueue:Array\.isArray\(p\.queueSnapshot\)/,'audit checkpoints must retain a small resume queue sample');
assert.match(toc,/async function runSync\(runId,resumeQueue=null\)/,'runSync must receive the prior durable queue before it writes the new audit run');
assert.match(toc,/(?:const|let) resumeQueue=Array\.isArray\(previous\?\.metadata\?\.resumeQueue\)/,'startup must inspect legacy run metadata for backward-compatible resume');
assert.match(toc,/runSync\(runId,resumeQueue\)\.finally/,'replacement worker must receive the selected queue and release its lease when finished');
assert.doesNotMatch(toc,/const previousRun=await lastRun\(\)/,'runSync must not re-read lastRun after persisting itself and accidentally discard the resume queue');
assert.match(toc,/rpc\/camarillo_get_toc_sync_checkpoint/,'startup must load the canonical durable checkpoint through RPC');
assert.match(toc,/rpc\/camarillo_save_toc_sync_checkpoint/,'crawler must persist canonical durable checkpoints through RPC');
assert.match(toc,/rpc\/camarillo_clear_toc_sync_checkpoint/,'completed crawls must clear the canonical checkpoint through RPC');
assert.match(toc,/TOC_DURABLE_CHECKPOINT_EVERY/,'durable checkpoint cadence must be bounded');
assert.match(toc,/slice\(0,3\)/,'audit rows must not duplicate the full 60k+ shard queue');
assert.match(toc,/resumeQueue\.length<1000/,'tiny root/sample queues must not override the deep canonical checkpoint');

console.log('V0.9.13 identity safety + progressive TOC persistence/dedupe/atomic-lease/durable-RPC-resume checks passed');
