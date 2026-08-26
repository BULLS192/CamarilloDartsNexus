import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let store=fs.readFileSync(storePath,'utf8');
if(!store.includes('export async function listRobustnessPlayersRaw('))store+=`\nexport async function listRobustnessPlayersRaw(){\n  try{\n    if(SUPABASE_URL){\n      const res=await fetch(\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_state_read\`,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});\n      const raw=await res.json().catch(()=>null);\n      if(res.ok&&raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray(raw.players))return structuredClone(raw.players);\n    }\n  }catch{}\n  const db=await readDb();\n  return structuredClone(db.players||[]);\n}\n`;
fs.writeFileSync(storePath,store);

let server=fs.readFileSync(serverPath,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.20 patch: store import not found');
if(!sm[1].includes('listRobustnessPlayersRaw'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},listRobustnessPlayersRaw\n} from './src/store.js';`);
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listRobustnessPlayers(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}";
if(!server.includes(oldRoute))throw new Error('V0.9.20 patch: V0.9.19 robustness route not found');
server=server.replace(oldRoute,"if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listRobustnessPlayersRaw(),links=await listTocLinks().catch(()=>[]);return json(res,200,robustnessIndex(players,{links}))}");
server=server.replaceAll("version:'0.9.19'","version:'0.9.20'").replaceAll('Camarillo Darts V0.9.19 running','Camarillo Darts V0.9.20 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.19','V0.9.20').replaceAll('Camarillo Darts Nexus 0.9.19','Camarillo Darts Nexus 0.9.20');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.20';pkg.description='Camarillo Darts Nexus raw-state end-to-end robustness scoring';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/robustness-e2e-v0920.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
