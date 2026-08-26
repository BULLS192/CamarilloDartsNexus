import fs from 'node:fs';

const edcPath=fs.existsSync('/app/src/edc.js')?'/app/src/edc.js':'src/edc.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const identityUiPath=fs.existsSync('/app/public/v0912-identity.js')?'/app/public/v0912-identity.js':'public/v0912-identity.js';
const tocUiPath=fs.existsSync('/app/public/v090.js')?'/app/public/v090.js':'public/v090.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const required=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`V0.9.15 patch: ${label} anchor not found`)};

// EDC search results get a semantic snapshot key. Linking no longer depends on a transient published-sheet row number.
let edc=fs.readFileSync(edcPath,'utf8');
const edcNormAnchor="export const normalizeEdcName=value=>String(value??'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' ');";
required(edc,edcNormAnchor,'EDC normalization');
if(!edc.includes('export function edcRecordKey('))edc=edc.replace(edcNormAnchor,edcNormAnchor+`\nexport function edcRecordKey(record={}){const f=v=>{const x=Number(v);return Number.isFinite(x)?x.toFixed(4):''};return [normalizeEdcName(record.name),f(record.ppd),f(record.mpr),f(record.evpRating),Number.isFinite(Number(record.games))?String(Math.trunc(Number(record.games))):'',normalizeEdcName(record.platform||''),normalizeEdcName(record.updatedText||'')].join('|')}`);
const datasetAnchor="records:parsed.records};cache={loadedAt:now,dataset,error:null};return dataset";
required(edc,datasetAnchor,'EDC dataset records');
edc=edc.replace(datasetAnchor,"records:parsed.records.map(r=>({...r,recordKey:edcRecordKey(r)}))};cache={loadedAt:now,dataset,error:null};return dataset");
fs.writeFileSync(edcPath,edc);

let server=fs.readFileSync(serverPath,'utf8');
const edcImport="import { edcHealth, searchEdcPlayers, findEdcPlayer, loadEdcDataset, EDC_DEFAULT_PUBLISHED_URL } from './src/edc.js';";
required(server,edcImport,'server EDC import');
server=server.replace(edcImport,"import { edcHealth, searchEdcPlayers, findEdcPlayer, loadEdcDataset, edcRecordKey, normalizeEdcName, EDC_DEFAULT_PUBLISHED_URL } from './src/edc.js';");

const edcPostRe=/  m=matchPath\(url,\/\^\\\/api\\\/players\\\/\(\[\^\/\]\+\)\\\/edc-link\$\/\);if\(m&&req\.method==='POST'\)\{[\s\S]*?\n  \}\n  if\(m&&req\.method==='DELETE'\)/;
if(!edcPostRe.test(server))throw new Error('V0.9.15 patch: EDC manual link route not found');
server=server.replace(edcPostRe,`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-link$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req),dataset=await loadEdcDataset({force:Boolean(input.force)}),records=dataset.records||[],key=String(input.recordKey||'').trim(),sourceRow=Number(input.sourceRow),wanted=normalizeEdcName(input.name||'');let r=null;
    if(key)r=records.find(x=>String(x.recordKey||edcRecordKey(x))===key)||null;
    if(!r&&Number.isInteger(sourceRow)&&sourceRow>0){const row=records.find(x=>Number(x.sourceRow)===sourceRow);if(row&&(!wanted||row.normalizedName===wanted))r=row}
    if(!r&&wanted){const same=records.filter(x=>x.normalizedName===wanted),eq=(a,b)=>b===null||b===undefined||b===''||Math.abs(Number(a)-Number(b))<0.0001,candidates=same.filter(x=>eq(x.ppd,input.ppd)&&eq(x.mpr,input.mpr)&&eq(x.evpRating,input.evpRating)&&eq(x.games,input.games));if(candidates.length===1)r=candidates[0];else if(same.length===1)r=same[0]}
    if(!r)return json(res,409,{error:'The selected EDC record changed before it could be linked. Search EDC again and choose the exact record.',candidateCount:wanted?records.filter(x=>x.normalizedName===wanted).length:0});
    const capturedAt=new Date().toISOString(),edc={name:r.name,normalizedName:r.normalizedName,recordKey:r.recordKey||edcRecordKey(r),ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,capturedAt,parserVersion:'0.9.0-edc.1',confirmed:true,matchMethod:'manual',selectionRule:'Manually linked by Nexus operator from an exact EDC search result'};
    const updated=await updatePlayer(p.id,{edc});await auditEvent({action:'edc_player_linked',entityType:'player',entityId:p.id,metadata:{sourceRow:r.sourceRow,recordKey:edc.recordKey,edcName:r.name}}).catch(()=>{});return json(res,200,{player:updated,edc});
  }
  if(m&&req.method==='DELETE')`);

