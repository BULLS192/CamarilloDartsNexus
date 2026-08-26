import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const tocUiPath=fs.existsSync('/app/public/v090.js')?'/app/public/v090.js':'public/v090.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const req=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`V0.9.12 patch: ${label} anchor not found`)};

// Alias-aware TOC candidate surfacing. Links remain manual.
let toc=fs.readFileSync(tocPath,'utf8');
if(!toc.includes('export function playerIdentityNames(')){
  const anchor='function tokenOverlap(a,b){';req(toc,anchor,'TOC identity-name insertion');
  const helper=`export function playerIdentityNames(player={}){\n  const names=[canonicalPlayerName(player)];\n  for(const a of (Array.isArray(player?.identityAliases)?player.identityAliases:[])){const name=String(a?.name??a??'').trim();if(name)names.push(name)}\n  const seen=new Set(),out=[];for(const name of names){const key=normalizeName(name);if(key&&!seen.has(key)){seen.add(key);out.push(name)}}return out;\n}\n\n`;
  toc=toc.replace(anchor,helper+anchor);
}
const scoreRe=/export function scoreCandidate\(player,toc\)\{[\s\S]*?\n\}\n\nexport async function findTocCandidates\(player,\{limit=8\}=\{\}\)\{[\s\S]*?\n\}/;
if(!scoreRe.test(toc))throw new Error('V0.9.12 patch: TOC candidate functions not found');
toc=toc.replace(scoreRe,`export function scoreCandidate(player,toc){
  const tn=normalizeName(toc?.playerName||''),state=String(player?.state||player?.contact?.state||'').toUpperCase(),ts=String(toc?.vendorState||'').toUpperCase();
  let best={score:0,method:'fuzzy'};const names=playerIdentityNames(player);
  for(let i=0;i<names.length;i++){
    const pn=normalizeName(names[i]);let score=0,method=i===0?'fuzzy':'alias-fuzzy';
    if(pn&&pn===tn){score=i===0?85:82;method=i===0?'exact-name':'exact-alias'}
    else{const pt=pn.split(' '),tt=tn.split(' ');if(pt.length>=2&&tt.length>=2&&pt[0]===tt.at(-1)&&pt.at(-1)===tt[0]){score=i===0?75:72;method=i===0?'swapped-name':'swapped-alias'}else score=Math.round(tokenOverlap(pn,tn)*(i===0?65:62))}
    if(score>best.score)best={score,method};
  }
  let score=best.score,method=best.method;if(state&&ts&&state===ts){score+=12;method+='+state'}
  if(player?.gender&&toc?.sex&&String(player.gender)[0].toUpperCase()===String(toc.sex)[0].toUpperCase())score+=3;
  return {score:Math.min(100,score),method};
}

export async function findTocCandidates(player,{limit=8}={}){
  const names=playerIdentityNames(player);if(!names.length)return[];const byId=new Map();
  for(const name of names.slice(0,10)){const norm=normalizeName(name);if(!norm)continue;const probe=norm.split(' ').at(-1)||norm;const pool=await searchTocDirectory({q:probe,state:'',limit:100});for(const row of pool)byId.set(row.tocId,row)}
  return [...byId.values()].map(toc=>({toc,...scoreCandidate(player,toc)})).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score||String(a.toc.playerName).localeCompare(String(b.toc.playerName))).slice(0,limit);
}`);
toc=toc.replace("const VERSION='0.9.11';","const VERSION='0.9.12';");
fs.writeFileSync(tocPath,toc);

