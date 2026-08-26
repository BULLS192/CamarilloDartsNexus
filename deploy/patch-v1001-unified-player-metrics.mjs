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
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.10.1-0.10.5 patch: ${label} anchor not found`)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.10.1-0.10.5 patch: ${label} anchors not found`);
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
server=server.replaceAll("version:'0.10.0'","version:'0.10.5'").replaceAll('Camarillo Darts V0.10.0 running','Camarillo Darts V0.10.5 running');
fs.writeFileSync(paths.server,server);

let player=fs.readFileSync(paths.player,'utf8');
player=replaceBetween(player,'function ensureRobustnessColumn(){','function savedColumns(){',`function ensureRobustnessColumn(){\n    playerTable=findPlayerTable();if(!playerTable)return;\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n    applyPlayerFilters();\n  }\n  `,'legacy robustness delegate');
if(player.includes('function ensureCanonicalRobustnessRuntime(){'))player=replaceBetween(player,'function ensureCanonicalRobustnessRuntime(){','ensureCanonicalRobustnessRuntime();',`function ensureCanonicalRobustnessRuntime(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n  `,'legacy robustness runtime loader');
player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.23','EXTERNAL PLAYER INTELLIGENCE · V0.10.5');
fs.writeFileSync(paths.player,player);

// V0.10.4+: the unified renderer owns BullShooter Current/50/20/10 as well.
// Retire the legacy V0.7 repaint loop so sorting/filtering can never remap players by array position.
let bull=fs.readFileSync(paths.bull,'utf8');
bull=replaceBetween(bull,'async function patchDisplays(){','async function enhanceDiagnostics(){',`async function patchDisplays(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BullShooter table renderer');
fs.writeFileSync(paths.bull,bull);

let legacyRating=fs.readFileSync(paths.legacyRating,'utf8');
legacyRating=replaceBetween(legacyRating,'async function patchRatings(){','let timer=null;',`async function patchRatings(){\n    window.CDNexusPlayerMetricsV1001?.refresh?.();\n    window.CDNexusRatingV1000?.refresh?.();\n  }\n\n  `,'legacy BS/CD rating renderer');
fs.writeFileSync(paths.legacyRating,legacyRating);

// V0.10.5: repair live row identity matching. The production BullShooter cell can
// concatenate "#123456" directly with its synced subtext, so a trailing word boundary
// rejects otherwise valid IDs. Also use only the primary player-name element (or strip
// trailing gender text) for the final unique-name fallback.
let ui=fs.readFileSync(paths.ui,'utf8');
need(ui,String.raw`match(/#\s*(\d{3,})\b/)`,'strict BullShooter ID matcher');
ui=ui.replace(String.raw`match(/#\s*(\d{3,})\b/)`,String.raw`match(/#\s*(\d{3,})/)`);
if(!ui.includes('const rowName=row=>')){
  const normLine="  const norm=s=>String(s||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' ');\n";
  need(ui,normLine,'name normalizer');
  const rowNameLine="  const rowName=row=>{const cell=row?.cells?.[0];if(!cell)return'';const primary=cell.querySelector?.('[data-player-name],.player-name,strong,b');let text=String(primary?.textContent||cell.textContent||'').trim();text=text.replace(/\\s*(?:male|female)\\s*$/i,'').trim();return text};\n";
  ui=ui.replace(normLine,normLine+rowNameLine);
}
need(ui,"if(!player){const key=norm(row.cells[0]?.textContent||'');player=key?pidx.byName.get(key)||null:null}",'legacy row-name fallback');
ui=ui.replace("if(!player){const key=norm(row.cells[0]?.textContent||'');player=key?pidx.byName.get(key)||null:null}","if(!player){const key=norm(rowName(row));player=key?pidx.byName.get(key)||null:null}");
need(ui,"return{id:resolvedBs,pid:String(player?.id||pid||''),player};",'row identity return');
ui=ui.replace("return{id:resolvedBs,pid:String(player?.id||pid||''),player};","return{id:resolvedBs,pid:String(player?.id||pid||''),nameKey:norm(rowName(row)),player};");
need(ui,"const key=norm(identity.player?.name||'');return key?names.get(key)||null:null;",'metrics name fallback');
ui=ui.replace("const key=norm(identity.player?.name||'');return key?names.get(key)||null:null;","const key=identity.nameKey||norm(identity.player?.name||'');return key?names.get(key)||null:null;");
fs.writeFileSync(paths.ui,ui);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replace(/<script\s+src=["']\/v0918-table\.js(?:\?[^"']*)?["'][^>]*><\/script>/g,'');
html=html.replaceAll('/v1000-rating.js?v=0.10.0','/v1000-rating.js?v=0.10.5').replaceAll('/v1000-rating.css?v=0.10.0','/v1000-rating.css?v=0.10.5').replaceAll('V0.10.0','V0.10.5').replaceAll('Camarillo Darts Nexus 0.10.0','Camarillo Darts Nexus 0.10.5');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.10.5';pkg.description='Camarillo Darts Nexus live identity-mapped player metrics rendering with consensus rating and unified robustness';if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node tests/player-metrics-v1001.test.js','node tests/consensus-rating-v1002.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.10.5',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',owns:['bs-current','bs50','bs20','bs10','nexus-rating','robustness'],identityOrder:['bullshooter-id','player-id','unique-name'],bullshooterIdMatch:'hash-digits-without-trailing-boundary',nameFallback:'primary-name-with-gender-strip',legacyBullshooterWriter:false,legacyRobustnessRuntime:false,legacyRatingWriter:false})+'\n');
fs.writeFileSync(paths.consensusMarker,JSON.stringify({version:'0.10.2',ratingFormulaVersion:'1.2.0',source:'camarillo_player_metrics_index',rating:'weighted source consensus',scaleMax:150,weights:{bullshooter:40,edc:30,toc:20,camarillo:20},agreement:{strongWithin:2,strongMultiplier:1.25,nearWithin:5,nearMultiplier:1.10},duplicateTocFactor:.35})+'\n');
fs.writeFileSync(paths.tableMarker,JSON.stringify({version:'0.10.5',renderer:'v1000-rating',schema:['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'],repairsLegacyHeaders:['BS30','RATING'],statCells:{bsCurrent:4,bs50:5,bs20:6,bs10:7,nexusRating:9,robustness:10,actions:11},rowMatch:['bullshooter-id-loose-hash','player-id','primary-unique-name']})+'\n');
