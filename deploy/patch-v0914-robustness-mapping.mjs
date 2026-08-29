import fs from 'node:fs';

const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let ui=fs.readFileSync(uiPath,'utf8');
const rowRe=/  function playerForRow\(row\)\{[^\n]*\}/;
if(!rowRe.test(ui))throw new Error('V0.9.14 patch: playerForRow block not found');
ui=ui.replace(rowRe,`  function bullshooterIdForRow(row){
    if(!row)return'';
    const headers=playerTable?[...playerTable.querySelectorAll('thead th')]:[],idx=headers.findIndex(h=>h.textContent.trim().toUpperCase()==='BULLSHOOTER');
    if(idx>=0&&row.cells?.[idx]){const m=String(row.cells[idx].textContent||'').match(/#\\s*(\\d{3,})\\b/);if(m)return m[1]}
    for(const cell of (row.cells||[])){const m=String(cell.textContent||'').match(/#\\s*(\\d{3,})\\b/);if(m)return m[1]}
    return'';
  }
  function playerForRow(row){
    const bs=bullshooterIdForRow(row);if(bs){const exact=playerByBsId.get(bs);if(exact){row.dataset.nexusPlayerId=String(exact.id);row.dataset.bullshooterId=bs;return exact}}
    const cached=String(row?.dataset?.nexusPlayerId||'');if(cached&&playerById.has(cached))return playerById.get(cached);
    const raw=row?.cells?.[0]?.textContent||'',first=norm(raw),base=norm(String(raw).replace(/[\\\"“][^\\\"”]+[\\\"”]/g,' '));let p=first?playerByName.get(first)||null:null;if(!p&&base)p=playerByName.get(base)||null;
    if(!p){for(const key of [first,base].filter(Boolean)){for(const [name,candidate] of playerByName){if(key===name||key.startsWith(name+' ')||name.startsWith(key+' ')){p=candidate;break}}if(p)break}}
    if(p)row.dataset.nexusPlayerId=String(p.id);return p||null;
  }`);
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.13','EXTERNAL PLAYER INTELLIGENCE · V0.9.14');
fs.writeFileSync(uiPath,ui);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.13'","version:'0.9.14'").replaceAll('Camarillo Darts V0.9.13 running','Camarillo Darts V0.9.14 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.13','V0.9.14').replaceAll('Camarillo Darts Nexus 0.9.13','Camarillo Darts Nexus 0.9.14');
fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.14';
pkg.description='Camarillo Darts Nexus deterministic BullShooter-ID robustness mapping';
if(!pkg.scripts)pkg.scripts={};
const cmd='node tests/robustness-mapping-v0914.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

// V1.13.4 operational hardening: keep the authoritative TOC work queue in one
// durable Supabase checkpoint row instead of copying a 60k+ object queue into
// every audit heartbeat. This both preserves resume continuity and removes the
// write amplification that was causing statement timeouts/restart churn.
const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');
const replaceRequired=(from,to,label)=>{
  if(!toc.includes(from)) throw new Error(`V1.13.4 TOC durable checkpoint patch: ${label} anchor not found`);
  toc=toc.replace(from,to);
};

replaceRequired(
  "  const queue=Array.isArray(resumeQueue)&&resumeQueue.length?resumeQueue.map(s=>({prefix:String(s.prefix),depth:Number(s.depth)||String(s.prefix).length})):(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));",
  "  const queue=Array.isArray(resumeQueue)&&resumeQueue.length?resumeQueue.map(s=>{const prefix=String(typeof s==='string'?s:(s?.prefix??''));return {prefix,depth:Number(s?.depth)||prefix.length}}).filter(s=>s.prefix):(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));",
  'compact resume queue support'
);

replaceRequired(
  "resumeQueue:Array.isArray(p.queueSnapshot)?p.queueSnapshot:[]}",
  "resumeQueue:Array.isArray(p.queueSnapshot)?p.queueSnapshot.slice(0,3).map(s=>String(typeof s==='string'?s:(s?.prefix??''))):[],resumeQueueLength:p.queuedShards||0}",
  'lightweight audit checkpoint'
);

replaceRequired(
  "return{records:[...records.values()],pages:shardsProcessed,rowsSeen,uniqueRows:records.size,complete:failedShards.length===0,searchTerm:'sharded',strategy:TOC_SYNC_STRATEGY,shardsProcessed,splitShards,persistedRows,failedShards};",
  "return{records:[...records.values()],pages:shardsProcessed,rowsSeen,uniqueRows:records.size,complete:failedShards.length===0,searchTerm:'sharded',strategy:TOC_SYNC_STRATEGY,shardsProcessed,splitShards,persistedRows,failedShards,resumeQueue:failedShards.map(f=>({prefix:String(f.prefix||''),depth:String(f.prefix||'').length})).filter(s=>s.prefix)};",
  'failed shard retry queue'
);