// Robustness: deterministic BullShooter ID mapping, actual sample sizes/counts, and correct verified-source semantics.
let ui=fs.readFileSync(uiPath,'utf8');
const sourceFlagsRe=/  function sourceFlags\(player\)\{[^\n]*\}/;
if(!sourceFlagsRe.test(ui))throw new Error('V0.9.12 patch: sourceFlags not found');
ui=ui.replace(sourceFlagsRe,`  function bsEvidenceGames(b={}){const explicit=Math.max(0,Number(b.totalGames||b.games||b.currentStatsDiagnostics?.totalGames||0));if(explicit)return explicit;const diagnostic=Math.max(0,Number(b.currentStatsDiagnostics?.x01Count||0)+Number(b.currentStatsDiagnostics?.cricketCount||0));if(diagnostic)return diagnostic;return Math.max(0,Number(b.last50SampleSize||0),Number(b.last50PPDSampleSize||0),Number(b.last50MPRSampleSize||0),Number(b.last20SampleSize||0),Number(b.last20PPDSampleSize||0),Number(b.last20MPRSampleSize||0),Number(b.last10SampleSize||0),Number(b.last10PPDSampleSize||0),Number(b.last10MPRSampleSize||0),(n(b.ppd)!==null||n(b.mpr)!==null)?1:0)}
  function sourceFlags(player){const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{},link=linkFor(player?.id);return{bs:Boolean(bsEvidenceGames(b)>0),toc:Boolean(link&&link.confirmed!==false),edc:Boolean(e?.confirmed===true&&(n(e.ppd)!==null||n(e.mpr)!==null)),cd:Boolean(Number(c.games01||0)+Number(c.gamesCricket||0)>0||n(c.last30PPD)!==null||n(c.last30MPR)!==null)}}`);
const robustRe=/  function robustness\(player\)\{[\s\S]*?\n  \}\n  function findPlayerTable/;
if(!robustRe.test(ui))throw new Error('V0.9.12 patch: robustness block not found');
ui=ui.replace(robustRe,`  function robustness(player){
    const cacheKey=String(player?.id??'');if(cacheKey&&robustnessCache.has(cacheKey))return robustnessCache.get(cacheKey);
    const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{},flags=sourceFlags(player),sources=Object.values(flags).filter(Boolean).length;
    const bsGames=bsEvidenceGames(b),edcGames=Math.max(0,Number(e.games||0)),cdGames=Math.max(0,Number(c.games01||0)+Number(c.gamesCricket||0));
    let sample=0;if(flags.bs)sample+=18*clamp(Math.log1p(bsGames)/Math.log(501),0,1);if(flags.edc)sample+=12*clamp(Math.log1p(Math.max(1,edcGames))/Math.log(1001),0,1);if(flags.cd)sample+=10*clamp(Math.log1p(Math.max(1,cdGames))/Math.log(101),0,1);sample=clamp(sample,0,40);
    const coverage=clamp(sources*7.5,0,30),pairs=['bs','toc','edc','cd'].map(x=>pair(player,x)).filter(Boolean);let agreement=0;
    if(pairs.length>=2){let total=0,count=0;for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){const dp=Math.abs(pairs[i].ppd-pairs[j].ppd),dm=Math.abs(pairs[i].mpr-pairs[j].mpr);total+=dp<=1.5&&dm<=.15?1:dp<=3&&dm<=.3?.6:.2;count++}agreement=20*(total/count)}
    const fresh=[];if(flags.bs)fresh.push(freshnessPoints(b.syncedAt||b.lastSyncedAt||b.updatedAt));if(flags.edc)fresh.push(freshnessPoints(e.capturedAt));const link=linkFor(player?.id);if(flags.toc)fresh.push(freshnessPoints(link?.updatedAt||link?.updated_at||link?.linkedAt||link?.linked_at));const freshness=fresh.length?10*(fresh.reduce((a,v)=>a+v,0)/fresh.length):0;
    const score=Math.round(clamp(sample+coverage+agreement+freshness,0,100)),label=score>=85?'Verified':score>=70?'Strong':score>=50?'Solid':score>=25?'Developing':'Thin';const out={score,label,sample:Math.round(sample),coverage:Math.round(coverage),agreement:Math.round(agreement),freshness:Math.round(freshness),sources,flags,bsGames,edcGames,cdGames};if(cacheKey)robustnessCache.set(cacheKey,out);return out;
  }
  function findPlayerTable`);
