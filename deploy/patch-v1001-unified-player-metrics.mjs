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
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.11.0 patch: ${label} anchor not found`)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.11.0 patch: ${label} anchors not found`);
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
server=server.replaceAll("version:'0.10.0'","version:'0.11.0'").replaceAll('Camarillo Darts V0.10.0 running','Camarillo Darts V0.11.0 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=replaceBetween(player,'function ensureRobustnessColumn(){','function savedColumns(){',`function ensureRobustnessColumn(){\n    playerTable=findPlayerTable();if(!playerTable)return;\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n    applyPlayerFilters();\n  }\n  `,'legacy robustness delegate');
if(player.includes('function ensureCanonicalRobustnessRuntime(){'))player=replaceBetween(player,'function ensureCanonicalRobustnessRuntime(){','ensureCanonicalRobustnessRuntime();',`function ensureCanonicalRobustnessRuntime(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n  `,'legacy robustness runtime loader');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.23','EXTERNAL PLAYER INTELLIGENCE · V0.11.0');
fs.writeFileSync(paths.player,player);

let bull=fs.readFileSync(paths.bull,'utf8');
bull=replaceBetween(bull,'async function patchDisplays(){','async function enhanceDiagnostics(){',`async function patchDisplays(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BullShooter table renderer');
fs.writeFileSync(paths.bull,bull);

let legacyRating=fs.readFileSync(paths.legacyRating,'utf8');
legacyRating=replaceBetween(legacyRating,'async function patchRatings(){','let timer=null;',`async function patchRatings(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BS/CD rating renderer');
fs.writeFileSync(paths.legacyRating,legacyRating);

const ui=fs.readFileSync(paths.ui,'utf8');
need(ui,"const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS'];",'V0.11.0 canonical Players schema');
need(ui,"match(/#\\s*(\\d{3,})/)",'loose BullShooter ID matcher');
need(ui,'windowMarkup(b.last50PPD,b.last50MPR','BS50 rating renderer');
fs.writeFileSync(paths.ui,ui);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script\s+src=["']\/v0918-table\.js(?:\?[^"']*)?["'][^>]*><\/script>/g,'');
html=html.replaceAll('/v1000-rating.js?v=0.10.0','/v1000-rating.js?v=0.11.0').replaceAll('/v1000-rating.css?v=0.10.0','/v1000-rating.css?v=0.11.0').replaceAll('V0.10.0','V0.11.0').replaceAll('Camarillo Darts Nexus 0.10.0','Camarillo Darts Nexus 0.11.0');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.11.0';pkg.description='Camarillo Darts Nexus v2 rating: BS recent form plus evidence-weighted external consensus';if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node tests/player-metrics-v1001.test.js','node tests/consensus-rating-v1002.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.11.0',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',owns:['bs-current','bs50-rating','bs20-rating','bs10-rating','nexus-rating','robustness'],identityOrder:['bullshooter-id','player-id','unique-name'],bullshooterIdMatch:'hash-digits-without-trailing-boundary',nameFallback:'primary-name-with-gender-strip',legacyBullshooterWriter:false,legacyRobustnessRuntime:false,legacyRatingWriter:false})+'\n');
fs.writeFileSync(paths.consensusMarker,JSON.stringify({version:'0.11.0',ratingFormulaVersion:'2.0.0',source:'camarillo_player_metrics_index',rating:'evidence-weighted skill consensus',scaleMax:150,windowWeights:{bs50:.70,bs20:.20,bs10:.10},sourcePriorities:{bullshooter:40,edc:30,toc:20,camarillo:50},agreementBonus:false,duplicateTocFactor:.35,camarilloZeroUntilGames:true})+'\n');
fs.writeFileSync(paths.tableMarker,JSON.stringify({version:'0.11.0',renderer:'v1000-rating',schema:['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS'],removed:['CAMARILLO'],repairsLegacyHeaders:['BS30','RATING','CAMARILLO'],statCells:{bsCurrent:4,bs50:5,bs20:6,bs10:7,nexusRating:8,robustness:9,actions:10},rowMatch:['bullshooter-id-loose-hash','player-id','primary-unique-name']})+'\n');
