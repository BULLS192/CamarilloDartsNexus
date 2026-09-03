import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');

const addAfter=(needle,addition,label)=>{
  if(!server.includes(needle)) throw new Error(`V0.11.4 usage guard: ${label} anchor not found`);
  if(!server.includes(addition.trim())) server=server.replace(needle,needle+addition);
};

addAfter(
  'let lastInteractiveActivityAt=Date.now();',
  "\nconst TOC_BACKGROUND_ENABLED=String(process.env.TOC_BACKGROUND_ENABLED||'true').toLowerCase()!=='false';\nconst EDC_BACKGROUND_ENABLED=String(process.env.EDC_BACKGROUND_ENABLED||'true').toLowerCase()!=='false';",
  'background enable constants'
);

const tocStartup="const tocStartup=setTimeout(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocStartup.unref?.();";
const edcTimer="const edcTimer=setInterval(()=>void refreshEdcBackground(),EDC_BACKGROUND_SYNC_MS);edcTimer.unref?.();";
const tocTimer="const tocCheckTimer=setInterval(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocCheckTimer.unref?.();";

if(!server.includes(tocStartup) || !server.includes(edcTimer) || !server.includes(tocTimer)){
  throw new Error('V0.11.4 usage guard: background timer anchors not found');
}
server=server.replace(tocStartup,`if(TOC_BACKGROUND_ENABLED){${tocStartup}}`);
server=server.replace(edcTimer,`if(EDC_BACKGROUND_ENABLED){${edcTimer}}`);
server=server.replace(tocTimer,`if(TOC_BACKGROUND_ENABLED){${tocTimer}}`);

server=server.replace(
  "console.log('[Sources] background sync active: EDC '+Math.round(EDC_BACKGROUND_SYNC_MS/3_600_000)+'h with no startup download; TOC freshness '+Math.round(TOC_BACKGROUND_SYNC_MS/3_600_000)+'h; idle gate '+Math.round(TOC_IDLE_BEFORE_SYNC_MS/60_000)+'m');",
  "console.log('[Sources] background sync: EDC '+(EDC_BACKGROUND_ENABLED?Math.round(EDC_BACKGROUND_SYNC_MS/3_600_000)+'h':'OFF')+'; TOC '+(TOC_BACKGROUND_ENABLED?Math.round(TOC_BACKGROUND_SYNC_MS/3_600_000)+'h':'OFF')+'; idle gate '+Math.round(TOC_IDLE_BEFORE_SYNC_MS/60_000)+'m');"
);

server=server.replaceAll("version:'0.11.3'","version:'0.11.4'").replaceAll('Camarillo Darts V0.11.3 running','Camarillo Darts V0.11.4 running');
fs.writeFileSync(serverPath,server);
