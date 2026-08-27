import fs from 'node:fs';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const path=p=>`${root}/${p}`;
const need=(text,anchor,label)=>{if(!text.includes(anchor))throw new Error(`V0.11.2 patch: ${label} anchor not found`)};

const uiPath=path('public/v1000-rating.js');
let ui=fs.readFileSync(uiPath,'utf8');
const brokenExpected="const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'];";
need(ui,brokenExpected,'broken Camarillo schema');
ui=ui.replace(brokenExpected,"const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'];");

const brokenDisplay="const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10',CAMARILLO:'Camarillo Rating','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};";
need(ui,brokenDisplay,'Camarillo display map');
ui=ui.replace(brokenDisplay,"const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10','CAMARILLO RATING':'Camarillo Rating','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};");

need(ui,"const camarillo=take('CAMARILLO');",'Camarillo cell resolver');
ui=ui.replace("const camarillo=take('CAMARILLO');","const camarillo=take('CAMARILLO RATING','CAMARILLO');");
need(ui,"camarillo:headerIndex(t,'CAMARILLO'),rating:headerIndex(t,'NEXUS RATING')",'Camarillo header lookup');
ui=ui.replace("camarillo:headerIndex(t,'CAMARILLO'),rating:headerIndex(t,'NEXUS RATING')","camarillo:headerIndex(t,'CAMARILLO RATING','CAMARILLO'),rating:headerIndex(t,'NEXUS RATING')");

const hiddenAnchor="if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='NEXUS RATING'&&(hidden.get('RATING')||hidden.get('BS / CD RATING'))))";
need(ui,hiddenAnchor,'column visibility bridge');
ui=ui.replace(hiddenAnchor,"if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='CAMARILLO RATING'&&hidden.get('CAMARILLO'))||(label==='NEXUS RATING'&&(hidden.get('RATING')||hidden.get('BS / CD RATING'))))");
ui=ui.replaceAll('V0.11.0','V0.11.2');
fs.writeFileSync(uiPath,ui);

const htmlPath=path('public/index.html');
let html=fs.readFileSync(htmlPath,'utf8');
need(html,'/v1000-rating.js?v=0.11.0','rating JS cache key');
need(html,'/v1000-rating.css?v=0.11.0','rating CSS cache key');
html=html.replaceAll('/v1000-rating.js?v=0.11.0','/v1000-rating.js?v=0.11.2')
  .replaceAll('/v1000-rating.css?v=0.11.0','/v1000-rating.css?v=0.11.2')
  .replaceAll('V0.11.0','V0.11.2')
  .replaceAll('Camarillo Darts Nexus 0.11.0','Camarillo Darts Nexus 0.11.2');
fs.writeFileSync(htmlPath,html);

const serverPath=path('server.js');
let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.11.0'","version:'0.11.2'")
  .replaceAll('Camarillo Darts V0.11.0 running','Camarillo Darts V0.11.2 running');
fs.writeFileSync(serverPath,server);

const playerPath=path('public/v094-player-intel.js');
if(fs.existsSync(playerPath)){
  let player=fs.readFileSync(playerPath,'utf8');
  player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.11.0','EXTERNAL PLAYER INTELLIGENCE · V0.11.2');
  fs.writeFileSync(playerPath,player);
}

// These are deployment-contract tests copied into the image before this final patch.
// Keep their expected version/header contract aligned with the runtime they validate.
for(const rel of ['tests/player-metrics-v1001.test.js','tests/nexus-rating-v1000.test.js','tests/consensus-rating-v1002.test.js','tests/table-contract-v0917.test.js']){
  const testPath=path(rel);if(!fs.existsSync(testPath))continue;
  let test=fs.readFileSync(testPath,'utf8');
  test=test.replaceAll('0.11.0','0.11.2')
    .replaceAll("BS10','CAMARILLO','NEXUS RATING","BS10','CAMARILLO RATING','NEXUS RATING")
    .replaceAll("CAMARILLO:'Camarillo Rating'","'CAMARILLO RATING':'Camarillo Rating'")
    .replaceAll("take\\('CAMARILLO'\\)","take\\('CAMARILLO RATING','CAMARILLO'\\)")
    .replaceAll("headerIndex\\(t,'CAMARILLO'\\)","headerIndex\\(t,'CAMARILLO RATING','CAMARILLO'\\)")
    .replaceAll('camarillo:8,nexusRating:9','camarilloRating:8,nexusRating:9');
  fs.writeFileSync(testPath,test);
}

const pkgPath=path('package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.11.2';
pkg.description='Camarillo Darts Nexus v2 rating with distinct Camarillo local rating and stable semantic player metrics rendering';
if(!pkg.scripts)pkg.scripts={};
const runtimeTest='node tests/player-render-v112.test.js';
if(!String(pkg.scripts.check||'').includes(runtimeTest))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+runtimeTest;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

fs.writeFileSync(path('.v1001-player-metrics-applied'),JSON.stringify({
  version:'0.11.2',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',
  owns:['bs-current','bs50-rating','bs20-rating','bs10-rating','camarillo-rating','nexus-rating','robustness-grade'],
  identityOrder:['bullshooter-id','player-id','unique-name'],bullshooterIdMatch:'hash-digits-without-trailing-boundary',
  nameFallback:'primary-name-with-gender-strip',legacyBullshooterWriter:false,legacyRobustnessRuntime:false,legacyRatingWriter:false,
  robustnessGrades:{S:'85-100',A:'70-84',B:'50-69',C:'25-49',D:'0-24'}
})+'\n');
fs.writeFileSync(path('.v1002-consensus-rating-applied'),JSON.stringify({
  version:'0.11.2',ratingFormulaVersion:'2.0.0',source:'camarillo_player_metrics_index',rating:'evidence-weighted skill consensus',scaleMax:150,
  windowWeights:{bs50:.70,bs20:.20,bs10:.10},sourcePriorities:{bullshooter:40,edc:30,toc:20,camarillo:50},agreementBonus:false,duplicateTocFactor:.35,camarilloZeroUntilGames:true
})+'\n');
fs.writeFileSync(path('.v1003-player-table-applied'),JSON.stringify({
  version:'0.11.2',renderer:'v1000-rating',
  schema:['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'],
  repairsLegacyHeaders:['BS30','RATING','CAMARILLO','BS / CD RATING'],
  statCells:{bsCurrent:4,bs50:5,bs20:6,bs10:7,camarilloRating:8,nexusRating:9,robustness:10,actions:11},
  rowMatch:['bullshooter-id-loose-hash','player-id','primary-unique-name']
})+'\n');

console.log('V0.11.2 applied: Camarillo Rating header contract is stable and unified metrics rendering can complete.');
