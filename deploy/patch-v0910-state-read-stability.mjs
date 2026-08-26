import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

let store=fs.readFileSync(storePath,'utf8');
const readRe=/async function remoteRead\(\)\{[\s\S]*?\n\}\nasync function remoteWrite/;
if(!readRe.test(store))throw new Error('V0.9.10 patch: remoteRead block not found');
store=store.replace(readRe,`const REMOTE_STATE_CACHE_MS=Math.max(250,Number(process.env.REMOTE_STATE_CACHE_MS)||1500);
let remoteStateCache=null,remoteStateCacheAt=0,remoteStateReadPromise=null;
const cloneRemoteState=v=>structuredClone(v);
async function remoteRead(){
  if(remoteStateCache&&Date.now()-remoteStateCacheAt<REMOTE_STATE_CACHE_MS)return cloneRemoteState(remoteStateCache);
  if(remoteStateReadPromise)return cloneRemoteState(await remoteStateReadPromise);
  remoteStateReadPromise=(async()=>{
    const url=\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_state_read\`;
    const res=await fetch(url,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});
    const body=await res.json().catch(()=>null);
    if(!res.ok)throw new Error(\`Supabase state read failed (${'${res.status}'}): ${'${body?.message||body?.error||\'Unknown error\'}'}\`);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Supabase state read returned no state object.');
    return normalizeDb(body);
  })();
  try{
    const state=await remoteStateReadPromise;
    remoteStateCache=cloneRemoteState(state);remoteStateCacheAt=Date.now();
    return cloneRemoteState(state);
  }finally{remoteStateReadPromise=null}
}
async function remoteWrite`);
const writeAnchor="  return state;\n}\nexport function databaseBackend";
if(!store.includes(writeAnchor))throw new Error('V0.9.10 patch: remoteWrite return anchor not found');
store=store.replace(writeAnchor,"  remoteStateCache=cloneRemoteState(state);remoteStateCacheAt=Date.now();\n  return state;\n}\nexport function databaseBackend");
fs.writeFileSync(storePath,store);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.9'","version:'0.9.10'").replaceAll('Camarillo Darts V0.9.9 running','Camarillo Darts V0.9.10 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.9','V0.9.10').replaceAll('Camarillo Darts Nexus 0.9.9','Camarillo Darts Nexus 0.9.10');
fs.writeFileSync(indexPath,html);

if(fs.existsSync(uiPath)){
  let ui=fs.readFileSync(uiPath,'utf8');
  ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.9','EXTERNAL PLAYER INTELLIGENCE · V0.9.10');
  fs.writeFileSync(uiPath,ui);
}

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.10';
pkg.description='Camarillo Darts Nexus stable cached Supabase state reads with verified external player intelligence';
if(!pkg.scripts)pkg.scripts={};
const cmd='node tests/state-read-v0910.test.js';
if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
