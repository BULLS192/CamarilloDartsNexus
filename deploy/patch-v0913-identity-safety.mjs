import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
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

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.13';
pkg.description='Camarillo Darts Nexus safe player identity aliases, manual raw linking and robustness';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v0912-identity.js','node tests/identity-observer-v0913.test.js']){
  if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
