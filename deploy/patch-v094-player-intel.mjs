import fs from 'node:fs';

const replaceRequired=(text,from,to,label)=>{
  if(!text.includes(from))throw new Error(`V0.9.4 patch: ${label} anchor not found`);
  return text.replace(from,to);
};

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');
toc=replaceRequired(toc,"const VERSION='0.9.3';","const VERSION='0.9.4';",'TOC version');
const tocLinkAnchor=`async function getTocLink(playerId){`;
if(!toc.includes('export async function listTocLinks()')){
  const listFn=`export async function listTocLinks(){
  if(REMOTE){
    const rows=await remoteAll('camarillo_player_toc_links','player_id,toc_id,mpid,confirmed,match_method,confidence,linked_at,updated_at');
    return rows.map(r=>({playerId:r.player_id,tocId:r.toc_id,mpid:r.mpid,confirmed:r.confirmed,matchMethod:r.match_method,confidence:r.confidence,linkedAt:r.linked_at,updatedAt:r.updated_at}));
  }
  const db=await readLocal();return (db.links||[]).map(r=>({...r}));
}

`;
  toc=replaceRequired(toc,tocLinkAnchor,listFn+tocLinkAnchor,'TOC link list insertion');
}
fs.writeFileSync(tocPath,toc);

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=replaceRequired(
  server,
  "import { startTocSync,tocStatus,searchTocDirectory,getTocPlayer,getPlayerTocIntelligence,linkTocPlayer,unlinkTocPlayer } from './src/dartstoc.js';",
  "import { startTocSync,tocStatus,searchTocDirectory,getTocPlayer,getPlayerTocIntelligence,linkTocPlayer,unlinkTocPlayer,listTocLinks } from './src/dartstoc.js';",
  'TOC server import'
);
server=replaceRequired(
  server,
  "import { edcHealth, searchEdcPlayers, findEdcPlayer, EDC_DEFAULT_PUBLISHED_URL } from './src/edc.js';",
  "import { edcHealth, searchEdcPlayers, findEdcPlayer, loadEdcDataset, EDC_DEFAULT_PUBLISHED_URL } from './src/edc.js';",
  'EDC server import'
);

const syncStart="  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/sync$/);if(m&&req.method==='POST'){";
const syncEnd="    return json(res,200,{...updated,syncSources});\n  }";
const s0=server.indexOf(syncStart),s1=server.indexOf(syncEnd,s0);
if(s0<0||s1<0)throw new Error('V0.9.4 patch: resilient player sync route not found');
const bullOnly=`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});
    const bs=String(p.bullshooter?.id||'').trim();if(!bs)return json(res,409,{error:'No BullShooter ID is linked to this Nexus player.'});
    try{const profile=await importBullshooterProfile(bs);const updated=await attachBullshooterProfile(p.id,profile);return json(res,200,{...updated,syncSources:{bullshooter:{ok:true,id:bs},edc:{ok:false,skipped:true,manualOnly:true},toc:{ok:false,skipped:true,manualOnly:true}}})}
    catch(error){return json(res,502,{error:error.message||String(error),sources:{bullshooter:{ok:false,id:bs,error:error.message||String(error)},edc:{ok:false,skipped:true,manualOnly:true},toc:{ok:false,skipped:true,manualOnly:true}}})}
  }`;
server=server.slice(0,s0)+bullOnly+server.slice(s1+syncEnd.length);

const tocDirectoryRoute="  if(url.pathname==='/api/toc/directory'&&req.method==='GET')return json(res,200,await searchTocDirectory({q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'',vendor:url.searchParams.get('vendor')||'',limit:url.searchParams.get('limit')||50,offset:url.searchParams.get('offset')||0}));";
server=replaceRequired(server,tocDirectoryRoute,tocDirectoryRoute+"\n  if(url.pathname==='/api/toc/links'&&req.method==='GET')return json(res,200,await listTocLinks());",'TOC links route');

