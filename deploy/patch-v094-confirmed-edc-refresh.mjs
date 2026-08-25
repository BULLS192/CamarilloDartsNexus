import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');

const oldBlock=`async function refreshEdcBackground(){
  if(sourceSyncState.edc.running)return;sourceSyncState.edc.running=true;sourceSyncState.edc.lastStartedAt=new Date().toISOString();sourceSyncState.edc.error=null;
  try{const d=await loadEdcDataset({force:true});sourceSyncState.edc.lastRecordCount=d.recordCount;sourceSyncState.edc.lastSuccessAt=new Date().toISOString();console.log('[EDC] background refresh complete: '+d.recordCount+' records')}
  catch(error){sourceSyncState.edc.error=error.message||String(error);console.error('[EDC] background refresh failed:',sourceSyncState.edc.error)}
  finally{sourceSyncState.edc.running=false;sourceSyncState.edc.lastFinishedAt=new Date().toISOString()}
}`;

const newBlock=`function linkedEdcRecord(player,dataset){
  const e=player?.edc||{};if(e.confirmed!==true)return null;
  const wanted=String(e.normalizedName||'');
  let r=dataset.records.find(x=>Number(x.sourceRow)===Number(e.sourceRow)&&(!wanted||x.normalizedName===wanted));
  if(!r&&wanted){const same=dataset.records.filter(x=>x.normalizedName===wanted&&(!e.platform||x.platform===e.platform));if(same.length===1)r=same[0]}
  return r||null;
}
function edcLinkFingerprint(e={}){return JSON.stringify([e.name,e.normalizedName,e.ppd,e.mpr,e.evpRating,e.calculatedEvpRating,e.games,e.preferredStyle,e.platform,e.updatedText,e.sourceRow,e.sourceFormat,e.ratingDelta])}
async function refreshConfirmedEdcLinks(dataset){
  const players=await listPlayers();let checked=0,updated=0,unresolved=0;
  for(const p of players){
    if(p?.edc?.confirmed!==true)continue;checked++;
    const r=linkedEdcRecord(p,dataset);if(!r){unresolved++;continue}
    const next={...p.edc,name:r.name,normalizedName:r.normalizedName,ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,confirmed:true,matchMethod:'manual',selectionRule:'Background refresh of manually confirmed EDC record'};
    if(edcLinkFingerprint(next)===edcLinkFingerprint(p.edc))continue;
    next.capturedAt=new Date().toISOString();await updatePlayer(p.id,{edc:next});updated++;
  }
  return{checked,updated,unresolved};
}
async function refreshEdcBackground(){
  if(sourceSyncState.edc.running)return;sourceSyncState.edc.running=true;sourceSyncState.edc.lastStartedAt=new Date().toISOString();sourceSyncState.edc.error=null;
  try{const d=await loadEdcDataset({force:true});const linked=await refreshConfirmedEdcLinks(d);sourceSyncState.edc.lastRecordCount=d.recordCount;sourceSyncState.edc.lastSuccessAt=new Date().toISOString();sourceSyncState.edc.linkedChecked=linked.checked;sourceSyncState.edc.linkedUpdated=linked.updated;sourceSyncState.edc.linkedUnresolved=linked.unresolved;console.log('[EDC] background refresh complete: '+d.recordCount+' records; '+linked.updated+'/'+linked.checked+' confirmed links updated')}
  catch(error){sourceSyncState.edc.error=error.message||String(error);console.error('[EDC] background refresh failed:',sourceSyncState.edc.error)}
  finally{sourceSyncState.edc.running=false;sourceSyncState.edc.lastFinishedAt=new Date().toISOString()}
}`;

if(!server.includes(oldBlock))throw new Error('V0.9.4 confirmed EDC refresh patch: background EDC anchor not found');
server=server.replace(oldBlock,newBlock);
fs.writeFileSync(serverPath,server);
