import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.12'","version:'0.9.13'").replaceAll('Camarillo Darts V0.9.12 running','Camarillo Darts V0.9.13 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.12','V0.9.13').replaceAll('Camarillo Darts Nexus 0.9.12','Camarillo Darts Nexus 0.9.13');
fs.writeFileSync(indexPath,html);

let ui=fs.readFileSync(playerUiPath,'utf8');
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.12','EXTERNAL PLAYER INTELLIGENCE · V0.9.13');
fs.writeFileSync(playerUiPath,ui);

let toc=fs.readFileSync(tocPath,'utf8');
const remoteAnchor='function remoteHeaders(extra={}){';
if(!toc.includes(remoteAnchor))throw new Error('V0.9.13 patch: TOC remote header anchor not found');
if(!toc.includes('crawlBestKnownSharded')){
  const shardCode=`const TOC_SYNC_STRATEGY='prefix-shards-v3-resumable';\nconst TOC_SHARD_ROOTS=[...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',\"'\",'-','.','#','@','&'];\nconst TOC_SHARD_SPLIT_CHARS=[' ',...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',\"'\",'-','.','&'];\nconst TOC_SHARD_MAX_DEPTH=Math.max(4,Math.min(16,Number(process.env.TOC_SHARD_MAX_DEPTH)||12));\nconst TOC_REMOTE_LEASE_MS=Math.max(5*60_000,Number(process.env.TOC_REMOTE_LEASE_MS)||15*60_000);\n\nasync function fetchTocShard(prefix){\n  const session=new WebFormsSession();\n  let html=await session.get();\n  html=await session.post(html,'ctl00$ContentPlaceHolder1$txtSearch','',\`\${prefix}%\`);\n  return html;\n}\n\nasync function persistTocRowsIncremental(rows,seenAt=now()){\n  if(!Array.isArray(rows)||!rows.length)return 0;\n  const unique=new Map();\n  for(const row of rows){\n    if(!row?.tocId||!row?.playerName||row.playerName==='...')continue;\n    unique.set(row.tocId,chooseBetterRecord(unique.get(row.tocId),row));\n  }\n  const deduped=[...unique.values()];\n  if(!deduped.length)return 0;\n  if(REMOTE){\n    for(let i=0;i<deduped.length;i+=100){\n      const batch=deduped.slice(i,i+100).map(r=>toRemotePlayer(r,seenAt));\n      await remoteFetch('camarillo_toc_players?on_conflict=toc_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:batch});\n    }\n    return deduped.length;\n  }\n  const db=await readLocal(),by=new Map((db.players||[]).map(r=>[r.tocId,r]));\n  for(const r of deduped)by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});\n  db.players=[...by.values()];await writeLocal(db);return deduped.length;\n}\n\nexport async function crawlBestKnownSharded({prefixes=TOC_SHARD_ROOTS,maxDepth=TOC_SHARD_MAX_DEPTH,onProgress=()=>{},resumeQueue=null}={}){\n  const queue=Array.isArray(resumeQueue)&&resumeQueue.length?resumeQueue.map(s=>({prefix:String(s.prefix),depth:Number(s.depth)||String(s.prefix).length})):(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));\n  const records=new Map(),failedShards=[];\n  let rowsSeen=0,shardsProcessed=0,splitShards=0,persistedRows=0;\n  while(queue.length){\n    const shard=queue.shift();let html;\n    try{html=await fetchTocShard(shard.prefix)}catch(error){\n      failedShards.push({prefix:shard.prefix,error:error.message||String(error)});shardsProcessed++;\n      await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,queueSnapshot:queue,splitShards,failedShards:failedShards.length,persistedRows,pageRows:0,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:false});\n      await sleep(PAGE_DELAY_MS);continue;\n    }\n    const rows=parseBestKnownRows(html,shardsProcessed+1).filter(r=>r.playerName!=='...');rowsSeen+=rows.length;\n    for(const row of rows)records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));\n    const pager=parsePagerPages(html),saturated=pager.some(n=>n>1)||rows.length>=PAGE_SIZE_HINT;\n    if(saturated&&shard.depth<maxDepth){splitShards++;for(const ch of TOC_SHARD_SPLIT_CHARS)queue.push({prefix:shard.prefix+ch,depth:shard.depth+1})}\n    else if(saturated){\n      try{const paged=await crawlBestKnown({searchTerm:\`\${shard.prefix}%\`,maxPages:MAX_PAGES});rowsSeen+=paged.rowsSeen;for(const row of paged.records)records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));persistedRows+=await persistTocRowsIncremental(paged.records);if(!paged.complete)failedShards.push({prefix:shard.prefix,error:'Shard reached paging limit before completion'})}\n      catch(error){failedShards.push({prefix:shard.prefix,error:error.message||String(error)})}\n    }else{persistedRows+=await persistTocRowsIncremental(rows)}\n    shardsProcessed++;await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,queueSnapshot:queue,splitShards,failedShards:failedShards.length,persistedRows,pageRows:rows.length,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:saturated});\n    while(true){const activeUntil=Number(process.env.TOC_USER_ACTIVE_UNTIL)||0;if(activeUntil<=Date.now())break;await sleep(Math.min(5000,Math.max(250,activeUntil-Date.now())))}\n    await sleep(PAGE_DELAY_MS);\n  }\n  return{records:[...records.values()],pages:shardsProcessed,rowsSeen,uniqueRows:records.size,complete:failedShards.length===0,searchTerm:'sharded',strategy:TOC_SYNC_STRATEGY,shardsProcessed,splitShards,persistedRows,failedShards};\n}\n\n`;
  toc=toc.replace(remoteAnchor,shardCode+remoteAnchor);
}
const crawlAnchor='const crawl=await crawlBestKnown({onProgress:async p=>{';
if(!toc.includes(crawlAnchor))throw new Error('V0.9.13 patch: TOC runSync crawl anchor not found');
toc=toc.replace(crawlAnchor,"const previousRun=await lastRun().catch(()=>null);\n    const resumeQueue=Array.isArray(previousRun?.metadata?.resumeQueue)?previousRun.metadata.resumeQueue:null;\n    const crawl=await crawlBestKnownSharded({resumeQueue,onProgress:async p=>{");
const checkpointAnchor="metadata:{...run.metadata,checkpoint:true}";
if(toc.includes(checkpointAnchor))toc=toc.replace(checkpointAnchor,"metadata:{...run.metadata,checkpoint:true,strategy:TOC_SYNC_STRATEGY,lastProgressAt:now(),persistedRows:p.persistedRows||0,queuedShards:p.queuedShards||0,failedShards:p.failedShards||0,resumeQueue:Array.isArray(p.queueSnapshot)?p.queueSnapshot:[]}");
const metaAnchor='metadata:{...run.metadata,complete:crawl.complete}';
if(!toc.includes(metaAnchor))throw new Error('V0.9.13 patch: TOC run metadata anchor not found');
toc=toc.replace(metaAnchor,"metadata:{...run.metadata,complete:crawl.complete,strategy:crawl.strategy||TOC_SYNC_STRATEGY,shardsProcessed:crawl.shardsProcessed||crawl.pages,splitShards:crawl.splitShards||0,persistedRows:crawl.persistedRows||0,failedShards:crawl.failedShards||[],resumeQueue:[],lastProgressAt:now()}");

