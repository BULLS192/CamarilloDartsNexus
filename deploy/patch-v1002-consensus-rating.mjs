import fs from 'node:fs';
const paths={
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v1002-consensus-rating-applied':'.v1002-consensus-rating-applied'
};
let server=fs.readFileSync(paths.server,'utf8');
server=server.replaceAll("version:'0.10.1'","version:'0.10.2'").replaceAll('Camarillo Darts V0.10.1 running','Camarillo Darts V0.10.2 running');
fs.writeFileSync(paths.server,server);
let html=fs.readFileSync(paths.index,'utf8');
html=html.replaceAll('/v1000-rating.js?v=0.10.1','/v1000-rating.js?v=0.10.2').replaceAll('/v1000-rating.css?v=0.10.1','/v1000-rating.css?v=0.10.2').replaceAll('V0.10.1','V0.10.2').replaceAll('Camarillo Darts Nexus 0.10.1','Camarillo Darts Nexus 0.10.2');
fs.writeFileSync(paths.index,html);
const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));pkg.version='0.10.2';pkg.description='Camarillo Darts Nexus consensus-aware multi-source rating + unified robustness';if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node tests/consensus-rating-v1002.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.10.2',ratingFormulaVersion:'1.2.0',source:'camarillo_player_metrics_index',rating:'weighted source consensus',scaleMax:150,weights:{bullshooter:40,edc:30,toc:20,camarillo:20},agreement:{strongWithin:2,strongMultiplier:1.25,nearWithin:5,nearMultiplier:1.10},duplicateTocFactor:.35})+'\n');
