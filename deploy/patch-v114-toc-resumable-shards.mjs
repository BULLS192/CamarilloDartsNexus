import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

const replaceRequired=(from,to,label)=>{
  if(!toc.includes(from)) throw new Error(`V0.11.4 patch: ${label} anchor not found`);
  toc=toc.replace(from,to);
};

const shardCode=`
// V0.11.4: failure-isolated TOC crawl. The unfiltered Best-Known grid is too large
// for one fragile ASP.NET WebForms paging session. Crawl deterministic name/vendor
// prefixes instead, recursively splitting any prefix that still fills a page. A
// failed shard is recorded and skipped so all successful shards are still persisted.
const TOC_SYNC_STRATEGY='prefix-shards-v1';
const TOC_SHARD_ROOTS=[...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',"'",'-','.','#','@','&'];
const TOC_SHARD_SPLIT_CHARS=[' ',...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',"'",'-','.','&'];
const TOC_SHARD_MAX_DEPTH=Math.max(4,Math.min(16,Number(process.env.TOC_SHARD_MAX_DEPTH)||12));

async function fetchTocShard(prefix){
  const session=new WebFormsSession();
  let html=await session.get();
  html=await session.post(html,'ctl00$ContentPlaceHolder1$txtSearch','',\`${'${prefix}'}%\`);
  return html;
}

export async function crawlBestKnownSharded({prefixes=TOC_SHARD_ROOTS,maxDepth=TOC_SHARD_MAX_DEPTH,onProgress=()=>{}}={}){
  const queue=(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));
  const records=new Map();
  const failedShards=[];
  let rowsSeen=0,shardsProcessed=0,splitShards=0;

  while(queue.length){
    const shard=queue.shift();
    let html;
    try{html=await fetchTocShard(shard.prefix)}
    catch(error){
      failedShards.push({prefix:shard.prefix,error:error.message||String(error)});
      shardsProcessed++;
      await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,pageRows:0,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:false});
      await sleep(PAGE_DELAY_MS);
      continue;
    }

    const rows=parseBestKnownRows(html,shardsProcessed+1).filter(r=>r.playerName!=='...');
    rowsSeen+=rows.length;
    for(const row of rows) records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));
    const pager=parsePagerPages(html);
    const saturated=pager.some(n=>n>1)||rows.length>=PAGE_SIZE_HINT;

    if(saturated&&shard.depth<maxDepth){
      splitShards++;
      for(const ch of TOC_SHARD_SPLIT_CHARS) queue.push({prefix:shard.prefix+ch,depth:shard.depth+1});
    }else if(saturated){
      // Extremely dense prefixes are rare (for example a very common first name).
      // Fall back to normal WebForms paging for only this small shard. If TOC rejects
      // that page, isolate the failure instead of aborting the whole directory sync.
      try{
        const paged=await crawlBestKnown({searchTerm:\`${'${shard.prefix}'}%\`,maxPages:MAX_PAGES});
        rowsSeen+=paged.rowsSeen;
        for(const row of paged.records) records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));
        if(!paged.complete) failedShards.push({prefix:shard.prefix,error:'Shard reached paging limit before completion'});
      }catch(error){failedShards.push({prefix:shard.prefix,error:error.message||String(error)})}
    }

    shardsProcessed++;
    await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,pageRows:rows.length,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:saturated});
    await sleep(PAGE_DELAY_MS);
  }

  return {records:[...records.values()],pages:shardsProcessed,rowsSeen,uniqueRows:records.size,complete:failedShards.length===0,searchTerm:'sharded',strategy:TOC_SYNC_STRATEGY,shardsProcessed,splitShards,failedShards};
}

`;

replaceRequired('function remoteHeaders(extra={}){',shardCode+'function remoteHeaders(extra={}){','sharded crawler insertion');
replaceRequired('const crawl=await crawlBestKnown({onProgress:async p=>{','const crawl=await crawlBestKnownSharded({onProgress:async p=>{','background sync crawler');
replaceRequired("metadata:{...run.metadata,complete:crawl.complete}","metadata:{...run.metadata,complete:crawl.complete,strategy:crawl.strategy||TOC_SYNC_STRATEGY,shardsProcessed:crawl.shardsProcessed||crawl.pages,splitShards:crawl.splitShards||0,failedShards:crawl.failedShards||[]}",'run completion metadata');

fs.writeFileSync(tocPath,toc);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
const cmd='node tests/toc-sharded-v114.test.js';
if(!String(pkg.scripts?.check||'').includes(cmd))pkg.scripts.check+=` && ${cmd}`;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