const startAnchor=`export async function startTocSync(){\n  if(syncJob.running) return {...syncJob,alreadyRunning:true};\n  const runId=shortId('tocrun',\`${'${Date.now()}|${crypto.randomUUID()}'}\`);\n  void runSync(runId);\n  return {running:true,runId,status:'starting'};\n}`;
if(!toc.includes(startAnchor))throw new Error('V0.9.13 patch: startTocSync anchor not found');
const leaseStart=`export async function startTocSync(){\n  if(syncJob.running) return {...syncJob,alreadyRunning:true};\n  const previous=await lastRun().catch(()=>null);\n  if(previous?.status==='running'){\n    const heartbeat=Date.parse(previous?.metadata?.lastProgressAt||previous?.started_at||previous?.startedAt||'');\n    if(Number.isFinite(heartbeat)&&Date.now()-heartbeat<TOC_REMOTE_LEASE_MS){\n      return {running:true,runId:previous.run_id||previous.runId||null,status:'running',alreadyRunning:true,remoteLease:true,lastProgressAt:previous?.metadata?.lastProgressAt||null};\n    }\n    if(REMOTE&&(previous.run_id||previous.runId)){\n      const staleId=previous.run_id||previous.runId;\n      await remoteFetch(\`camarillo_external_sync_runs?run_id=eq.\${encodeURIComponent(staleId)}\`,{method:'PATCH',headers:{prefer:'return=minimal'},body:{status:'error',finished_at:now(),error:'Stale TOC sync lease expired; superseded by a new worker.',metadata:{...(previous.metadata||{}),stale:true,staleDetectedAt:now(),resumeQueue:Array.isArray(previous?.metadata?.resumeQueue)?previous.metadata.resumeQueue:[]}}}).catch(()=>{});\n    }\n  }\n  const runId=shortId('tocrun',\`${'${Date.now()}|${crypto.randomUUID()}'}\`);\n  void runSync(runId);\n  return {running:true,runId,status:'starting'};\n}`;
toc=toc.replace(startAnchor,leaseStart);
fs.writeFileSync(tocPath,toc);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.13';
pkg.description='Camarillo Darts Nexus progressive resumable TOC shard persistence with restart-safe sync leasing';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v0912-identity.js','node tests/identity-observer-v0913.test.js']){
  if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