const startMarker='export async function startTocSync(){';
if(!toc.includes(startMarker)) throw new Error('V1.13.4 TOC durable checkpoint patch: startTocSync marker not found');
const helpers=`const TOC_DURABLE_CHECKPOINT_SOURCE='dartstoc-best-known';\nconst TOC_DURABLE_CHECKPOINT_EVERY=Math.max(100,Math.min(5000,Number(process.env.TOC_DURABLE_CHECKPOINT_EVERY)||500));\nconst TOC_ADMIN_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');\n\nasync function tocCheckpointFetch(resource,{method='GET',body,attempt=1}={}){\n  if(!REMOTE||!TOC_ADMIN_KEY)throw new Error('TOC durable checkpoint requires SUPABASE_SERVICE_ROLE_KEY.');\n  const url=\`\${SUPABASE_URL}/rest/v1/\${resource}\`;\n  try{\n    const res=await fetch(url,{method,headers:{apikey:TOC_ADMIN_KEY,authorization:\`Bearer \${TOC_ADMIN_KEY}\`,'content-type':'application/json',accept:'application/json',prefer:'resolution=merge-duplicates,return=minimal'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(30000,REQUEST_TIMEOUT_MS))});\n    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}\n    if(!res.ok)throw new Error(\`TOC checkpoint \${method} \${res.status}: \${data?.message||data?.error||text||'Unknown error'}\`);\n    return {data,res};\n  }catch(error){\n    if(attempt>=2)throw error;\n    await sleep(750);\n    return tocCheckpointFetch(resource,{method,body,attempt:attempt+1});\n  }\n}\n\nfunction compactTocResumeQueue(queue=[]){\n  return (Array.isArray(queue)?queue:[]).map(s=>String(typeof s==='string'?s:(s?.prefix??''))).filter(Boolean);\n}\n\nasync function loadTocDurableCheckpoint(){\n  if(!REMOTE||!TOC_ADMIN_KEY)return null;\n  const {data}=await tocCheckpointFetch(\`camarillo_toc_sync_checkpoint?source=eq.\${encodeURIComponent(TOC_DURABLE_CHECKPOINT_SOURCE)}&select=*&limit=1\`);\n  const row=Array.isArray(data)?data[0]||null:null;\n  const resumeQueue=Array.isArray(row?.resume_queue)?row.resume_queue:[];\n  return row&&resumeQueue.length?{...row,resumeQueue}:null;\n}\n\nasync function saveTocDurableCheckpoint(owner,p={},force=false){\n  if(!REMOTE||!TOC_ADMIN_KEY)return false;\n  const page=Number(p.page||p.shardsProcessed||0);\n  if(!force&&page!==1&&page%TOC_DURABLE_CHECKPOINT_EVERY!==0)return false;\n  const resumeQueue=compactTocResumeQueue(p.queueSnapshot||p.resumeQueue||[]);\n  await tocCheckpointFetch('camarillo_toc_sync_checkpoint?on_conflict=source',{method:'POST',body:{source:TOC_DURABLE_CHECKPOINT_SOURCE,owner:String(owner||''),strategy:TOC_SYNC_STRATEGY,resume_queue:resumeQueue,pages:page,rows_seen:Number(p.totalSeen||p.rowsSeen||0),unique_rows:Number(p.uniqueRows||0),persisted_rows:Number(p.persistedRows||0),queued_shards:resumeQueue.length,failed_shards:Number(p.failedShards||0),heartbeat:now(),updated_at:now()}});\n  return true;\n}\n\nasync function clearTocDurableCheckpoint(owner){\n  if(!REMOTE||!TOC_ADMIN_KEY)return false;\n  await tocCheckpointFetch(\`camarillo_toc_sync_checkpoint?source=eq.\${encodeURIComponent(TOC_DURABLE_CHECKPOINT_SOURCE)}\`,{method:'PATCH',body:{owner:String(owner||''),resume_queue:[],queued_shards:0,failed_shards:0,heartbeat:now(),updated_at:now()}});\n  return true;\n}\n\n`;
toc=toc.replace(startMarker,helpers+startMarker);

replaceRequired(
  "if(!(await acquireTocAtomicLease(runId)))throw new Error('TOC atomic sync lease lost during crawl checkpoint.');",
  "if(!(await acquireTocAtomicLease(runId)))throw new Error('TOC atomic sync lease lost during crawl checkpoint.');await saveTocDurableCheckpoint(runId,p).catch(()=>{});",
  'durable checkpoint progress hook'
);

replaceRequired(
  "  const previous=await lastRun().catch(()=>null);\n  const resumeQueue=Array.isArray(previous?.metadata?.resumeQueue)?previous.metadata.resumeQueue:null;",
  "  const previous=await lastRun().catch(()=>null);\n  let resumeQueue=Array.isArray(previous?.metadata?.resumeQueue)?previous.metadata.resumeQueue:null;\n  const durableCheckpoint=await loadTocDurableCheckpoint().catch(()=>null);\n  if(Array.isArray(durableCheckpoint?.resumeQueue)&&durableCheckpoint.resumeQueue.length)resumeQueue=durableCheckpoint.resumeQueue;\n  else if(!Array.isArray(resumeQueue)||resumeQueue.length<1000)resumeQueue=null;",
  'durable checkpoint startup selection'
);

const finalRunAnchor="    run={...run,pages:crawl.pages,rowsSeen:crawl.rowsSeen,uniqueRows:crawl.uniqueRows,status:crawl.complete?'success':'partial',metadata:{...run.metadata,complete:crawl.complete,strategy:crawl.strategy||TOC_SYNC_STRATEGY,shardsProcessed:crawl.shardsProcessed||crawl.pages,splitShards:crawl.splitShards||0,persistedRows:crawl.persistedRows||0,failedShards:crawl.failedShards||[],resumeQueue:[],lastProgressAt:now()}};";
replaceRequired(
  finalRunAnchor,
  "    if(crawl.complete)await clearTocDurableCheckpoint(runId).catch(()=>{});else await saveTocDurableCheckpoint(runId,{page:crawl.pages,totalSeen:crawl.rowsSeen,uniqueRows:crawl.uniqueRows,persistedRows:crawl.persistedRows,failedShards:(crawl.failedShards||[]).length,resumeQueue:crawl.resumeQueue||[]},true).catch(()=>{});\n"+finalRunAnchor,
  'final durable checkpoint handling'
);

fs.writeFileSync(tocPath,toc);
