import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const edcPath=fs.existsSync('/app/src/edc.js')?'/app/src/edc.js':'src/edc.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let server=fs.readFileSync(serverPath,'utf8');
let toc=fs.readFileSync(tocPath,'utf8');
let edc=fs.readFileSync(edcPath,'utf8');

const replaceRequired=(text,from,to,label)=>{
  if(!text.includes(from))throw new Error(`V0.9.5 performance patch: ${label} anchor not found`);
  return text.replace(from,to);
};

server=replaceRequired(
  server,
  "const EDC_BACKGROUND_SYNC_MS=Math.max(5*60_000,Number(process.env.EDC_BACKGROUND_SYNC_MS)||10*60_000);",
  "const EDC_BACKGROUND_SYNC_MS=Math.max(60*60_000,Number(process.env.EDC_BACKGROUND_SYNC_MS)||24*60*60_000);",
  'EDC schedule constants'
);

edc=replaceRequired(
  edc,
  "const CACHE_MS=Math.max(60_000,Number(process.env.EDC_CACHE_MS)||10*60_000);",
  "const CACHE_MS=Math.max(60*60_000,Number(process.env.EDC_CACHE_MS)||24*60*60_000);",
  'EDC source cache duration'
);
fs.writeFileSync(edcPath,edc);

server=replaceRequired(
  server,
  "const TOC_BACKGROUND_SYNC_MS=Math.max(60*60_000,Number(process.env.TOC_BACKGROUND_SYNC_MS)||6*60*60_000);",
  "const TOC_BACKGROUND_SYNC_MS=Math.max(6*60*60_000,Number(process.env.TOC_BACKGROUND_SYNC_MS)||24*60*60_000);\nconst TOC_IDLE_BEFORE_SYNC_MS=Math.max(60_000,Number(process.env.TOC_IDLE_BEFORE_SYNC_MS)||5*60_000);\nconst TOC_BACKGROUND_CHECK_MS=Math.max(60_000,Number(process.env.TOC_BACKGROUND_CHECK_MS)||5*60_000);\nlet lastInteractiveActivityAt=Date.now();",
  'TOC schedule constants'
);

