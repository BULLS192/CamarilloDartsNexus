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

// The legacy unfiltered Best-Known crawl depends on one long ASP.NET WebForms
// pagination session. TOC intermittently returns HTTP 500 during that pagination,
// which previously aborted the run and forced the next run back to page 1.
// Replace the background crawl with deterministic prefix shards. Dense shards are
// recursively split; a failed shard is isolated and recorded so every successful
// shard can still be persisted in the same partial run.
let toc=fs.readFileSync(tocPath,'utf8');
const remoteAnchor='function remoteHeaders(extra={}){';
if(!toc.includes(remoteAnchor))throw new Error('V0.9.13 patch: TOC remote header anchor not found');
if(!toc.includes('crawlBestKnownSharded')){
  const shardCode=`const TOC_SYNC_STRATEGY='prefix-shards-v1';\nconst TOC_SHARD_ROOTS=[...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',\"'\",'-','.','#','@','&'];\nconst TOC_SHARD_SPLIT_CHARS=[' ',...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',\"'\",'-','.','&'];\nconst TOC_SHARD_MAX_DEPTH=Math.max(4,Math.min(16,Number(process.env.TOC_SHARD_MAX_DEPTH)||12));\n\nasync function fetchTocShard(prefix){\n  const session=new WebFormsSession();\n  let html=await session.get();\n  html=await session.post(html,'ctl00$ContentPlaceHolder1$txtSearch','',\`\${prefix}%\`);\n  return html;\n}\n\nexport async function crawlBestKnownSharded({prefixes=TOC_SHARD_ROOTS,maxDepth=TOC_SHARD_MAX_DEPTH,onProgress=()=>{}}={}){\n  const queue=(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));\n  const records=new Map(),failedShards=[];\n  let rowsSeen=0,shardsProcessed=0,splitShards=0;\n  while(queue.length){\n    const shard=queue.shift();let html;\n    try{html=await fetchTocShard(shard.prefix)}catch(error){\n      failedShards.push({prefix:shard.prefix,error:error.message||String(error)});shardsProcessed++;\n      await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,pageRows:0,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:false});\n      await sleep(PAGE_DELAY_MS);continue;\n    }\n    const rows=parseBestKnownRows(html,shardsProcessed+1).filter(r=>r.playerName!=='...');rowsSeen+=rows.length;\n    for(const row of rows)records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));\n    const pager=parsePagerPages(html),saturated=pager.some(n=>n>1)||rows.length>=PAGE_SIZE_HINT;\n    if(saturated&&shard.depth<maxDepth){splitShards++;for(const ch of TOC_SHARD_SPLIT_CHARS)queue.push({prefix:shard.prefix+ch,depth:shard.depth+1})}\n    else if(saturated){\n      try{const paged=await crawlBestKnown({searchTerm:\`\${shard.prefix}%\`,maxPages:MAX_PAGES});rowsSeen+=paged.rowsSeen;for(const row of paged.records)records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));if(!paged.complete)failedShards.push({prefix:shard.prefix,error:'Shard reached paging limit before completion'})}\n      catch(error){failedShards.push({prefix:shard.prefix,error:error.message||String(error)})}\n    }\n    shardsProcessed++;await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,pageRows:rows.length,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:saturated});\n    while(true){const activeUntil=Number(process.env.TOC_USER_ACTIVE_UNTIL)||0;if(activeUntil<=Date.now())break;await sleep(Math.min(5000,Math.max(250,activeUntil-Date.now())))}\n    await sleep(PAGE_DELAY_MS);\n  }\n  return{records:[...records.values()],pages:shardsProcessed,rowsSeen,uniqueRows:records.size,complete:failedShards.length===0,searchTerm:'sharded',strategy:TOC_SYNC_STRATEGY,shardsProcessed,splitShards,failedShards};\n}\n\n`;
  toc=toc.replace(remoteAnchor,shardCode+remoteAnchor);
}
const crawlAnchor='const crawl=await crawlBestKnown({onProgress:async p=>{';
if(!toc.includes(crawlAnchor))throw new Error('V0.9.13 patch: TOC runSync crawl anchor not found');
toc=toc.replace(crawlAnchor,'const crawl=await crawlBestKnownSharded({onProgress:async p=>{');
const metaAnchor='metadata:{...run.metadata,complete:crawl.complete}';
if(!toc.includes(metaAnchor))throw new Error('V0.9.13 patch: TOC run metadata anchor not found');
toc=toc.replace(metaAnchor,"metadata:{...run.metadata,complete:crawl.complete,strategy:crawl.strategy||TOC_SYNC_STRATEGY,shardsProcessed:crawl.shardsProcessed||crawl.pages,splitShards:crawl.splitShards||0,failedShards:crawl.failedShards||[]}");
fs.writeFileSync(tocPath,toc);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.13';
pkg.description='Camarillo Darts Nexus safe player identity aliases, manual raw linking and failure-isolated TOC sync';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v0912-identity.js','node tests/identity-observer-v0913.test.js']){
  if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
