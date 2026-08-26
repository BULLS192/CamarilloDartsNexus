import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  legacyRating:fs.existsSync('/app/public/v0711.js')?'/app/public/v0711.js':'public/v0711.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v1001-player-metrics-applied':'.v1001-player-metrics-applied',
  consensusMarker:fs.existsSync('/app')?'/app/.v1002-consensus-rating-applied':'.v1002-consensus-rating-applied'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.10.1/0.10.2 patch: ${label} anchor not found`)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.10.1/0.10.2 patch: ${label} anchors not found`);
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
server=server.replaceAll("version:'0.10.0'","version:'0.10.2'").replaceAll('Camarillo Darts V0.10.0 running','Camarillo Darts V0.10.2 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=replaceBetween(player,'function ensureRobustnessColumn(){','function savedColumns(){',`function ensureRobustnessColumn(){\n    playerTable=findPlayerTable();if(!playerTable)return;\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n    applyPlayerFilters();\n  }\n  `,'legacy robustness delegate');
if(player.includes('function ensureCanonicalRobustnessRuntime(){'))player=replaceBetween(player,'function ensureCanonicalRobustnessRuntime(){','ensureCanonicalRobustnessRuntime();',`function ensureCanonicalRobustnessRuntime(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n  `,'legacy robustness runtime loader');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.23','EXTERNAL PLAYER INTELLIGENCE · V0.10.2');
fs.writeFileSync(paths.player,player);

let legacyRating=fs.readFileSync(paths.legacyRating,'utf8');
legacyRating=replaceBetween(legacyRating,'async function patchRatings(){','let timer=null;',`async function patchRatings(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BS/CD rating renderer');
fs.writeFileSync(paths.legacyRating,legacyRating);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script\s+src=["']\/v0918-table\.js(?:\?[^"']*)?["'][^>]*><\/script>/g,'');
html=html.replaceAll('/v1000-rating.js?v=0.10.0','/v1000-rating.js?v=0.10.2').replaceAll('/v1000-rating.css?v=0.10.0','/v1000-rating.css?v=0.10.2').replaceAll('V0.10.0','V0.10.2').replaceAll('Camarillo Darts Nexus 0.10.0','Camarillo Darts Nexus 0.10.2');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.10.2';pkg.description='Camarillo Darts Nexus consensus-aware multi-source rating with unified SQL-backed robustness';if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node tests/player-metrics-v1001.test.js','node tests/consensus-rating-v1002.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.10.1',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',owns:['nexus-rating','robustness'],legacyRobustnessRuntime:false,legacyRatingWriter:false})+'\n');
fs.writeFileSync(paths.consensusMarker,JSON.stringify({version:'0.10.2',ratingFormulaVersion:'1.2.0',source:'camarillo_player_metrics_index',rating:'weighted source consensus',scaleMax:150,weights:{bullshooter:40,edc:30,toc:20,camarillo:20},agreement:{strongWithin:2,strongMultiplier:1.25,nearWithin:5,nearMultiplier:1.10},duplicateTocFactor:.35})+'\n');
