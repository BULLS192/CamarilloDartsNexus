import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v0923-robustness-applied':'.v0923-robustness-applied'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.9.23 patch: ${label} anchor not found`)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.9.23 patch: ${label} anchors not found`);
  return text.slice(0,start)+replacement+text.slice(end);
};

let store=fs.readFileSync(paths.store,'utf8');
if(!store.includes('export async function getRobustnessIndexSql(')){
  store += `\nexport async function getRobustnessIndexSql(){\n  if(!SUPABASE_URL)throw new Error('Supabase is required for robustness scoring.');\n  const res=await fetch(\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_robustness_index\`,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});\n  const body=await res.json().catch(()=>null);\n  if(!res.ok)throw new Error(\`Supabase robustness read failed (${'${res.status}'}): ${'${body?.message||body?.error||\'Unknown error\'}'}\`);\n  if(!body||typeof body!=='object'||Array.isArray(body)||!body.byBullshooterId)throw new Error('Supabase robustness RPC returned an invalid index.');\n  return body;\n}\n`;
}
fs.writeFileSync(paths.store,store);

let server=fs.readFileSync(paths.server,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.23 patch: store import not found');
if(!sm[1].includes('getRobustnessIndexSql'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},getRobustnessIndexSql\n} from './src/store.js';`);
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]),tocById=new Map();await Promise.all((links||[]).filter(l=>l.confirmed!==false).map(async l=>{const tid=String(l.tocId??l.toc_id??'');if(!tid||tocById.has(tid))return;try{const row=await getTocPlayer(tid);if(row)tocById.set(tid,row)}catch{}}));return json(res,200,robustnessIndex(players,{links,tocById}))}";
need(server,oldRoute,'V0.9.16 robustness endpoint');
server=server.replace(oldRoute,"if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const result=await getRobustnessIndexSql();return json(res,200,result)}");
server=server.replaceAll("version:'0.9.17'","version:'0.9.23'").replaceAll('Camarillo Darts V0.9.17 running','Camarillo Darts V0.9.23 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.17','EXTERNAL PLAYER INTELLIGENCE · V0.9.23');

// Legacy Player Intelligence may keep directory/tooling responsibilities, but the
// SQL-backed v0918 runtime is the only code allowed to write Robustness values.
player=replaceBetween(
  player,
  'function ensureRobustnessColumn(){',
  'function savedColumns(){',
  `function ensureRobustnessColumn(){\n    playerTable=findPlayerTable();if(!playerTable)return;\n    window.CDNexusRobustnessV0918?.refresh?.();\n    applyPlayerFilters();\n  }\n  `,
  'legacy V0.9.4 robustness renderer'
);

player=replaceBetween(
  player,
  'function applyPlayerFilters(){',
  'function ensurePlayerToolbar(){',
  `function applyPlayerFilters(){\n    if(!playerTable)return;\n    const q=norm($('#playerDirectorySearch')?.value||''),source=$('#playerSourceFilter')?.value||'all',rob=$('#playerRobustFilter')?.value||'all';\n    for(const row of playerTable.querySelectorAll('tbody tr')){\n      const p=playerForRow(row);if(!p){row.style.display='';continue}\n      const searchable=norm(\`${'${p.name||\'\'} ${p.nickname||\'\'} ${p.bullshooter?.id||\'\'} ${p.edc?.name||\'\'}'}\`);\n      const f={bs:row.dataset.hasBs==='1',toc:row.dataset.hasToc==='1',edc:row.dataset.hasEdc==='1',cd:row.dataset.hasCd==='1'};\n      const sources=Number(row.dataset.sources||0),score=Number(row.dataset.robustness);\n      let ok=!q||searchable.includes(q);\n      if(source==='multi')ok=ok&&sources>=2;else if(source==='needs')ok=ok&&sources<2;else if(source==='bs')ok=ok&&f.bs;else if(source==='toc')ok=ok&&f.toc;else if(source==='edc')ok=ok&&f.edc;else if(source==='cd')ok=ok&&f.cd;\n      if(rob==='strong')ok=ok&&Number.isFinite(score)&&score>=70;else if(rob==='solid')ok=ok&&Number.isFinite(score)&&score>=50;else if(rob==='thin')ok=ok&&Number.isFinite(score)&&score<50;\n      row.style.display=ok?'':'none';\n    }\n  }\n  `,
  'legacy V0.9.4 robustness filter'
);

// Production V0.9.22 proved that an index.html script reference alone is not a sufficient
// runtime guarantee. Player Intelligence is visibly loaded on the Players page, so use it
// as a watchdog that force-loads the canonical renderer when absent.
const runtimeLoader=`\n  function ensureCanonicalRobustnessRuntime(){\n    if(window.CDNexusRobustnessV0918)return;\n    if(document.querySelector('script[data-cdnexus-robustness-runtime="v0918"]'))return;\n    const s=document.createElement('script');\n    s.src='/v0918-table.js?v=0.9.23';\n    s.async=false;\n    s.dataset.cdnexusRobustnessRuntime='v0918';\n    s.onload=()=>window.CDNexusRobustnessV0918?.reload?.();\n    s.onerror=()=>console.error('V0.9.23 failed to load canonical robustness runtime');\n    (document.head||document.documentElement).appendChild(s);\n  }\n  ensureCanonicalRobustnessRuntime();\n  setTimeout(ensureCanonicalRobustnessRuntime,750);\n  setTimeout(ensureCanonicalRobustnessRuntime,2500);\n`;
const iifeEnd=player.lastIndexOf('})();');
if(iifeEnd<0)throw new Error('V0.9.23 patch: player intelligence IIFE end not found');
if(!player.includes('ensureCanonicalRobustnessRuntime'))player=player.slice(0,iifeEnd)+runtimeLoader+player.slice(iifeEnd);
fs.writeFileSync(paths.player,player);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script src=["']\/v0917-table\.js["']><\/script>/g,'');
// Keep an explicit tag as the primary path, with the Player Intelligence watchdog as fallback.
html=html.replace(/<script src=["']\/v0918-table\.js(?:\?[^"']*)?["']><\/script>/g,'');
html=html.replace('</body>','<script src="/v0918-table.js?v=0.9.23" data-cdnexus-robustness-runtime="v0918"></script></body>');
html=html.replaceAll('V0.9.17','V0.9.23').replaceAll('V0.9.18','V0.9.23').replaceAll('V0.9.19','V0.9.23').replaceAll('V0.9.20','V0.9.23').replaceAll('V0.9.21','V0.9.23').replaceAll('V0.9.22','V0.9.23').replaceAll('Camarillo Darts Nexus 0.9.17','Camarillo Darts Nexus 0.9.23').replaceAll('Camarillo Darts Nexus 0.9.18','Camarillo Darts Nexus 0.9.23').replaceAll('Camarillo Darts Nexus 0.9.19','Camarillo Darts Nexus 0.9.23').replaceAll('Camarillo Darts Nexus 0.9.20','Camarillo Darts Nexus 0.9.23').replaceAll('Camarillo Darts Nexus 0.9.21','Camarillo Darts Nexus 0.9.23').replaceAll('Camarillo Darts Nexus 0.9.22','Camarillo Darts Nexus 0.9.23');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.9.23';
pkg.description='Camarillo Darts Nexus SQL-backed robustness with guaranteed canonical runtime loading';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v0918-table.js','node tests/robustness-formula-v0918.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.9.23',source:'camarillo_robustness_index',route:'/api/players/robustness',renderer:'v0918-only',runtimeLoader:'v094-watchdog'})+'\n');
