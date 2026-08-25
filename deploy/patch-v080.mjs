import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
let store=fs.readFileSync(storePath,'utf8');
const dbAnchor="export function databaseBackend(){return REMOTE_DB?'supabase':'local-json'}";
if(!store.includes(dbAnchor)) throw new Error('V0.8 patch: databaseBackend anchor not found');
const dbReplacement=`export function databaseBackend(){return REMOTE_DB?'supabase':'local-json'}
export async function createBackupSnapshot(reason='manual'){
  const state=await readDb();
  if(!REMOTE_DB)return{ok:false,backend:'local-json',message:'Backups require Supabase.'};
  const url=SUPABASE_URL+'/rest/v1/camarillo_state_backups';
  const res=await fetch(url,{method:'POST',headers:remoteHeaders({prefer:'return=representation'}),body:JSON.stringify({reason:String(reason||'manual').slice(0,120),state}),signal:AbortSignal.timeout(12000)});
  const body=await res.json().catch(()=>null);if(!res.ok)throw new Error('Backup failed ('+res.status+'): '+(body?.message||body?.error||'Unknown error'));
  return{ok:true,backup:Array.isArray(body)?body[0]:body};
}
export async function listBackupSnapshots(limit=20){
  if(!REMOTE_DB)return[];const n=Math.max(1,Math.min(100,Number(limit)||20));
  const url=SUPABASE_URL+'/rest/v1/camarillo_state_backups?select=backup_id,created_at,reason&order=created_at.desc&limit='+n;
  const res=await fetch(url,{headers:remoteHeaders(),signal:AbortSignal.timeout(12000)});const body=await res.json().catch(()=>null);if(!res.ok)throw new Error('Backup list failed ('+res.status+')');return Array.isArray(body)?body:[];
}
export async function auditEvent({action,actor='system',entityType=null,entityId=null,metadata={}}={}){
  if(!REMOTE_DB)return{ok:false};const url=SUPABASE_URL+'/rest/v1/camarillo_audit_log';
  const res=await fetch(url,{method:'POST',headers:remoteHeaders({prefer:'return=minimal'}),body:JSON.stringify({action:String(action||'event'),actor:String(actor||'system'),entity_type:entityType,entity_id:entityId,metadata}),signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error('Audit log failed ('+res.status+')');return{ok:true};
}`;
store=store.replace(dbAnchor,dbReplacement);
fs.writeFileSync(storePath,store);

const ratingsPath=fs.existsSync('/app/src/ratings.js')?'/app/src/ratings.js':'src/ratings.js';
let ratings=fs.readFileSync(ratingsPath,'utf8');
const oldInitial=`export function initialEstablished(current, last30, last10) {
  const c=asNumber(current), r30=asNumber(last30), r10=asNumber(last10);
  let base=null;
  if(Number.isFinite(c)&&Number.isFinite(r30)) base=.4*c+.6*r30;
  else if(Number.isFinite(r30)) base=r30;
  else if(Number.isFinite(c)) base=c;
  else if(Number.isFinite(r10)) base=r10;
  if(!Number.isFinite(base)) return null;
  if(Number.isFinite(r10)&&r10>base) base=.8*base+.2*r10;
  return round(base,2);
}`;
const newInitial=`export function initialEstablished(current, last50, last20, last10) {
  const c=asNumber(current), r50=asNumber(last50), r20=asNumber(last20), r10=asNumber(last10);
  const parts=[[r50,.5],[r20,.3],[r10,.2]].filter(([v])=>Number.isFinite(v));
  if(parts.length){const w=parts.reduce((s,[,x])=>s+x,0);return round(parts.reduce((s,[v,x])=>s+v*x,0)/w,2)}
  return Number.isFinite(c)?round(c,2):null;
}`;
if(!ratings.includes(oldInitial)) throw new Error('V0.8 patch: ratings initialEstablished anchor not found');
ratings=ratings.replace(oldInitial,newInitial)
.replace('initialEstablished(b.ppd,b.last30PPD,b.last10PPD)','initialEstablished(b.ppd,b.last50PPD,b.last20PPD,b.last10PPD)')
.replace('initialEstablished(b.mpr,b.last30MPR,b.last10MPR)','initialEstablished(b.mpr,b.last50MPR,b.last20MPR,b.last10MPR)');
fs.writeFileSync(ratingsPath,ratings);

