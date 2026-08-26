import fs from 'node:fs';

const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let ui=fs.readFileSync(uiPath,'utf8');
const rowRe=/  function playerForRow\(row\)\{[\s\S]*?\n  \}\n  function ensureRobustnessColumn/;
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
  }
  function ensureRobustnessColumn`);
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
