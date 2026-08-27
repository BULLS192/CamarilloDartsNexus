import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  bull:fs.existsSync('/app/public/v077.js')?'/app/public/v077.js':'public/v077.js',
  legacyRating:fs.existsSync('/app/public/v0711.js')?'/app/public/v0711.js':'public/v0711.js',
  ui:fs.existsSync('/app/public/v1000-rating.js')?'/app/public/v1000-rating.js':'public/v1000-rating.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v1001-player-metrics-applied':'.v1001-player-metrics-applied',
  consensusMarker:fs.existsSync('/app')?'/app/.v1002-consensus-rating-applied':'.v1002-consensus-rating-applied',
  tableMarker:fs.existsSync('/app')?'/app/.v1003-player-table-applied':'.v1003-player-table-applied'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.11.2 patch: ${label} anchor not found`)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.11.2 patch: ${label} anchors not found`);
  return text.slice(0,start)+replacement+text.slice(end);
};

let store=fs.readFileSync(paths.store,'utf8');
need(store,'/rest/v1/rpc/camarillo_nexus_rating_index','V0.10.0 Nexus Rating RPC');
store=store.replace('/rest/v1/rpc/camarillo_nexus_rating_index','/rest/v1/rpc/camarillo_player_metrics_index')
  .replace('Supabase Nexus Rating read failed','Supabase player metrics read failed')
  .replace('Supabase Nexus Rating RPC returned an invalid index.','Supabase player metrics RPC returned an invalid index.');
fs.writeFileSync(paths.store,store);

