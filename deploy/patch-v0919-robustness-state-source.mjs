import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const playerPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let store=fs.readFileSync(storePath,'utf8');
if(!store.includes('export async function listPlayersForRobustness('))store+=`\n// Robustness needs the authoritative player objects, not a normalized/list projection.\nexport async function listPlayersForRobustness(){const db=await readDb();return Array.isArray(db?.players)?db.players:[]}\n`;
fs.writeFileSync(storePath,store);

let server=fs.readFileSync(serverPath,'utf8');
const storeImport=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImport);if(!sm)throw new Error('V0.9.19 patch: store import not found');
if(!sm[1].includes('listPlayersForRobustness'))server=server.replace(storeImport,(_,names)=>`import {${names.trimEnd()},listPlayersForRobustness\n} from './src/store.js';`);
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}";
const newRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayersForRobustness(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}";
if(!server.includes(oldRoute))throw new Error('V0.9.19 patch: V0.9.18 robustness route not found');
server=server.replace(oldRoute,newRoute).replaceAll("version:'0.9.18'","version:'0.9.19'").replaceAll('Camarillo Darts V0.9.18 running','Camarillo Darts V0.9.19 running');
fs.writeFileSync(serverPath,server);

let player=fs.readFileSync(playerPath,'utf8');player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.18','EXTERNAL PLAYER INTELLIGENCE · V0.9.19');fs.writeFileSync(playerPath,player);
let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.18','V0.9.19').replaceAll('Camarillo Darts Nexus 0.9.18','Camarillo Darts Nexus 0.9.19');fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.19';pkg.description='Camarillo Darts Nexus authoritative-state robustness scoring';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/robustness-state-v0919.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