const edcSyncRe=/  m=matchPath\(url,\/\^\\\/api\\\/players\\\/\(\[\^\/\]\+\)\\\/edc-sync\$\/\);if\(m&&req\.method==='POST'\)\{[\s\S]*?\n  \}/;
if(!edcSyncRe.test(server))throw new Error('V0.9.15 patch: EDC refresh route not found');
server=server.replace(edcSyncRe,`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});if(p.edc?.confirmed!==true)return json(res,409,{error:'EDC is not manually linked for this player. Use Player Source Linking first.'});const input=await body(req),dataset=await loadEdcDataset({force:Boolean(input.force)}),records=dataset.records||[],wanted=String(p.edc.normalizedName||normalizeEdcName(p.edc.name||'')),key=String(p.edc.recordKey||''),sourceRow=Number(p.edc.sourceRow);let r=key?records.find(x=>String(x.recordKey||edcRecordKey(x))===key):null;
    if(!r&&Number.isInteger(sourceRow)&&sourceRow>0){const row=records.find(x=>Number(x.sourceRow)===sourceRow);if(row&&(!wanted||row.normalizedName===wanted))r=row}
    if(!r&&wanted){const same=records.filter(x=>x.normalizedName===wanted&&(!p.edc.platform||x.platform===p.edc.platform));if(same.length===1)r=same[0]}
    if(!r)return json(res,409,{error:'The confirmed EDC record moved and is now ambiguous. Re-link it manually from the EDC directory.'});const capturedAt=new Date().toISOString(),edc={...p.edc,name:r.name,normalizedName:r.normalizedName,recordKey:r.recordKey||edcRecordKey(r),ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,capturedAt,confirmed:true,matchMethod:'manual',selectionRule:'Refresh of manually linked EDC record'};const updated=await updatePlayer(p.id,{edc});return json(res,200,{player:updated,edc});
  }`);
server=server.replaceAll("version:'0.9.14'","version:'0.9.15'").replaceAll('Camarillo Darts V0.9.14 running','Camarillo Darts V0.9.15 running');
fs.writeFileSync(serverPath,server);