const rebuildRe=/  function rebuildIndexes\(\)\{[\s\S]*?\n  \}\n  function linkFor/;
if(!rebuildRe.test(ui))throw new Error('V0.9.12 patch: rebuildIndexes not found');
ui=ui.replace(rebuildRe,`  function rebuildIndexes(){
    playerById=new Map();playerByBsId=new Map();playerByName=new Map();tocLinkByPlayerId=new Map();robustnessCache.clear();
    for(const p of players){const id=String(p?.id??'');if(id)playerById.set(id,p);for(const bs of [p?.bullshooter?.id,p?.bullshooterId,p?.bullshooter_id]){const key=String(bs??'').trim();if(key)playerByBsId.set(key,p)}const labels=[p?.name,[p?.firstName,p?.lastName].filter(Boolean).join(' '),String(p?.name||'').replace(/[\\\"“][^\\\"”]+[\\\"”]/g,' ')];for(const a of (p?.identityAliases||[]))labels.push(a?.name||a);for(const label of labels){const k=norm(label);if(k&&!playerByName.has(k))playerByName.set(k,p)}}
    for(const l of tocLinks){const id=String(l?.playerId??l?.player_id??'');if(id)tocLinkByPlayerId.set(id,l)}
  }
  function linkFor`);
const playerRowRe=/  function playerForRow\(row\)\{[\s\S]*?\n  \}/;
if(!playerRowRe.test(ui))throw new Error('V0.9.12 patch: playerForRow not found');
ui=ui.replace(playerRowRe,`  function playerForRow(row){const cached=String(row?.dataset?.nexusPlayerId||'');if(cached&&playerById.has(cached))return playerById.get(cached);const text=row?.textContent||'',bs=(text.match(/#\\s*(\\d{3,})\\b/)||[])[1];let p=bs?playerByBsId.get(bs):null;const raw=row?.cells?.[0]?.textContent||'',first=norm(raw),base=norm(String(raw).replace(/[\\\"“][^\\\"”]+[\\\"”]/g,' '));if(!p&&first)p=playerByName.get(first)||null;if(!p&&base)p=playerByName.get(base)||null;if(!p){for(const key of [first,base].filter(Boolean)){for(const [name,candidate] of playerByName){if(key===name||key.startsWith(name+' ')||name.startsWith(key+' ')){p=candidate;break}}if(p)break}}if(p)row.dataset.nexusPlayerId=String(p.id);return p||null}`);
ui=ui.replace("row.dataset.searchable=norm(`${p.name||''} ${p.nickname||''} ${p.bullshooter?.id||''} ${p.edc?.name||''}`);","row.dataset.searchable=norm(`${p.name||''} ${p.nickname||''} ${p.bullshooter?.id||''} ${p.edc?.name||''} ${(p.identityAliases||[]).map(a=>a?.name||a).join(' ')}`);");
const edcLinkAnchor="await api(`/api/players/${encodeURIComponent(p.id)}/edc-link`,{method:'POST',body:JSON.stringify({sourceRow:record.sourceRow})});toastV094(`EDC linked to ${p.name}.`,'ok');";
if(ui.includes(edcLinkAnchor))ui=ui.replace(edcLinkAnchor,"await api(`/api/players/${encodeURIComponent(p.id)}/edc-link`,{method:'POST',body:JSON.stringify({sourceRow:record.sourceRow})});await api(`/api/players/${encodeURIComponent(p.id)}/aliases`,{method:'POST',body:JSON.stringify({name:record.name,kind:'external-name',source:'edc',verified:true})}).catch(()=>{});toastV094(`EDC linked to ${p.name}.`,'ok');");
const bootAnchor="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();";
req(ui,bootAnchor,'identity-linked refresh');ui=ui.replace(bootAnchor,"document.addEventListener('camarillo:identity-linked',()=>{void loadData()});\n  "+bootAnchor);
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.11','EXTERNAL PLAYER INTELLIGENCE · V0.9.12');
fs.writeFileSync(uiPath,ui);

// Existing player-first TOC links also teach Nexus a verified external name when it differs.
let tocUi=fs.readFileSync(tocUiPath,'utf8');
const tocLinkAnchor="await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'POST',body:JSON.stringify({tocId,confirmed:true,matchMethod:'manual',confidence:'confirmed'})});toast('PPD/TOC player linked.','ok');selectedToc=null;";
if(tocUi.includes(tocLinkAnchor))tocUi=tocUi.replace(tocLinkAnchor,"const linkedName=selectedToc?.playerName||'';await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'POST',body:JSON.stringify({tocId,confirmed:true,matchMethod:'manual',confidence:'confirmed'})});if(linkedName)await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/aliases`,{method:'POST',body:JSON.stringify({name:linkedName,kind:'external-name',source:'toc',verified:true})}).catch(()=>{});toast('PPD/TOC player linked.','ok');selectedToc=null;");
fs.writeFileSync(tocUiPath,tocUi);

