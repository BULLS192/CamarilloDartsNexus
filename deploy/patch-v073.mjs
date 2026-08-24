import fs from 'node:fs';

const storePath = fs.existsSync('/app/src/store.js') ? '/app/src/store.js' : 'src/store.js';
let s = fs.readFileSync(storePath, 'utf8');

const configAnchor = `const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH=process.env.DB_PATH?path.resolve(process.env.DB_PATH):path.join(ROOT,'data','db.json');
const EMPTY={`;
const configReplacement = `const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH=process.env.DB_PATH?path.resolve(process.env.DB_PATH):path.join(ROOT,'data','db.json');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\\/$/,'');
const SUPABASE_PUBLISHABLE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const CAMARILLO_STATE_TOKEN=String(process.env.CAMARILLO_STATE_TOKEN||'');
const REMOTE_DB=Boolean(SUPABASE_URL&&SUPABASE_PUBLISHABLE_KEY&&CAMARILLO_STATE_TOKEN);
const EMPTY={`;
if (!s.includes(configAnchor)) throw new Error('V0.7.4 patch: store configuration anchor not found');
s = s.replace(configAnchor, configReplacement);

const oldPersistence = `export async function ensureDb(){await fs.mkdir(path.dirname(DB_PATH),{recursive:true});try{await fs.access(DB_PATH)}catch{await fs.writeFile(DB_PATH,JSON.stringify(EMPTY,null,2))}}
export async function readDb(){await ensureDb();return normalizeDb(JSON.parse(await fs.readFile(DB_PATH,'utf8')))}
export async function writeDb(db){await fs.writeFile(DB_PATH,JSON.stringify(normalizeDb(db),null,2));return db}`;
const newPersistence = `function remoteHeaders(extra={}){return{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:\`Bearer \${SUPABASE_PUBLISHABLE_KEY}\`,'x-camarillo-key':CAMARILLO_STATE_TOKEN,'content-type':'application/json',accept:'application/json',...extra}}
async function remoteRead(){
  const url=\`\${SUPABASE_URL}/rest/v1/camarillo_app_state?id=eq.main&select=state\`;
  const res=await fetch(url,{headers:remoteHeaders(),signal:AbortSignal.timeout(12000)});
  const body=await res.json().catch(()=>null);
  if(!res.ok)throw new Error(\`Supabase read failed (\${res.status}): \${body?.message||body?.error||'Unknown error'}\`);
  const row=Array.isArray(body)?body[0]:null;if(!row?.state)throw new Error('Supabase state row is missing.');
  return normalizeDb(row.state);
}
async function remoteWrite(db){
  const state=normalizeDb(db);
  const url=\`\${SUPABASE_URL}/rest/v1/camarillo_app_state?on_conflict=id\`;
  const res=await fetch(url,{method:'POST',headers:remoteHeaders({prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({id:'main',state,updated_at:now()}),signal:AbortSignal.timeout(12000)});
  if(!res.ok){const body=await res.json().catch(()=>null);throw new Error(\`Supabase write failed (\${res.status}): \${body?.message||body?.error||'Unknown error'}\`)}
  return state;
}
export function databaseBackend(){return REMOTE_DB?'supabase':'local-json'}
export async function ensureDb(){if(REMOTE_DB){await remoteRead();return}await fs.mkdir(path.dirname(DB_PATH),{recursive:true});try{await fs.access(DB_PATH)}catch{await fs.writeFile(DB_PATH,JSON.stringify(EMPTY,null,2))}}
export async function readDb(){if(REMOTE_DB)return remoteRead();await ensureDb();return normalizeDb(JSON.parse(await fs.readFile(DB_PATH,'utf8')))}
export async function writeDb(db){if(REMOTE_DB)return remoteWrite(db);await fs.writeFile(DB_PATH,JSON.stringify(normalizeDb(db),null,2));return db}`;
if (!s.includes(oldPersistence)) throw new Error('V0.7.4 patch: store read/write anchor not found');
s = s.replace(oldPersistence, newPersistence);
fs.writeFileSync(storePath, s);

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replace(
  'listMatches,updateMatch,listFeats,recordFeat,standings,playerIntelligence,getSettings,updateSettings,exportDatabase,logSyncRun',
  'listMatches,updateMatch,listFeats,recordFeat,standings,playerIntelligence,getSettings,updateSettings,exportDatabase,logSyncRun,databaseBackend'
);
server = server.replace(
  "if(url.pathname==='/health')return json(res,200,{ok:true,version:'0.7.1'});",
  "if(url.pathname==='/health')return json(res,200,{ok:true,version:'0.7.4',backend:databaseBackend()});"
);
server = server.replace(
  'if(!requireAuth(req,res))return;',
  "if(!requireAuth(req,res))return;\n  if(url.pathname==='/api/system/backend'&&req.method==='GET')return json(res,200,{backend:databaseBackend(),version:'0.7.4'});"
);
server = server.replace('Camarillo Darts V0.7.1 running', 'Camarillo Darts V0.7.4 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
const duplicate = '<button class="primary addPlayer">+ Add Player</button>';
if (html.includes(duplicate)) html = html.replace(duplicate, '');
html = html.replace('<span class="dot"></span> Local database active<br><small>V0.7.0</small>', '<span class="dot"></span> <span id="databaseBackendLabel">Checking database...</span><br><small>V0.7.4</small>');
html = html.replace('<span class="dot"></span> Supabase database active<br><small>V0.7.3</small>', '<span class="dot"></span> <span id="databaseBackendLabel">Checking database...</span><br><small>V0.7.4</small>');
html = html.replace('<title>Camarillo Darts V0.7</title>', '<title>Camarillo Darts V0.7.4</title>');
html = html.replace('<title>Camarillo Darts V0.7.3</title>', '<title>Camarillo Darts V0.7.4</title>');
const backendScript = `<script>fetch('/api/system/backend').then(r=>r.json()).then(x=>{const el=document.getElementById('databaseBackendLabel');if(el)el.textContent=x.backend==='supabase'?'Supabase database active':'Local database active';}).catch(()=>{const el=document.getElementById('databaseBackendLabel');if(el)el.textContent='Database status unavailable';});</script>`;
if (!html.includes("fetch('/api/system/backend')")) html = html.replace('</body>', backendScript + '</body>');
fs.writeFileSync(indexPath, html);
