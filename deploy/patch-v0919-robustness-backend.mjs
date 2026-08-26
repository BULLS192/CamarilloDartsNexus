import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let store=fs.readFileSync(storePath,'utf8');
if(!store.includes('export async function listRobustnessPlayers(')){
  store += `\nexport async function listRobustnessPlayers(){\n  const db=await readDb();\n  return structuredClone(db.players||[]);\n}\n`;
}
fs.writeFileSync(storePath,store);

let server=fs.readFileSync(serverPath,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.19 patch: store import not found');
if(!sm[1].includes('listRobustnessPlayers'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},listRobustnessPlayers\n} from './src/store.js';`);
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}";
if(!server.includes(oldRoute))throw new Error('V0.9.19 patch: robustness route anchor not found');
server=server.replace(oldRoute,"if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listRobustnessPlayers(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}");
server=server.replaceAll("version:'0.9.18'","version:'0.9.19'").replaceAll('Camarillo Darts V0.9.18 running','Camarillo Darts V0.9.19 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.18','V0.9.19').replaceAll('Camarillo Darts Nexus 0.9.18','Camarillo Darts Nexus 0.9.19');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.19';pkg.description='Camarillo Darts Nexus full-state server robustness scoring';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/robustness-backend-v0919.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