// Alias persistence lives in the Nexus player state. It does not auto-link any source record.
let server=fs.readFileSync(serverPath,'utf8');
const dashboardAnchor="  if(url.pathname==='/api/dashboard'&&req.method==='GET')return json(res,200,await dashboard());";req(server,dashboardAnchor,'alias route insertion');
const aliasRoutes=`  const aliasMatch=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/aliases$/);if(aliasMatch&&req.method==='GET'){const p=await getPlayer(aliasMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});return json(res,200,Array.isArray(p.identityAliases)?p.identityAliases:[])}
  if(aliasMatch&&req.method==='POST'){const p=await getPlayer(aliasMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req),name=String(input.name||'').trim();if(!name)return json(res,400,{error:'Alias name is required.'});const normalizeIdentity=v=>String(v||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' '),canonical=([p.firstName,p.lastName].filter(Boolean).join(' ')||String(p.name||'').replace(/[\\\"“][^\\\"”]+[\\\"”]/g,' ')).trim();if(normalizeIdentity(name)===normalizeIdentity(canonical))return json(res,200,{player:p,aliases:Array.isArray(p.identityAliases)?p.identityAliases:[],skipped:true});const aliases=Array.isArray(p.identityAliases)?[...p.identityAliases]:[],key=normalizeIdentity(name),at=new Date().toISOString(),row={name,normalizedName:key,kind:String(input.kind||'external-name'),source:String(input.source||'manual'),verified:input.verified!==false,createdAt:at,updatedAt:at};const i=aliases.findIndex(a=>normalizeIdentity(a?.name||a)===key);if(i>=0)aliases[i]={...aliases[i],...row,createdAt:aliases[i]?.createdAt||at};else aliases.push(row);const updated=await updatePlayer(p.id,{identityAliases:aliases.slice(0,30)});invalidateTocIntelligence(p.id);await auditEvent({action:'player_identity_alias_added',entityType:'player',entityId:p.id,metadata:{name,kind:row.kind,source:row.source}}).catch(()=>{});return json(res,200,{player:updated,aliases:updated.identityAliases||aliases})}
  if(aliasMatch&&req.method==='DELETE'){const p=await getPlayer(aliasMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req),name=String(input.name||'').trim(),normalizeIdentity=v=>String(v||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' '),key=normalizeIdentity(name);const aliases=(Array.isArray(p.identityAliases)?p.identityAliases:[]).filter(a=>normalizeIdentity(a?.name||a)!==key);const updated=await updatePlayer(p.id,{identityAliases:aliases});invalidateTocIntelligence(p.id);return json(res,200,{player:updated,aliases})}
`;
server=server.replace(dashboardAnchor,aliasRoutes+dashboardAnchor);
server=server.replaceAll("version:'0.9.11'","version:'0.9.12'").replaceAll('Camarillo Darts V0.9.11 running','Camarillo Darts V0.9.12 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');if(!html.includes('/v0912-identity.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v0912-identity.css"></head>');if(!html.includes('/v0912-identity.js'))html=html.replace('</body>','<script src="/v0912-identity.js"></script></body>');html=html.replaceAll('V0.9.11','V0.9.12').replaceAll('Camarillo Darts Nexus 0.9.11','Camarillo Darts Nexus 0.9.12');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.12';pkg.description='Camarillo Darts Nexus verified identity aliases, raw-source manual linking and deterministic robustness';if(!pkg.scripts)pkg.scripts={};const additions=['node --check public/v0912-identity.js','node tests/player-identity-v0912.test.js'];let check=String(pkg.scripts.check||'');for(const cmd of additions)if(!check.includes(cmd))check+=(check?' && ':'')+cmd;pkg.scripts.check=check;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
