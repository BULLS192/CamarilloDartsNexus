import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v0921-robustness-applied':'.v0921-robustness-applied'
};

let store=fs.readFileSync(paths.store,'utf8');
if(!store.includes('export async function getRobustnessIndexSql(')){
  store += `\nexport async function getRobustnessIndexSql(){\n  if(!SUPABASE_URL)throw new Error('Supabase is required for robustness scoring.');\n  const res=await fetch(\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_robustness_index\`,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});\n  const body=await res.json().catch(()=>null);\n  if(!res.ok)throw new Error(\`Supabase robustness read failed (${'${res.status}'}): ${'${body?.message||body?.error||\'Unknown error\'}'}\`);\n  if(!body||typeof body!=='object'||Array.isArray(body)||!body.byBullshooterId)throw new Error('Supabase robustness RPC returned an invalid index.');\n  return body;\n}\n`;
}
fs.writeFileSync(paths.store,store);

let server=fs.readFileSync(paths.server,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.21 patch: store import not found');
if(!sm[1].includes('getRobustnessIndexSql'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},getRobustnessIndexSql\n} from './src/store.js';`);
const oldRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listRobustnessPlayersRaw(),links=await listTocLinks().catch(()=>[]),result=robustnessIndex(players,{links});return json(res,200,{...result,diagnostics:{source:'raw-state',playerCount:players.length,indexedBullshooterCount:Object.keys(result.byBullshooterId||{}).length}})}";
if(!server.includes(oldRoute))throw new Error('V0.9.21 patch: V0.9.20 robustness route not found');
server=server.replace(oldRoute,"if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const result=await getRobustnessIndexSql();return json(res,200,result)}");
server=server.replaceAll("version:'0.9.20'","version:'0.9.21'").replaceAll('Camarillo Darts V0.9.20 running','Camarillo Darts V0.9.21 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.20','EXTERNAL PLAYER INTELLIGENCE · V0.9.21');
fs.writeFileSync(paths.player,player);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replaceAll('V0.9.20','V0.9.21').replaceAll('Camarillo Darts Nexus 0.9.20','Camarillo Darts Nexus 0.9.21');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.9.21';
pkg.description='Camarillo Darts Nexus SQL-backed robustness scoring';
if(!pkg.scripts)pkg.scripts={};
const cmd='node tests/robustness-sql-v0921.test.js';
if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.9.21',source:'camarillo_robustness_index',route:'/api/players/robustness'})+'\n');