// The dedicated V0.9.15 renderer owns robustness. This removes the old competing renderer entirely.
let playerUi=fs.readFileSync(playerUiPath,'utf8');
const robustRe=/  function ensureRobustnessColumn\(\)\{[\s\S]*?\n  \}\n  function savedColumns/;
if(!robustRe.test(playerUi))throw new Error('V0.9.15 patch: old robustness renderer not found');
playerUi=playerUi.replace(robustRe,"  function ensureRobustnessColumn(){window.CDNexusRobustnessV0915?.refresh?.()}\n  function savedColumns");
const edcRowsRe=/  function edcResultRows\(rows,target='link'\)\{[^\n]*\}/;
if(!edcRowsRe.test(playerUi))throw new Error('V0.9.15 patch: EDC result renderer not found');
playerUi=playerUi.replace(edcRowsRe,`  function edcResultRows(rows,target='link'){if(!rows.length)return'<div class="raw-empty">No matching EDC records.</div>';return\`<div class="edc-result-list">\${rows.map((r,i)=>\`<div class="edc-result" data-record-key="\${esc(r.recordKey||'')}" data-source-row="\${esc(r.sourceRow)}" data-external-name="\${esc(r.name)}" data-ppd="\${esc(r.ppd??'')}" data-mpr="\${esc(r.mpr??'')}" data-rating="\${esc(r.evpRating??'')}" data-games="\${esc(r.games??'')}" data-platform="\${esc(r.platform||'')}"><div><b>\${esc(r.name)}</b><span>Row \${r.sourceRow}\${r.platform?' · '+esc(r.platform):''}\${r.updatedText?' · '+esc(r.updatedText):''}</span></div><div><strong>\${fmt(r.evpRating,2)}</strong><span>\${fmt(r.ppd,2)} PPD · \${fmt(r.mpr,2)} MPR\${r.games!=null?' · '+Number(r.games).toLocaleString()+' games':''}</span></div>\${target==='link'?\`<button class="mini secondary edc-link-choice" data-i="\${i}">Link</button>\`:''}</div>\`).join('')}</div>\`}`);
const linkEdcRe=/  async function linkEdc\(record\)\{[^\n]*\}/;
if(!linkEdcRe.test(playerUi))throw new Error('V0.9.15 patch: EDC link UI function not found');
playerUi=playerUi.replace(linkEdcRe,`  async function linkEdc(record){const p=selectedPlayer();if(!p){toastV094('Select a Nexus player first.','error');return}try{await api('/api/players/'+encodeURIComponent(p.id)+'/edc-link',{method:'POST',body:JSON.stringify({recordKey:record.recordKey||'',sourceRow:record.sourceRow,name:record.name,ppd:record.ppd,mpr:record.mpr,evpRating:record.evpRating,games:record.games,platform:record.platform,updatedText:record.updatedText})});toastV094('EDC linked to '+(p.name||p.id)+'.','ok');document.dispatchEvent(new CustomEvent('camarillo:identity-linked',{detail:{playerId:String(p.id),source:'edc'}}));await loadData();await refreshLinkWorkspace()}catch(e){toastV094(e.message,'error')}}`);
playerUi=playerUi.replace("<button id=\"edcUnlink\" class=\"mini secondary danger\">Unlink</button>","<button id=\"edcUnlink\" class=\"mini secondary danger\">Unlink EDC record</button>");
const unlinkEdcRe=/  async function unlinkEdc\(\)\{[^\n]*\}/;
if(!unlinkEdcRe.test(playerUi))throw new Error('V0.9.15 patch: EDC unlink UI function not found');
playerUi=playerUi.replace(unlinkEdcRe,`  async function unlinkEdc(){const p=selectedPlayer();if(!p)return;if(!window.confirm('Unlink the EDC record from '+(p.name||'this player')+'?'))return;try{await api('/api/players/'+encodeURIComponent(p.id)+'/edc-link',{method:'DELETE'});toastV094('EDC link removed.','ok');document.dispatchEvent(new CustomEvent('camarillo:source-unlinked',{detail:{playerId:String(p.id),source:'edc'}}));await loadData();await refreshLinkWorkspace()}catch(e){toastV094(e.message,'error')}}`);
playerUi=playerUi.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.14','EXTERNAL PLAYER INTELLIGENCE · V0.9.15');
fs.writeFileSync(playerUiPath,playerUi);

