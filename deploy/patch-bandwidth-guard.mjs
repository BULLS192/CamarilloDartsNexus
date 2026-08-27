import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const edcPath=fs.existsSync('/app/src/edc.js')?'/app/src/edc.js':'src/edc.js';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

const replaceRequired=(text,from,to,label)=>{
  if(!text.includes(from))throw new Error(`Bandwidth guard: ${label} anchor not found`);
  return text.replace(from,to);
};

let server=fs.readFileSync(serverPath,'utf8');
server=replaceRequired(
  server,
  "const EDC_BACKGROUND_SYNC_MS=Math.max(5*60_000,Number(process.env.EDC_BACKGROUND_SYNC_MS)||10*60_000);",
  "const EDC_BACKGROUND_SYNC_MS=Math.max(60*60_000,Number(process.env.EDC_BACKGROUND_SYNC_MS)||24*60*60_000);",
  'EDC background interval'
);
server=replaceRequired(
  server,
  "  const edcStartup=setTimeout(()=>void refreshEdcBackground(),2_000);edcStartup.unref?.();\n  const tocStartup=setTimeout(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocStartup.unref?.();",
  "  const tocStartup=setTimeout(()=>void refreshTocBackground(),TOC_BACKGROUND_CHECK_MS);tocStartup.unref?.();",
  'EDC startup refresh removal'
);
server=replaceRequired(
  server,
  "try{const d=await loadEdcDataset({force:true});const linked=await refreshConfirmedEdcLinks(d);",
  "try{const d=await loadEdcDataset({force:false});const linked=await refreshConfirmedEdcLinks(d);",
  'EDC forced background download'
);
server=server.replace(
  "console.log('[Sources] background sync active: EDC '+Math.round(EDC_BACKGROUND_SYNC_MS/60_000)+'m; TOC freshness '+Math.round(TOC_BACKGROUND_SYNC_MS/3_600_000)+'h; idle gate '+Math.round(TOC_IDLE_BEFORE_SYNC_MS/60_000)+'m');",
  "console.log('[Sources] background sync active: EDC '+Math.round(EDC_BACKGROUND_SYNC_MS/3_600_000)+'h (no startup download); TOC freshness '+Math.round(TOC_BACKGROUND_SYNC_MS/3_600_000)+'h; idle gate '+Math.round(TOC_IDLE_BEFORE_SYNC_MS/60_000)+'m');"
);
fs.writeFileSync(serverPath,server);

let edc=fs.readFileSync(edcPath,'utf8');
edc=replaceRequired(
  edc,
  "const CACHE_MS=Math.max(60_000,Number(process.env.EDC_CACHE_MS)||10*60_000);",
  "const CACHE_MS=Math.max(60*60_000,Number(process.env.EDC_CACHE_MS)||24*60*60_000);",
  'EDC cache duration'
);
fs.writeFileSync(edcPath,edc);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
const checkCmd='node tests/bandwidth-guard.test.js';
if(!String(pkg.scripts?.check||'').includes(checkCmd)){
  if(!pkg.scripts)pkg.scripts={};
  pkg.scripts.check=String(pkg.scripts.check||'')+(pkg.scripts.check?' && ':'')+checkCmd;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
