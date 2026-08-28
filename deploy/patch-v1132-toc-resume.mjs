import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

const sig="export async function crawlBestKnownSharded({prefixes=TOC_SHARD_ROOTS,maxDepth=TOC_SHARD_MAX_DEPTH,onProgress=()=>{}}={}){";
if(!toc.includes(sig)) throw new Error('TOC resume patch: crawler signature not found');
toc=toc.replace(sig,"export async function crawlBestKnownSharded({prefixes=TOC_SHARD_ROOTS,maxDepth=TOC_SHARD_MAX_DEPTH,onProgress=()=>{},resumeQueue=null}={}){");

const queueLine="  const queue=(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));";
if(!toc.includes(queueLine)) throw new Error('TOC resume patch: queue anchor not found');
toc=toc.replace(queueLine,"  const queue=Array.isArray(resumeQueue)&&resumeQueue.length?resumeQueue.map(s=>({prefix:String(s.prefix),depth:Number(s.depth)||String(s.prefix).length})):(Array.isArray(prefixes)?prefixes:TOC_SHARD_ROOTS).map(prefix=>({prefix:String(prefix),depth:String(prefix).length}));");

const progress1="await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,persistedRows,pageRows:0,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:false});";
if(!toc.includes(progress1)) throw new Error('TOC resume patch: failure progress anchor not found');
toc=toc.replace(progress1,"await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,queueSnapshot:queue,splitShards,failedShards:failedShards.length,persistedRows,pageRows:0,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:false});");

const progress2="shardsProcessed++;await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,splitShards,failedShards:failedShards.length,persistedRows,pageRows:rows.length,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:saturated});";
if(!toc.includes(progress2)) throw new Error('TOC resume patch: success progress anchor not found');
toc=toc.replace(progress2,"shardsProcessed++;await onProgress({page:shardsProcessed,shardsProcessed,queuedShards:queue.length,queueSnapshot:queue,splitShards,failedShards:failedShards.length,persistedRows,pageRows:rows.length,totalSeen:rowsSeen,uniqueRows:records.size,prefix:shard.prefix,hasNext:saturated});");

const crawlCall="const crawl=await crawlBestKnownSharded({onProgress:async p=>{";
if(!toc.includes(crawlCall)) throw new Error('TOC resume patch: crawl invocation anchor not found');
toc=toc.replace(crawlCall,"const previousRun=await lastRun().catch(()=>null);\n    const resumeQueue=Array.isArray(previousRun?.metadata?.resumeQueue)?previousRun.metadata.resumeQueue:null;\n    const crawl=await crawlBestKnownSharded({resumeQueue,onProgress:async p=>{");

const checkpoint="metadata:{...run.metadata,checkpoint:true,strategy:TOC_SYNC_STRATEGY,lastProgressAt:now(),persistedRows:p.persistedRows||0,queuedShards:p.queuedShards||0,failedShards:p.failedShards||0}";
if(!toc.includes(checkpoint)) throw new Error('TOC resume patch: checkpoint metadata anchor not found');
toc=toc.replace(checkpoint,"metadata:{...run.metadata,checkpoint:true,strategy:TOC_SYNC_STRATEGY,lastProgressAt:now(),persistedRows:p.persistedRows||0,queuedShards:p.queuedShards||0,failedShards:p.failedShards||0,resumeQueue:Array.isArray(p.queueSnapshot)?p.queueSnapshot:[]}");

const staleMeta="metadata:{...(previous.metadata||{}),stale:true,staleDetectedAt:now()}";
if(!toc.includes(staleMeta)) throw new Error('TOC resume patch: stale metadata anchor not found');
toc=toc.replace(staleMeta,"metadata:{...(previous.metadata||{}),stale:true,staleDetectedAt:now(),resumeQueue:Array.isArray(previous?.metadata?.resumeQueue)?previous.metadata.resumeQueue:[]}");

fs.writeFileSync(tocPath,toc);