// RAW EDC manual identity linking now forwards the exact searched record snapshot rather than only its row number.
let identityUi=fs.readFileSync(identityUiPath,'utf8');
const doLinkEdc="else if(source==='edc')await api(`/api/players/${encodeURIComponent(p.id)}/edc-link`,{method:'POST',body:JSON.stringify({sourceRow:Number(sourceRow)})});";
required(identityUi,doLinkEdc,'RAW EDC link call');
identityUi=identityUi.replace(doLinkEdc,"else if(source==='edc')await api(`/api/players/${encodeURIComponent(p.id)}/edc-link`,{method:'POST',body:JSON.stringify({recordKey:recordKey||'',sourceRow:Number(sourceRow),name:externalName||'',ppd,mpr,evpRating,games,platform})});");
identityUi=identityUi.replace("async function doLink({source,tocId,sourceRow,externalName,playerId,aliasKind,rememberAlias=true})","async function doLink({source,tocId,recordKey,sourceRow,externalName,ppd,mpr,evpRating,games,platform,playerId,aliasKind,rememberAlias=true})");
const augmentEdcRe=/  function augmentEdc\(\)\{[^\n]*\}/;
if(!augmentEdcRe.test(identityUi))throw new Error('V0.9.15 patch: RAW EDC augmentation not found');
identityUi=identityUi.replace(augmentEdcRe,`  function augmentEdc(){const host=$('#edcRawRows');if(!host)return;for(const row of host.querySelectorAll('.edc-result')){if(row.querySelector('.identity-edc-link'))continue;const sourceRow=Number(row.dataset.sourceRow||0),name=row.dataset.externalName||row.querySelector('b')?.textContent?.trim()||'';if(!sourceRow||!name)continue;const b=document.createElement('button');b.type='button';b.className='mini secondary identity-edc-link';b.textContent='Link to Nexus';for(const k of ['recordKey','sourceRow','externalName','ppd','mpr','rating','games','platform'])if(row.dataset[k]!=null)b.dataset[k]=row.dataset[k];row.appendChild(b)}}`);
const rawClick="void openPicker({source:'edc',sourceRow:Number(eb.dataset.sourceRow),externalName:eb.dataset.externalName,detail:`EDC source row ${eb.dataset.sourceRow}`})";
required(identityUi,rawClick,'RAW EDC click payload');
identityUi=identityUi.replace(rawClick,"void openPicker({source:'edc',recordKey:eb.dataset.recordKey||'',sourceRow:Number(eb.dataset.sourceRow),externalName:eb.dataset.externalName,ppd:eb.dataset.ppd,mpr:eb.dataset.mpr,evpRating:eb.dataset.rating,games:eb.dataset.games,platform:eb.dataset.platform,detail:`EDC source row ${eb.dataset.sourceRow}`})");
fs.writeFileSync(identityUiPath,identityUi);

// TOC already had unlinking; make the destructive action explicit and confirmed.
let tocUi=fs.readFileSync(tocUiPath,'utf8');
const tocUnlink="$('#tocUnlink').addEventListener('click',async()=>{try{await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'DELETE'});toast('PPD/TOC link removed.','ok');await loadPlayerIntel()}catch(e){toast(e.message,'error')}});";
required(tocUi,tocUnlink,'TOC unlink handler');
tocUi=tocUi.replace(tocUnlink,"$('#tocUnlink').addEventListener('click',async()=>{if(!window.confirm('Unlink this PPD/TOC record from the selected Nexus player?'))return;try{await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'DELETE'});toast('PPD/TOC link removed.','ok');document.dispatchEvent(new CustomEvent('camarillo:source-unlinked',{detail:{playerId:String(selectedPlayerId),source:'toc'}}));await loadPlayerIntel()}catch(e){toast(e.message,'error')}});");
fs.writeFileSync(tocUiPath,tocUi);

let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('/v0915-robustness.js'))html=html.replace('</body>','<script src="/v0915-robustness.js"></script></body>');
html=html.replaceAll('V0.9.14','V0.9.15').replaceAll('Camarillo Darts Nexus 0.9.14','Camarillo Darts Nexus 0.9.15');
fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.15';pkg.description='Camarillo Darts Nexus stable EDC linking, explicit unlink controls and dedicated robustness rendering';if(!pkg.scripts)pkg.scripts={};for(const cmd of ['node --check public/v0915-robustness.js','node tests/source-linking-robustness-v0915.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
