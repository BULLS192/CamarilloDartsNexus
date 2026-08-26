import fs from 'node:fs';

const storePath=fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const required=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`V0.9.16 patch: ${label} anchor not found`)};

// External source persistence must bypass the identity-only updatePlayer surface.
let store=fs.readFileSync(storePath,'utf8');
if(!store.includes('export async function setPlayerExternalSource('))store+=`\nexport async function setPlayerExternalSource(playerId,source,value){\n  if(!['edc'].includes(String(source)))throw new Error('Unsupported external player source.');\n  const db=await readDb(),p=(db.players||[]).find(x=>String(x.id)===String(playerId));if(!p)throw new Error('Player not found.');\n  if(value===null||value===undefined)delete p[source];else p[source]=value;p.updatedAt=now();await writeDb(db);return p;\n}\n`;
fs.writeFileSync(storePath,store);

let server=fs.readFileSync(serverPath,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.16 patch: store import not found');
if(!sm[1].includes('setPlayerExternalSource'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},setPlayerExternalSource\n} from './src/store.js';`);
if(!server.includes("from './src/robustness.js'"))server=server.replace("import { calculate01Handicap,cricketSpotMarks } from './src/ratings.js';","import { calculate01Handicap,cricketSpotMarks } from './src/ratings.js';\nimport { robustnessIndex } from './src/robustness.js';");

const playersRoute="  if(url.pathname==='/api/players'&&req.method==='GET')return json(res,200,await listPlayers());";
required(server,playersRoute,'players GET route');
if(!server.includes("url.pathname==='/api/players/robustness'"))server=server.replace(playersRoute,playersRoute+`\n  if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const players=await listPlayers(),links=await listTocLinks().catch(()=>[]),tocById=new Map();await Promise.all((links||[]).filter(l=>l.confirmed!==false).map(async l=>{const tid=String(l.tocId??l.toc_id??'');if(!tid||tocById.has(tid))return;try{const row=await getTocPlayer(tid);if(row)tocById.set(tid,row)}catch{}}));return json(res,200,robustnessIndex(players,{links,tocById}))}`);

// Linking saves the exact record the operator selected. It does not re-fetch/re-resolve EDC before persistence.
const edcPostRe=/  m=matchPath\(url,\/\^\\\/api\\\/players\\\/\(\[\^\/\]\+\)\\\/edc-link\$\/\);if\(m&&req\.method==='POST'\)\{[\s\S]*?\n  \}\n  if\(m&&req\.method==='DELETE'\)/;
if(!edcPostRe.test(server))throw new Error('V0.9.16 patch: EDC link POST route not found');
server=server.replace(edcPostRe,`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-link$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req),name=String(input.name||'').trim(),n=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null),ppd=n(input.ppd),mpr=n(input.mpr),evpRating=n(input.evpRating),games=n(input.games);if(!name||ppd===null&&mpr===null)return json(res,400,{error:'Choose an EDC search result before linking.'});
    const snapshot={name,normalizedName:normalizeEdcName(name),ppd,mpr,evpRating,calculatedEvpRating:ppd!==null&&mpr!==null?Math.round((ppd+10*mpr)*100)/100:null,games:games===null?null:Math.max(0,Math.trunc(games)),platform:input.platform||null,updatedText:input.updatedText||null,sourceRow:Number.isInteger(Number(input.sourceRow))?Number(input.sourceRow):null,sourceFormat:input.sourceFormat||null};const capturedAt=new Date().toISOString(),recordKey=String(input.recordKey||edcRecordKey(snapshot));const edc={...snapshot,recordKey,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,capturedAt,parserVersion:'0.9.0-edc.1',confirmed:true,matchMethod:'manual',refreshPolicy:'unique-name-or-exact-snapshot-only',selectionRule:'Exact EDC search result manually selected by Nexus operator'};
    const updated=await setPlayerExternalSource(p.id,'edc',edc);await auditEvent({action:'edc_player_linked',entityType:'player',entityId:p.id,metadata:{sourceRow:edc.sourceRow,recordKey,edcName:name}}).catch(()=>{});return json(res,200,{player:updated,edc});
  }
  if(m&&req.method==='DELETE')`);
server=server.replace("const updated=await updatePlayer(p.id,{edc:null});await auditEvent({action:'edc_player_unlinked'","const updated=await setPlayerExternalSource(p.id,'edc',null);await auditEvent({action:'edc_player_unlinked'");

const edcSyncRe=/  m=matchPath\(url,\/\^\\\/api\\\/players\\\/\(\[\^\/\]\+\)\\\/edc-sync\$\/\);if\(m&&req\.method==='POST'\)\{[\s\S]*?\n  \}/;
if(!edcSyncRe.test(server))throw new Error('V0.9.16 patch: EDC sync route not found');
server=server.replace(edcSyncRe,`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});if(p.edc?.confirmed!==true)return json(res,409,{error:'EDC is not manually linked for this player.'});const input=await body(req),dataset=await loadEdcDataset({force:Boolean(input.force)}),records=dataset.records||[],wanted=String(p.edc.normalizedName||normalizeEdcName(p.edc.name||'')),key=String(p.edc.recordKey||''),same=records.filter(x=>x.normalizedName===wanted&&(!p.edc.platform||!x.platform||x.platform===p.edc.platform));let r=key?records.find(x=>String(x.recordKey||edcRecordKey(x))===key):null;if(!r&&same.length===1)r=same[0];if(!r&&same.length>1)return json(res,409,{error:'Multiple EDC records still use this player name. Nexus will not guess which record changed; manually select the correct EDC record again. The current link was preserved.',ambiguous:true,candidateCount:same.length});if(!r)return json(res,404,{error:'The linked EDC record is no longer present. Manually search EDC and link the correct record again.'});
    const capturedAt=new Date().toISOString(),edc={...p.edc,name:r.name,normalizedName:r.normalizedName,recordKey:r.recordKey||edcRecordKey(r),ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,capturedAt,confirmed:true,matchMethod:'manual',refreshPolicy:'unique-name-or-exact-snapshot-only',selectionRule:'Refresh of manually linked EDC record'};const updated=await setPlayerExternalSource(p.id,'edc',edc);return json(res,200,{player:updated,edc});
  }`);

// Background EDC refresh follows the same ambiguity-safe rule and uses the source-persistence primitive.
const linkedRe=/function linkedEdcRecord\(player,dataset\)\{[\s\S]*?\n\}/;
if(linkedRe.test(server))server=server.replace(linkedRe,`function linkedEdcRecord(player,dataset){
  const e=player?.edc||{};if(e.confirmed!==true)return null;const wanted=String(e.normalizedName||normalizeEdcName(e.name||'')),key=String(e.recordKey||''),records=dataset.records||[];let r=key?records.find(x=>String(x.recordKey||edcRecordKey(x))===key):null;if(r)return r;const same=records.filter(x=>x.normalizedName===wanted&&(!e.platform||!x.platform||x.platform===e.platform));return same.length===1?same[0]:null;
}`);
server=server.replace("await updatePlayer(p.id,{edc:next});updated++","await setPlayerExternalSource(p.id,'edc',next);updated++");

server=server.replaceAll("version:'0.9.15'","version:'0.9.16'").replaceAll('Camarillo Darts V0.9.15 running','Camarillo Darts V0.9.16 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replace(/<script src=["']\/v0915-robustness\.js["']><\/script>/g,'');
if(!html.includes('/v0916-robustness.js'))html=html.replace('</body>','<script src="/v0916-robustness.js"></script></body>');
html=html.replaceAll('V0.9.15','V0.9.16').replaceAll('Camarillo Darts Nexus 0.9.15','Camarillo Darts Nexus 0.9.16');
fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.16';pkg.description='Camarillo Darts Nexus server-backed robustness and reliable manual EDC source persistence';if(!pkg.scripts)pkg.scripts={};for(const cmd of ['node --check public/v0916-robustness.js','node tests/robustness-edc-v0916.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
