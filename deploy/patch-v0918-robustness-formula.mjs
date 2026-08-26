import fs from 'node:fs';

const paths={
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.9.18 patch: ${label} anchor not found`)};

let server=fs.readFileSync(paths.server,'utf8');
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]),tocById=new Map();await Promise.all((links||[]).filter(l=>l.confirmed!==false).map(async l=>{const tid=String(l.tocId??l.toc_id??'');if(!tid||tocById.has(tid))return;try{const row=await getTocPlayer(tid);if(row)tocById.set(tid,row)}catch{}}));return json(res,200,robustnessIndex(players,{links,tocById}))}";
need(server,oldRoute,'V0.9.16 robustness endpoint');
server=server.replace(oldRoute,"if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}");
server=server.replaceAll("version:'0.9.17'","version:'0.9.18'").replaceAll('Camarillo Darts V0.9.17 running','Camarillo Darts V0.9.18 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.17','EXTERNAL PLAYER INTELLIGENCE · V0.9.18');
fs.writeFileSync(paths.player,player);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script src=["']\/v0917-table\.js["']><\/script>/g,'');
if(!html.includes('/v0918-table.js'))html=html.replace('</body>','<script src="/v0918-table.js"></script></body>');
html=html.replaceAll('V0.9.17','V0.9.18').replaceAll('Camarillo Darts Nexus 0.9.17','Camarillo Darts Nexus 0.9.18');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.9.18';
pkg.description='Camarillo Darts Nexus fixed 0-100 robustness formula and canonical Players table schema';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v0918-table.js','node tests/robustness-formula-v0918.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