const edcStart="  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/);if(m&&req.method==='POST'){";
const e0=server.indexOf(edcStart);if(e0<0)throw new Error('V0.9.4 patch: legacy EDC sync route not found');
const e1=server.indexOf('\n',e0);if(e1<0)throw new Error('V0.9.4 patch: legacy EDC sync route line end not found');
const edcRoutes=`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-link$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req),sourceRow=Number(input.sourceRow);if(!Number.isInteger(sourceRow)||sourceRow<1)return json(res,400,{error:'A valid EDC sourceRow is required.'});
    const dataset=await loadEdcDataset({force:Boolean(input.force)}),r=dataset.records.find(x=>Number(x.sourceRow)===sourceRow);if(!r)return json(res,404,{error:'That EDC source row is no longer available. Search the EDC directory again.'});
    const capturedAt=new Date().toISOString(),edc={name:r.name,normalizedName:r.normalizedName,ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,capturedAt,parserVersion:'0.9.0-edc.1',confirmed:true,matchMethod:'manual',selectionRule:'Manually linked by Nexus operator'};
    const updated=await updatePlayer(p.id,{edc});await auditEvent({action:'edc_player_linked',entityType:'player',entityId:p.id,metadata:{sourceRow:r.sourceRow,edcName:r.name}}).catch(()=>{});return json(res,200,{player:updated,edc});
  }
  if(m&&req.method==='DELETE'){const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const updated=await updatePlayer(p.id,{edc:null});await auditEvent({action:'edc_player_unlinked',entityType:'player',entityId:p.id}).catch(()=>{});return json(res,200,{player:updated,ok:true})}
  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});if(p.edc?.confirmed!==true)return json(res,409,{error:'EDC is not manually linked for this player. Use Player Source Linking first.'});const input=await body(req),dataset=await loadEdcDataset({force:Boolean(input.force)}),wanted=String(p.edc.normalizedName||'');let r=dataset.records.find(x=>Number(x.sourceRow)===Number(p.edc.sourceRow)&&(!wanted||x.normalizedName===wanted));
    if(!r&&wanted){const same=dataset.records.filter(x=>x.normalizedName===wanted&&(!p.edc.platform||x.platform===p.edc.platform));if(same.length===1)r=same[0]}
    if(!r)return json(res,409,{error:'The confirmed EDC record moved or became ambiguous. Re-link it manually from the EDC directory.'});const capturedAt=new Date().toISOString(),edc={...p.edc,name:r.name,normalizedName:r.normalizedName,ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,capturedAt,confirmed:true,matchMethod:'manual',selectionRule:'Refresh of manually linked EDC record'};const updated=await updatePlayer(p.id,{edc});return json(res,200,{player:updated,edc});
  }`;
server=server.slice(0,e0)+edcRoutes+server.slice(e1);
server=server.replaceAll("version:'0.9.3'","version:'0.9.4'").replaceAll('Camarillo Darts V0.9.3 running','Camarillo Darts V0.9.4 running');
fs.writeFileSync(serverPath,server);

const ratingsPath=fs.existsSync('/app/src/ratings.js')?'/app/src/ratings.js':'src/ratings.js';
let ratings=fs.readFileSync(ratingsPath,'utf8');
ratings=replaceRequired(ratings,"  const edcPPD=asNumber(e.ppd), edcMPR=asNumber(e.mpr);const hasBsPPD=Number.isFinite(bsPPD), hasBsMPR=Number.isFinite(bsMPR), hasEdcPPD=Number.isFinite(edcPPD), hasEdcMPR=Number.isFinite(edcMPR);","  const edcPPD=e.confirmed===true?asNumber(e.ppd):null, edcMPR=e.confirmed===true?asNumber(e.mpr):null;const hasBsPPD=Number.isFinite(bsPPD), hasBsMPR=Number.isFinite(bsMPR), hasEdcPPD=Number.isFinite(edcPPD), hasEdcMPR=Number.isFinite(edcMPR);",'confirmed EDC rating gate');
fs.writeFileSync(ratingsPath,ratings);

const statsUiPath=fs.existsSync('/app/public/v092-stats.js')?'/app/public/v092-stats.js':'public/v092-stats.js';
let statsUi=fs.readFileSync(statsUiPath,'utf8');
statsUi=replaceRequired(statsUi,"    const startPPD=bsPPD!==null?bsPPD:n(e.ppd),startMPR=bsMPR!==null?bsMPR:n(e.mpr);\n    const ppdSource=bsPPD!==null?'BullShooter':(n(e.ppd)!==null?'EDC':'—');\n    const mprSource=bsMPR!==null?'BullShooter':(n(e.mpr)!==null?'EDC':'—');","    const verifiedEdc=e.confirmed===true;\n    const startPPD=bsPPD!==null?bsPPD:(verifiedEdc?n(e.ppd):null),startMPR=bsMPR!==null?bsMPR:(verifiedEdc?n(e.mpr):null);\n    const ppdSource=bsPPD!==null?'BullShooter':(verifiedEdc&&n(e.ppd)!==null?'EDC':'—');\n    const mprSource=bsMPR!==null?'BullShooter':(verifiedEdc&&n(e.mpr)!==null?'EDC':'—');",'client confirmed EDC rating gate');
statsUi=replaceRequired(statsUi,"    const edcPair=(n(e.ppd)!==null||n(e.mpr)!==null)?{ppd:e.ppd,mpr:e.mpr}:null;","    const edcPair=e.confirmed===true&&(n(e.ppd)!==null||n(e.mpr)!==null)?{ppd:e.ppd,mpr:e.mpr}:null;",'client EDC divergence gate');
fs.writeFileSync(statsUiPath,statsUi);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('/v094-player-intel.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v094-player-intel.css"></head>');
if(!html.includes('/v094-player-intel.js'))html=html.replace('</body>','<script src="/v094-player-intel.js"></script></body>');
html=html.replaceAll('V0.9.3','V0.9.4').replaceAll('Camarillo Darts Nexus 0.9.3','Camarillo Darts Nexus 0.9.4');
fs.writeFileSync(indexPath,html);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.4';pkg.description='Camarillo Darts Nexus manual multi-source player linking, raw directories and rating robustness';
const additions=['node --check public/v094-player-intel.js','node tests/player-intel-v094.test.js'];let check=String(pkg.scripts?.check||'');for(const cmd of additions)if(!check.includes(cmd))check+=(check?' && ':'')+cmd;if(!pkg.scripts)pkg.scripts={};pkg.scripts.check=check;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
