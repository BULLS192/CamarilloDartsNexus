import fs from 'node:fs';

const root=fs.existsSync('/app')?'/app':'.';
const paths={
  ui:`${root}/public/v1000-rating.js`,
  css:`${root}/public/v1000-rating.css`,
  index:`${root}/public/index.html`,
  server:`${root}/server.js`,
  pkg:`${root}/package.json`,
  marker:`${root}/.v1001-player-metrics-applied`,
  tableMarker:`${root}/.v1003-player-table-applied`,
  v111Marker:`${root}/.v111-camarillo-rating-grades-applied`
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.11.1 patch: ${label} anchor not found`)};
const replaceOnce=(s,a,b,label)=>{need(s,a,label);return s.replace(a,b)};
const replaceBetween=(text,startAnchor,endAnchor,replacement,label)=>{
  const start=text.indexOf(startAnchor),end=start<0?-1:text.indexOf(endAnchor,start+startAnchor.length);
  if(start<0||end<0||end<=start)throw new Error(`V0.11.1 patch: ${label} anchors not found`);
  return text.slice(0,start)+replacement+text.slice(end);
};

let ui=fs.readFileSync(paths.ui,'utf8');
ui=replaceOnce(ui,
  "const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS'];",
  "const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'];",
  '12-column Players schema');

need(ui,'  const robustnessMarkup=r=>{','robustness renderer');
ui=ui.replace('  const robustnessMarkup=r=>{',`  const camarilloMarkup=entry=>{\n    if(!entry)return'<div class="skill-rating-block camarillo-rating-block missing" title="No Nexus player metrics matched"><strong>—</strong><small>No player metrics</small></div>';\n    const games=Number(entry?.evidence?.cd501Games||0)+Number(entry?.evidence?.cdCricketGames||0);\n    const weight=Number(entry?.sourceWeights?.camarillo||0);\n    const active=games>0&&weight>0;\n    const raw=entry?.camarilloRating??entry?.sourceRatings?.camarillo??0;\n    const rating=Number.isFinite(Number(raw))?Number(raw):0;\n    if(!active)return'<div class="skill-rating-block camarillo-rating-block" title="Camarillo Rating uses only Camarillo-organized league, tournament and event games. No eligible games recorded yet."><strong>0.0</strong><small>0 Camarillo games</small></div>';\n    return\`<div class="skill-rating-block camarillo-rating-block" title="Camarillo Rating \${fmt(rating,1)} · only Camarillo-organized play · \${games} recorded game\${games===1?'':'s'}"><strong>\${fmt(rating,1)}</strong><small>\${games} Camarillo game\${games===1?'':'s'}</small></div>\`;\n  };\n  const robustnessGrade=score=>Number(score)>=85?'S':Number(score)>=70?'A':Number(score)>=50?'B':Number(score)>=25?'C':'D';\n  const robustnessMarkup=r=>{`);
ui=replaceBetween(ui,'  const robustnessMarkup=r=>{','\n\n  function syncHidden',`  const robustnessMarkup=r=>{\n    if(!r||!Number.isFinite(Number(r.score)))return'<span class="robustness-badge robustness-grade grade-missing" title="No robustness record matched this Nexus player"><strong>—</strong><small>— / 100</small></span>';\n    const c=r.components||{},e=r.evidence||{},grade=robustnessGrade(r.score);\n    const title=\`Robustness \${grade} · \${r.score}/100 · EDC \${c.edc??0}/30 (\${e.edcGames??0}/80 games) · PPD/TOC \${c.toc??0}/30 · BullShooter 501 \${c.bullshooter501??0}/20 (\${e.bs501Games??0}/50 games) · BullShooter Cricket \${c.bullshooterCricket??0}/20 (\${e.bsCricketGames??0}/50 games)\`;\n    return\`<span class="robustness-badge robustness-grade grade-\${grade.toLowerCase()}" title="\${title}"><strong>\${grade}</strong><small>\${r.score} / 100</small></span>\`;\n  };`,'robustness S/A/B/C/D renderer');

ui=replaceOnce(ui,
  "const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};",
  "const display={PLAYER:'Player',CONTACT:'Contact',HOME:'Home',BULLSHOOTER:'BullShooter','BS CURRENT':'BS Current',BS50:'BS50',BS20:'BS20',BS10:'BS10',CAMARILLO:'Camarillo Rating','NEXUS RATING':'Nexus Rating',ROBUSTNESS:'Robustness',ACTIONS:'Actions'};",
  'Camarillo header display');
ui=replaceOnce(ui,
  "if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='NEXUS RATING'&&(hidden.get('CAMARILLO')||hidden.get('RATING')||hidden.get('BS / CD RATING'))))",
  "if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30'))||(label==='NEXUS RATING'&&(hidden.get('RATING')||hidden.get('BS / CD RATING'))))",
  'independent Camarillo/Nexus visibility');
ui=replaceOnce(ui,
  "const rating=take('NEXUS RATING','CAMARILLO','BS / CD RATING','RATING');",
  "const camarillo=take('CAMARILLO');\n      const rating=take('NEXUS RATING','BS / CD RATING','RATING');",
  'separate legacy Camarillo and Nexus cells');
ui=replaceOnce(ui,
  "take('PLAYER'),take('CONTACT'),take('HOME'),take('BULLSHOOTER'),take('BS CURRENT'),take('BS50','BS30'),take('BS20'),take('BS10'),rating,robust,act",
  "take('PLAYER'),take('CONTACT'),take('HOME'),take('BULLSHOOTER'),take('BS CURRENT'),take('BS50','BS30'),take('BS20'),take('BS10'),camarillo,rating,robust,act",
  '12-column row order');
ui=replaceOnce(ui,
  "ordered[8].dataset.v1100='nexus-rating';ordered[9].dataset.v1100='robustness';",
  "ordered[8].dataset.v111='camarillo-rating';ordered[9].dataset.v1100='nexus-rating';ordered[10].dataset.v1100='robustness';",
  'rating cell ownership indexes');
ui=replaceOnce(ui,
  "current:headerIndex(t,'BS CURRENT'),bs50:headerIndex(t,'BS50'),bs20:headerIndex(t,'BS20'),bs10:headerIndex(t,'BS10'),\n      rating:headerIndex(t,'NEXUS RATING'),robust:headerIndex(t,'ROBUSTNESS'),bs:headerIndex(t,'BULLSHOOTER')",
  "current:headerIndex(t,'BS CURRENT'),bs50:headerIndex(t,'BS50'),bs20:headerIndex(t,'BS20'),bs10:headerIndex(t,'BS10'),\n      camarillo:headerIndex(t,'CAMARILLO'),rating:headerIndex(t,'NEXUS RATING'),robust:headerIndex(t,'ROBUSTNESS'),bs:headerIndex(t,'BULLSHOOTER')",
  'Camarillo render index');
ui=replaceOnce(ui,
  "if(idx.rating<0||idx.robust<0||idx.bs<0)return;",
  "if(idx.camarillo<0||idx.rating<0||idx.robust<0||idx.bs<0)return;",
  'required Camarillo column');
ui=replaceOnce(ui,
  "const ratingCell=row.cells[idx.rating],robustCell=row.cells[idx.robust];if(!ratingCell||!robustCell)continue;\n      const entry=entryForRow(identity,names),id=identity.id;",
  "const camarilloCell=row.cells[idx.camarillo],ratingCell=row.cells[idx.rating],robustCell=row.cells[idx.robust];if(!camarilloCell||!ratingCell||!robustCell)continue;\n      const entry=entryForRow(identity,names),id=identity.id;\n      const camarilloSig=entry?`${id}|${entry.playerId||''}|${entry.camarilloRating}|${entry?.sourceWeights?.camarillo||0}|${entry?.evidence?.cd501Games||0}|${entry?.evidence?.cdCricketGames||0}`:`missing|${id}|${identity.pid}`;\n      if(camarilloCell.dataset.v111RatingSig!==camarilloSig||!camarilloCell.querySelector('.camarillo-rating-block')){camarilloCell.innerHTML=camarilloMarkup(entry);camarilloCell.dataset.v111RatingSig=camarilloSig}",
  'Camarillo cell render');
ui=ui.replaceAll('V0.11.0','V0.11.1');
fs.writeFileSync(paths.ui,ui);

let css=fs.readFileSync(paths.css,'utf8');
const additions='.camarillo-rating-block strong{font-size:20px}.robustness-badge.robustness-grade{display:inline-flex;min-width:58px;flex-direction:column;align-items:center;justify-content:center;gap:2px}.robustness-badge.robustness-grade strong{font-size:24px;line-height:1;font-weight:900}.robustness-badge.robustness-grade small{display:block;margin-top:0;font-size:10px;line-height:1.15;white-space:nowrap}';
if(!css.includes('.robustness-badge.robustness-grade'))css+=additions;
fs.writeFileSync(paths.css,css);

let server=fs.readFileSync(paths.server,'utf8');
server=server.replaceAll("version:'0.11.0'","version:'0.11.1'").replaceAll('Camarillo Darts V0.11.0 running','Camarillo Darts V0.11.1 running');
fs.writeFileSync(paths.server,server);

let html=fs.readFileSync(paths.index,'utf8');
html=html.replaceAll('/v1000-rating.js?v=0.11.0','/v1000-rating.js?v=0.11.1').replaceAll('/v1000-rating.css?v=0.11.0','/v1000-rating.css?v=0.11.1').replaceAll('V0.11.0','V0.11.1').replaceAll('Camarillo Darts Nexus 0.11.0','Camarillo Darts Nexus 0.11.1');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.11.1';
pkg.description='Camarillo Darts Nexus with distinct Camarillo-organized-play rating and S/A/B/C/D robustness grades';
if(!pkg.scripts)pkg.scripts={};
const testCmd='node tests/v111-camarillo-robustness.test.js';
if(!String(pkg.scripts.check||'').includes(testCmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+testCmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');

fs.writeFileSync(paths.marker,JSON.stringify({version:'0.11.1',source:'camarillo_player_metrics_index',route:'/api/players/nexus-rating',renderer:'v1000-rating',owns:['bs-current','bs50-rating','bs20-rating','bs10-rating','camarillo-rating','nexus-rating','robustness-grade'],robustnessGrades:{S:'85-100',A:'70-84',B:'50-69',C:'25-49',D:'0-24'},camarilloDefinition:'Camarillo-organized leagues, tournaments and events only'})+'\n');
fs.writeFileSync(paths.tableMarker,JSON.stringify({version:'0.11.1',renderer:'v1000-rating',schema:['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'],statCells:{bsCurrent:4,bs50:5,bs20:6,bs10:7,camarillo:8,nexusRating:9,robustness:10,actions:11},rowMatch:['bullshooter-id-loose-hash','player-id','primary-unique-name']})+'\n');
fs.writeFileSync(paths.v111Marker,JSON.stringify({version:'0.11.1',camarilloRating:'local-source-only',camarilloZeroUntilGames:true,robustnessDisplay:'S/A/B/C/D',robustnessMathChanged:false})+'\n');