const refreshRe=/async function refreshTocBackground\(\)\{[\s\S]*?\n\}\nfunction startBackgroundSourceSync\(\)\{/;
if(!refreshRe.test(server))throw new Error('V0.9.5 performance patch: refreshTocBackground block not found');
server=server.replace(refreshRe,`async function refreshTocBackground({force=false}={}){
  const idleFor=Date.now()-lastInteractiveActivityAt;
  if(!force&&idleFor<TOC_IDLE_BEFORE_SYNC_MS){
    sourceSyncState.toc.deferredUntil=new Date(lastInteractiveActivityAt+TOC_IDLE_BEFORE_SYNC_MS).toISOString();
    sourceSyncState.toc.deferReason='Nexus is in active use';
    return {deferred:true,reason:sourceSyncState.toc.deferReason};
  }
  let status=null;
  try{status=await tocStatus()}catch{}
  const last=status?.lastRun||null;
  const lastFinished=Date.parse(last?.finished_at||last?.finishedAt||'');
  if(!force&&last?.status==='success'&&Number.isFinite(lastFinished)&&Date.now()-lastFinished<TOC_BACKGROUND_SYNC_MS){
    sourceSyncState.toc.deferredUntil=new Date(lastFinished+TOC_BACKGROUND_SYNC_MS).toISOString();
    sourceSyncState.toc.deferReason='TOC cache is still fresh';
    return {deferred:true,reason:sourceSyncState.toc.deferReason};
  }
  sourceSyncState.toc.lastTriggeredAt=new Date().toISOString();sourceSyncState.toc.error=null;sourceSyncState.toc.deferredUntil=null;sourceSyncState.toc.deferReason=null;
  try{const out=await startTocSync();sourceSyncState.toc.lastRunId=out.runId||sourceSyncState.toc.lastRunId||null;if(out.alreadyRunning)console.log('[TOC] background refresh skipped: sync already running');else console.log('[TOC] background refresh started: '+(out.runId||'run'));return out}
  catch(error){sourceSyncState.toc.error=error.message||String(error);console.error('[TOC] background refresh failed to start:',sourceSyncState.toc.error);return{error:sourceSyncState.toc.error}}
}
function startBackgroundSourceSync(){`);

const startRe=/function startBackgroundSourceSync\(\)\{[\s\S]*?\n\}\nasync function sourceSyncStatus\(\)\{/;
if(!startRe.test(server))throw new Error('V0.9.5 performance patch: startBackgroundSourceSync block not found');
server=server.replace(startRe,`function startBackgroundSourceSync(){
  sourceSyncState.startedAt=new Date().toISOString();
  const tocStartup=setTimeout(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocStartup.unref?.();
  const edcTimer=setInterval(()=>void refreshEdcBackground(),EDC_BACKGROUND_SYNC_MS);edcTimer.unref?.();
  const tocCheckTimer=setInterval(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocCheckTimer.unref?.();
  console.log('[Sources] background sync active: EDC '+Math.round(EDC_BACKGROUND_SYNC_MS/3_600_000)+'h with no startup download; TOC freshness '+Math.round(TOC_BACKGROUND_SYNC_MS/3_600_000)+'h; idle gate '+Math.round(TOC_IDLE_BEFORE_SYNC_MS/60_000)+'m');
}
async function sourceSyncStatus(){`);

server=replaceRequired(
  server,
  "intervals:{edcMs:EDC_BACKGROUND_SYNC_MS,tocMs:TOC_BACKGROUND_SYNC_MS}",
  "intervals:{edcMs:EDC_BACKGROUND_SYNC_MS,tocMs:TOC_BACKGROUND_SYNC_MS,tocCheckMs:TOC_BACKGROUND_CHECK_MS,tocIdleMs:TOC_IDLE_BEFORE_SYNC_MS}",
  'source status intervals'
);

const requestAnchor="const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);";
server=replaceRequired(server,requestAnchor,requestAnchor+"\n  if(url.pathname.startsWith('/api/')&&!['/api/toc/status','/api/source-sync/status'].includes(url.pathname)){lastInteractiveActivityAt=Date.now();process.env.TOC_USER_ACTIVE_UNTIL=String(Date.now()+60_000)}",'interactive request activity gate');

// Once a background crawl is running, yield between pages whenever a real Nexus API
// interaction has recently occurred. This makes the web app win over the crawler.
toc=replaceRequired(
  toc,
  "    await sleep(PAGE_DELAY_MS);\n    html=await session.post(html,'ctl00$ContentPlaceHolder1$GridBestKnownOverall',`Page$${page}`,searchTerm);",
  "    while(true){const activeUntil=Number(process.env.TOC_USER_ACTIVE_UNTIL)||0;if(activeUntil<=Date.now())break;await sleep(Math.min(5000,Math.max(250,activeUntil-Date.now())))}\n    await sleep(PAGE_DELAY_MS);\n    html=await session.post(html,'ctl00$ContentPlaceHolder1$GridBestKnownOverall',`Page$${page}`,searchTerm);",
  'interactive crawl yielding'
);

toc=replaceRequired(toc,"if(p.page===1||p.page%25===0)","if(p.page===1||p.page%100===0)",'lighter checkpoint cadence');
toc=replaceRequired(toc,"const VERSION='0.9.4';","const VERSION='0.9.5';",'TOC version');
fs.writeFileSync(tocPath,toc);

server=server.replaceAll("version:'0.9.4'","version:'0.9.5'").replaceAll('Camarillo Darts V0.9.4 running','Camarillo Darts V0.9.5 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.4','V0.9.5').replaceAll('Camarillo Darts Nexus 0.9.4','Camarillo Darts Nexus 0.9.5');
fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.5';
pkg.description='Camarillo Darts Nexus responsive multi-source player intelligence with idle-gated background source refresh';
const additions=['node tests/performance-v095.test.js'];let check=String(pkg.scripts?.check||'');for(const cmd of additions)if(!check.includes(cmd))check+=(check?' && ':'')+cmd;if(!pkg.scripts)pkg.scripts={};pkg.scripts.check=check;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
