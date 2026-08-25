import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const req=(text,from,to,label)=>{if(!text.includes(from))throw new Error(`V0.9.9 patch: ${label} anchor not found`);return text.replace(from,to)};

let toc=fs.readFileSync(tocPath,'utf8');
const tokenAnchor="function tokenOverlap(a,b){";
if(!toc.includes('export function canonicalPlayerName(')){
  const canonical=`export function canonicalPlayerName(player={}){\n  const first=String(player?.firstName??player?.first_name??'').trim();\n  const last=String(player?.lastName??player?.last_name??'').trim();\n  if(first&&last)return (first+' '+last).replace(/\\s+/g,' ').trim();\n  let name=String(player?.name??player?.displayName??player?.display_name??'').trim();\n  name=name.replace(/[\\\"“][^\\\"”]+[\\\"”]/g,' ').replace(/\\s+/g,' ').trim();\n  return name;\n}\n\n`;
  toc=req(toc,tokenAnchor,canonical+tokenAnchor,'canonical name insertion');
}
toc=toc.replace(/const pn=normalizeName\(player\?\.name\|\|`\$\{player\?\.firstName\|\|''\} \$\{player\?\.lastName\|\|''\}`\),tn=normalizeName\(toc\?\.playerName\|\|' '\);/g,
  "const pn=normalizeName(canonicalPlayerName(player)),tn=normalizeName(toc?.playerName||'');");
// Handle the exact assembled source form without the stray-space fallback.
toc=toc.replace("const pn=normalizeName(player?.name||`${player?.firstName||''} ${player?.lastName||''}`),tn=normalizeName(toc?.playerName||'');",
  "const pn=normalizeName(canonicalPlayerName(player)),tn=normalizeName(toc?.playerName||'');");
toc=toc.replace("  const name=player?.name||`${player?.firstName||''} ${player?.lastName||''}`;\n  const norm=normalizeName(name); if(!norm)return[];",
  "  const name=canonicalPlayerName(player);\n  const norm=normalizeName(name); if(!norm)return[];");
toc=toc.replace("const VERSION='0.9.8';","const VERSION='0.9.9';");
fs.writeFileSync(tocPath,toc);

let ui=fs.readFileSync(uiPath,'utf8');
ui=ui.replace("const STORE_KEY='cdNexusPlayerColumnsV094';","const STORE_KEY='cdNexusPlayerColumnsV099';");
const robustRe=/  function ensureRobustnessColumn\(\)\{[\s\S]*?\n  \}\n  function savedColumns/;
if(!robustRe.test(ui))throw new Error('V0.9.9 patch: robustness function block not found');
ui=ui.replace(robustRe,`  function ensureRobustnessColumn(){
    playerTable=findPlayerTable();if(!playerTable)return;
    const headRow=playerTable.querySelector('thead tr');if(!headRow)return;
    for(const th of [...headRow.children])if(th.dataset?.v094==='robustness'||th.textContent.trim().toUpperCase()==='ROBUSTNESS')th.remove();
    const actionsHeader=[...headRow.children].find(h=>h.textContent.trim().toUpperCase()==='ACTIONS')||null;
    const robustHeader=document.createElement('th');robustHeader.textContent='Robustness';robustHeader.dataset.v094='robustness';
    if(actionsHeader)headRow.insertBefore(robustHeader,actionsHeader);else headRow.appendChild(robustHeader);
    for(const row of playerTable.querySelectorAll('tbody tr')){
      if(row.cells.length<2)continue;
      const actionCell=[...row.cells].find(c=>[...c.querySelectorAll('button')].some(b=>/^(edit|sync)$/i.test(b.textContent.trim())))||null;
      const marked=[...row.cells].filter(c=>c.dataset?.v094==='robustness');let cell=marked.shift()||null;for(const extra of marked)extra.remove();
      if(!cell){cell=document.createElement('td');cell.dataset.v094='robustness'}
      if(actionCell){if(cell.parentElement!==row||cell.nextElementSibling!==actionCell)row.insertBefore(cell,actionCell)}else if(cell.parentElement!==row)row.appendChild(cell);
      const p=playerForRow(row);if(!p){if(row.dataset.v099RobustnessSig!=='none'){cell.innerHTML='<span class="robustness-badge thin">R —</span>';row.dataset.v099RobustnessSig='none'}continue}
      const r=robustness(p),sig=[r.score,r.label,r.sample,r.coverage,r.agreement,r.freshness].join('|');
      row.dataset.robustness=String(r.score);row.dataset.sources=String(r.sources);row.dataset.hasBs=r.flags.bs?'1':'0';row.dataset.hasToc=r.flags.toc?'1':'0';row.dataset.hasEdc=r.flags.edc?'1':'0';row.dataset.hasCd=r.flags.cd?'1':'0';row.dataset.searchable=norm(\`${'${p.name||\'\'} ${p.nickname||\'\'} ${p.bullshooter?.id||\'\'} ${p.edc?.name||\'\'}'}\`);
      if(row.dataset.v099RobustnessSig!==sig){cell.innerHTML=\`<span class="robustness-badge ${'${r.label.toLowerCase()}'}" title="Sample ${'${r.sample}'}/40 · Verified sources ${'${r.coverage}'}/30 · Agreement ${'${r.agreement}'}/20 · Freshness ${'${r.freshness}'}/10">R ${'${r.score}'}<small>${'${r.label}'}</small></span>\`;row.dataset.v099RobustnessSig=sig}
    }
    applyColumnPrefs();applyPlayerFilters();
  }
  function savedColumns`);
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.8','EXTERNAL PLAYER INTELLIGENCE · V0.9.9');
fs.writeFileSync(uiPath,ui);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.8'","version:'0.9.9'").replaceAll('Camarillo Darts V0.9.8 running','Camarillo Darts V0.9.9 running');
fs.writeFileSync(serverPath,server);
let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.8','V0.9.9').replaceAll('Camarillo Darts Nexus 0.9.8','Camarillo Darts Nexus 0.9.9');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.9';pkg.description='Camarillo Darts Nexus canonical TOC matching and deterministic player table robustness/actions layout';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/toc-table-v099.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