let server=fs.readFileSync(paths.server,'utf8');
need(server,"url.pathname==='/api/players/nexus-rating'",'Nexus Rating route');
server=server.replaceAll("version:'0.10.0'","version:'0.11.2'").replaceAll('Camarillo Darts V0.10.0 running','Camarillo Darts V0.11.2 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=replaceBetween(player,'function ensureRobustnessColumn(){','function savedColumns(){',`function ensureRobustnessColumn(){\n    playerTable=findPlayerTable();if(!playerTable)return;\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n    applyPlayerFilters();\n  }\n  `,'legacy robustness delegate');
if(player.includes('function ensureCanonicalRobustnessRuntime(){'))player=replaceBetween(player,'function ensureCanonicalRobustnessRuntime(){','ensureCanonicalRobustnessRuntime();',`function ensureCanonicalRobustnessRuntime(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n  `,'legacy robustness runtime loader');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.23','EXTERNAL PLAYER INTELLIGENCE · V0.11.2');
fs.writeFileSync(paths.player,player);

let bull=fs.readFileSync(paths.bull,'utf8');
bull=replaceBetween(bull,'async function patchDisplays(){','async function enhanceDiagnostics(){',`async function patchDisplays(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BullShooter table renderer');
fs.writeFileSync(paths.bull,bull);

let legacyRating=fs.readFileSync(paths.legacyRating,'utf8');
legacyRating=replaceBetween(legacyRating,'async function patchRatings(){','let timer=null;',`async function patchRatings(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BS/CD rating renderer');
fs.writeFileSync(paths.legacyRating,legacyRating);

const ui=fs.readFileSync(paths.ui,'utf8');
need(ui,"const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS'];",'base canonical Players schema');
need(ui,"match(/#\\s*(\\d{3,})/)",'loose BullShooter ID matcher');
need(ui,'windowMarkup(b.last50PPD,b.last50MPR','BS50 rating renderer');
fs.writeFileSync(paths.ui,ui);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script\s+src=["']\/v0918-table\.js(?:\?[^"']*)?["'][^>]*><\/script>/g,'');
html=html.replaceAll('/v1000-rating.js?v=0.10.0','/v1000-rating.js?v=0.11.2').replaceAll('/v1000-rating.css?v=0.10.0','/v1000-rating.css?v=0.11.2').replaceAll('V0.10.0','V0.11.2').replaceAll('Camarillo Darts Nexus 0.10.0','Camarillo Darts Nexus 0.11.2');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.11.2';pkg.description='Camarillo Darts Nexus v2 rating with distinct Camarillo local rating and stable semantic player metrics rendering';if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node tests/player-metrics-v1001.test.js','node tests/consensus-rating-v1002.test.js','node tests/player-render-v112.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');

// Distinguish the local Camarillo tracker from the blended Nexus master rating.
let ui2=fs.readFileSync(paths.ui,'utf8');
ui2=ui2.replace(
  "const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS'];",
  "const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'];"
);
need(ui2,'  const robustnessMarkup=r=>{','robustness renderer');
ui2=ui2.replace('  const robustnessMarkup=r=>{',`  const camarilloMarkup=entry=>{\n    if(!entry)return'<div class="skill-rating-block camarillo-rating-block missing" title="No Nexus player metrics matched"><strong>—</strong><small>No player metrics</small></div>';\n    const games=Number(entry?.evidence?.cd501Games||0)+Number(entry?.evidence?.cdCricketGames||0);\n    const weight=Number(entry?.sourceWeights?.camarillo||0);\n    const raw=entry?.camarilloRating??entry?.sourceRatings?.camarillo??0;\n    const rating=Number.isFinite(Number(raw))?Number(raw):0;\n    if(!(games>0&&weight>0))return'<div class="skill-rating-block camarillo-rating-block" title="Camarillo Rating uses only Camarillo-organized league, tournament and event games. No eligible games recorded yet."><strong>0.0</strong><small>0 Camarillo games</small></div>';\n    return\`<div class="skill-rating-block camarillo-rating-block" title="Camarillo Rating \${fmt(rating,1)} · only Camarillo-organized play · \${games} recorded game\${games===1?'':'s'}"><strong>\${fmt(rating,1)}</strong><small>\${games} Camarillo game\${games===1?'':'s'}</small></div>\`;\n  };\n  const robustnessGrade=score=>Number(score)>=85?'S':Number(score)>=70?'A':Number(score)>=50?'B':Number(score)>=25?'C':'D';\n  const robustnessMarkup=r=>{`);
ui2=replaceBetween(ui2,'  const robustnessMarkup=r=>{','\n\n  function syncHidden',`  const robustnessMarkup=r=>{\n    if(!r||!Number.isFinite(Number(r.score)))return'<span class="robustness-badge robustness-grade grade-missing" title="No robustness record matched this Nexus player"><strong>—</strong><small>— / 100</small></span>';\n    const c=r.components||{},e=r.evidence||{},grade=robustnessGrade(r.score);\n    const title=\`Robustness \${grade} · \${r.score}/100 · EDC \${c.edc??0}/30 (\${e.edcGames??0}/80 games) · PPD/TOC \${c.toc??0}/30 · BullShooter 501 \${c.bullshooter501??0}/20 (\${e.bs501Games??0}/50 games) · BullShooter Cricket \${c.bullshooterCricket??0}/20 (\${e.bsCricketGames??0}/50 games)\`;\n    return\`<span class="robustness-badge robustness-grade grade-\${grade.toLowerCase()}" title="\${title}"><strong>\${grade}</strong><small>\${r.score} / 100</small></span>\`;\n  };`,'robustness grade renderer');
ui2=ui2.replace(
  "const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};",
  "const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10','CAMARILLO RATING':'Camarillo Rating','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};"
);
ui2=ui2.replace(
  "if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='NEXUS RATING'&&(hidden.get('CAMARILLO')||hidden.get('RATING')||hidden.get('BS / CD RATING'))))",
  "if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='CAMARILLO RATING'&&hidden.get('CAMARILLO'))||(label==='NEXUS RATING'&&(hidden.get('RATING')||hidden.get('BS / CD RATING'))))"
);
ui2=ui2.replace(
  "const rating=take('NEXUS RATING','CAMARILLO','BS / CD RATING','RATING');",
  "const camarillo=take('CAMARILLO RATING','CAMARILLO');\n      const rating=take('NEXUS RATING','BS / CD RATING','RATING');"
);
ui2=ui2.replace(
  "take('PLAYER'),take('CONTACT'),take('HOME'),take('BULLSHOOTER'),take('BS CURRENT'),take('BS50','BS30'),take('BS20'),take('BS10'),rating,robust,act",
  "take('PLAYER'),take('CONTACT'),take('HOME'),take('BULLSHOOTER'),take('BS CURRENT'),take('BS50','BS30'),take('BS20'),take('BS10'),camarillo,rating,robust,act"
);
ui2=ui2.replace(
  "ordered[8].dataset.v1100='nexus-rating';ordered[9].dataset.v1100='robustness';",
  "ordered[8].dataset.v111='camarillo-rating';ordered[9].dataset.v1100='nexus-rating';ordered[10].dataset.v1100='robustness';"
);
ui2=ui2.replace(
  "current:headerIndex(t,'BS CURRENT'),bs50:headerIndex(t,'BS50'),bs20:headerIndex(t,'BS20'),bs10:headerIndex(t,'BS10'),\n      rating:headerIndex(t,'NEXUS RATING'),robust:headerIndex(t,'ROBUSTNESS'),bs:headerIndex(t,'BULLSHOOTER')",
  "current:headerIndex(t,'BS CURRENT'),bs50:headerIndex(t,'BS50'),bs20:headerIndex(t,'BS20'),bs10:headerIndex(t,'BS10'),\n      camarillo:headerIndex(t,'CAMARILLO RATING','CAMARILLO'),rating:headerIndex(t,'NEXUS RATING'),robust:headerIndex(t,'ROBUSTNESS'),bs:headerIndex(t,'BULLSHOOTER')"
);
ui2=ui2.replace("if(idx.rating<0||idx.robust<0||idx.bs<0)return;","if(idx.camarillo<0||idx.rating<0||idx.robust<0||idx.bs<0)return;");
ui2=ui2.replace(
  "const ratingCell=row.cells[idx.rating],robustCell=row.cells[idx.robust];if(!ratingCell||!robustCell)continue;\n      const entry=entryForRow(identity,names),id=identity.id;",
  "const camarilloCell=row.cells[idx.camarillo],ratingCell=row.cells[idx.rating],robustCell=row.cells[idx.robust];if(!camarilloCell||!ratingCell||!robustCell)continue;\n      const entry=entryForRow(identity,names),id=identity.id;\n      const camarilloSig=entry?`${id}|${entry.playerId||''}|${entry.camarilloRating}|${entry?.sourceWeights?.camarillo||0}|${entry?.evidence?.cd501Games||0}|${entry?.evidence?.cdCricketGames||0}`:`missing|${id}|${identity.pid}`;\n      if(camarilloCell.dataset.v111RatingSig!==camarilloSig||!camarilloCell.querySelector('.camarillo-rating-block')){camarilloCell.innerHTML=camarilloMarkup(entry);camarilloCell.dataset.v111RatingSig=camarilloSig}"
);
ui2=ui2.replaceAll('V0.11.0','V0.11.2');
fs.writeFileSync(paths.ui,ui2);

const cssPath=fs.existsSync('/app/public/v1000-rating.css')?'/app/public/v1000-rating.css':'public/v1000-rating.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('.robustness-badge.robustness-grade'))css+='.camarillo-rating-block strong{font-size:20px}.robustness-badge.robustness-grade{display:inline-flex;min-width:58px;flex-direction:column;align-items:center;justify-content:center;gap:2px}.robustness-badge.robustness-grade strong{font-size:24px;line-height:1;font-weight:900}.robustness-badge.robustness-grade small{display:block;margin-top:0;font-size:10px;line-height:1.15;white-space:nowrap}';
fs.writeFileSync(cssPath,css);

// Deployment-contract tests are copied before this final patch. Align their expected visible header/version.
for(const testPath of ['tests/player-metrics-v1001.test.js','tests/nexus-rating-v1000.test.js','tests/consensus-rating-v1002.test.js','tests/table-contract-v0917.test.js']){
  if(!fs.existsSync(testPath)&&!fs.existsSync('/app/'+testPath))continue;
  const p=fs.existsSync('/app/'+testPath)?'/app/'+testPath:testPath;
  let test=fs.readFileSync(p,'utf8');
  test=test.replaceAll('0.11.0','0.11.2')
    .replaceAll("BS10','CAMARILLO','NEXUS RATING","BS10','CAMARILLO RATING','NEXUS RATING")
    .replaceAll("CAMARILLO:'Camarillo Rating'","'CAMARILLO RATING':'Camarillo Rating'")
    .replaceAll("take\\('CAMARILLO'\\)","take\\('CAMARILLO RATING','CAMARILLO'\\)")
    .replaceAll("headerIndex\\(t,'CAMARILLO'\\)","headerIndex\\(t,'CAMARILLO RATING','CAMARILLO'\\)")
    .replaceAll('camarillo:8,nexusRating:9','camarilloRating:8,nexusRating:9');
  fs.writeFileSync(p,test);
}

fs.writeFileSync(paths.marker,JSON.stringify({version:'0.11.2',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',owns:['bs-current','bs50-rating','bs20-rating','bs10-rating','camarillo-rating','nexus-rating','robustness-grade'],identityOrder:['bullshooter-id','player-id','unique-name'],bullshooterIdMatch:'hash-digits-without-trailing-boundary',nameFallback:'primary-name-with-gender-strip',robustnessGrades:{S:'85-100',A:'70-84',B:'50-69',C:'25-49',D:'0-24'},camarilloDefinition:'Camarillo-organized leagues, tournaments and events only',legacyBullshooterWriter:false,legacyRobustnessRuntime:false,legacyRatingWriter:false})+'\n');
fs.writeFileSync(paths.consensusMarker,JSON.stringify({version:'0.11.2',ratingFormulaVersion:'2.0.0',source:'camarillo_player_metrics_index',rating:'evidence-weighted skill consensus',scaleMax:150,windowWeights:{bs50:.70,bs20:.20,bs10:.10},sourcePriorities:{bullshooter:40,edc:30,toc:20,camarillo:50},agreementBonus:false,duplicateTocFactor:.35,camarilloZeroUntilGames:true})+'\n');
fs.writeFileSync(paths.tableMarker,JSON.stringify({version:'0.11.2',renderer:'v1000-rating',schema:['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'],repairsLegacyHeaders:['BS30','RATING','CAMARILLO','BS / CD RATING'],statCells:{bsCurrent:4,bs50:5,bs20:6,bs10:7,camarilloRating:8,nexusRating:9,robustness:10,actions:11},rowMatch:['bullshooter-id-loose-hash','player-id','primary-unique-name']})+'\n');

console.log('V0.11.2 applied: stable Camarillo Rating header contract, rated BS windows, Nexus and robustness grade rendering.');