const ratingUiPath=fs.existsSync('/app/public/v0711.js')?'/app/public/v0711.js':'public/v0711.js';
let ui=fs.readFileSync(ratingUiPath,'utf8');
const oldUi=`  function initialEstablished(current,last30,last10){
    const c=n(current), r30=n(last30), r10=n(last10);
    let base=null;
    if(Number.isFinite(c)&&Number.isFinite(r30)) base=.4*c+.6*r30;
    else if(Number.isFinite(r30)) base=r30;
    else if(Number.isFinite(c)) base=c;
    else if(Number.isFinite(r10)) base=r10;
    if(!Number.isFinite(base)) return null;
    if(Number.isFinite(r10)&&r10>base) base=.8*base+.2*r10;
    return Math.round(base*100)/100;
  }`;
const newUi=`  function initialEstablished(current,last50,last20,last10){
    const c=n(current),r50=n(last50),r20=n(last20),r10=n(last10);
    const parts=[[r50,.5],[r20,.3],[r10,.2]].filter(([v])=>Number.isFinite(v));
    if(parts.length){const w=parts.reduce((s,[,x])=>s+x,0);return Math.round((parts.reduce((s,[v,x])=>s+v*x,0)/w)*100)/100}
    return Number.isFinite(c)?Math.round(c*100)/100:null;
  }`;
if(!ui.includes(oldUi)) throw new Error('V0.8 patch: rating UI initialEstablished anchor not found');
ui=ui.replace(oldUi,newUi)
.replace('initialEstablished(b.ppd,b.last30PPD,b.last10PPD)','initialEstablished(b.ppd,b.last50PPD,b.last20PPD,b.last10PPD)')
.replace('initialEstablished(b.mpr,b.last30MPR,b.last10MPR)','initialEstablished(b.mpr,b.last50MPR,b.last20MPR,b.last10MPR)');
fs.writeFileSync(ratingUiPath,ui);

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=server.replace('exportDatabase,logSyncRun,databaseBackend','exportDatabase,logSyncRun,databaseBackend,createBackupSnapshot,listBackupSnapshots,auditEvent');
const routeAnchor="if(url.pathname==='/api/system/backend'&&req.method==='GET')return json(res,200,{backend:databaseBackend(),version:'0.7.4'});";
if(!server.includes(routeAnchor)) throw new Error('V0.8 patch: system route anchor not found');
server=server.replace(routeAnchor,`if(url.pathname==='/api/system/backend'&&req.method==='GET')return json(res,200,{backend:databaseBackend(),version:'0.8.0'});
  if(url.pathname==='/api/system/backups'&&req.method==='GET')return json(res,200,await listBackupSnapshots(url.searchParams.get('limit')));
  if(url.pathname==='/api/system/backup'&&req.method==='POST'){const input=await body(req);const out=await createBackupSnapshot(input.reason||'manual');await auditEvent({action:'backup_created',entityType:'database',entityId:'main',metadata:{reason:input.reason||'manual'}}).catch(()=>{});return json(res,201,out)}`);
server=server.replaceAll("version:'0.7.12'","version:'0.8.0'").replaceAll("version:'0.7.11'","version:'0.8.0'").replaceAll('Camarillo Darts V0.7.12 running','Camarillo Darts V0.8.0 running').replaceAll('Camarillo Darts V0.7.11 running','Camarillo Darts V0.8.0 running');
fs.writeFileSync(serverPath,server);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.7.12','V0.8.0').replaceAll('V0.7.11','V0.8.0').replaceAll('Camarillo Darts V0.7.12','Camarillo Darts V0.8.0').replaceAll('Camarillo Darts V0.7.11','Camarillo Darts V0.8.0');
if(!html.includes('/v080.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v080.css"></head>');
if(!html.includes('/v080.js'))html=html.replace('</body>','<script src="/v080.js"></script></body>');
fs.writeFileSync(indexPath,html);
