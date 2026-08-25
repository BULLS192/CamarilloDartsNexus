import fs from 'node:fs';

const uiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
let ui=fs.readFileSync(uiPath,'utf8');
const required=(from,to,label)=>{if(!ui.includes(from))throw new Error(`V0.9.6 UI patch: ${label} anchor not found`);ui=ui.replace(from,to)};

required(
"  let players=[],tocLinks=[],tocIntel=new Map(),playerTable=null,edcRawResults=[],edcLinkResults=[];",
"  let players=[],tocLinks=[],tocIntel=new Map(),playerTable=null,edcRawResults=[],edcLinkResults=[];\n  let playerById=new Map(),playerByBsId=new Map(),playerByName=new Map(),tocLinkByPlayerId=new Map(),robustnessCache=new Map(),observer=null,enhanceTimer=null,enhancing=false;",
'indexes/state'
);

required(
"  function linkFor(playerId){return tocLinks.find(x=>String(x.playerId??x.player_id)===String(playerId))||null}",
`  function rebuildIndexes(){
    playerById=new Map();playerByBsId=new Map();playerByName=new Map();tocLinkByPlayerId=new Map();robustnessCache.clear();
    for(const p of players){
      const id=String(p?.id??'');if(id)playerById.set(id,p);
      const bs=String(p?.bullshooter?.id??'').trim();if(bs)playerByBsId.set(bs,p);
      for(const label of [p?.name,[p?.firstName,p?.lastName].filter(Boolean).join(' ')]){const k=norm(label);if(k&&!playerByName.has(k))playerByName.set(k,p)}
    }
    for(const l of tocLinks){const id=String(l?.playerId??l?.player_id??'');if(id)tocLinkByPlayerId.set(id,l)}
  }
  function linkFor(playerId){return tocLinkByPlayerId.get(String(playerId))||null}`,
'indexed TOC links'
);

required(
"  function robustness(player){\n    const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{},flags=sourceFlags(player),sources=Object.values(flags).filter(Boolean).length;",
"  function robustness(player){\n    const cacheKey=String(player?.id??'');if(cacheKey&&robustnessCache.has(cacheKey))return robustnessCache.get(cacheKey);\n    const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{},flags=sourceFlags(player),sources=Object.values(flags).filter(Boolean).length;",
'robustness cache read'
);
required(
"    return{score,label,sample:Math.round(sample),coverage:Math.round(coverage),agreement:Math.round(agreement),freshness:Math.round(freshness),sources,flags};\n  }",
"    const out={score,label,sample:Math.round(sample),coverage:Math.round(coverage),agreement:Math.round(agreement),freshness:Math.round(freshness),sources,flags};if(cacheKey)robustnessCache.set(cacheKey,out);return out;\n  }",
'robustness cache write'
);

required(
"  function playerForRow(row){const text=row.textContent||'';for(const p of players){const id=String(p?.bullshooter?.id||'');if(id&&new RegExp(`(?:#|\\\\b)${id}\\\\b`).test(text))return p}const first=norm(row.cells?.[0]?.textContent||'');return players.find(p=>{const name=norm(p.name||[p.firstName,p.lastName].filter(Boolean).join(' '));return name&&first.includes(name)})||null}",
`  function playerForRow(row){
    const cached=String(row?.dataset?.nexusPlayerId||'');if(cached&&playerById.has(cached))return playerById.get(cached);
    const text=row?.textContent||'',bs=(text.match(/#\\s*(\\d{3,})\\b/)||[])[1];let p=bs?playerByBsId.get(bs):null;
    const first=norm(row?.cells?.[0]?.textContent||'');if(!p&&first)p=playerByName.get(first)||null;
    if(!p&&first){for(const [name,candidate] of playerByName){if(first===name||first.startsWith(name+' ')||name.startsWith(first+' ')){p=candidate;break}}}
    if(p)row.dataset.nexusPlayerId=String(p.id);return p||null;
  }`,
'indexed row matching'
);

const robustRe=/  function ensureRobustnessColumn\(\)\{[\s\S]*?\n  \}\n  function savedColumns/;
if(!robustRe.test(ui))throw new Error('V0.9.6 UI patch: robustness function block not found');
ui=ui.replace(robustRe,`  function ensureRobustnessColumn(){
    playerTable=findPlayerTable();if(!playerTable)return;
    const head=[...playerTable.querySelectorAll('thead th')],texts=head.map(x=>x.textContent.trim().toUpperCase()),actions=texts.indexOf('ACTIONS');
    if(texts.indexOf('ROBUSTNESS')<0){const th=document.createElement('th');th.textContent='Robustness';th.dataset.v094='robustness';if(actions>=0)head[actions].before(th);else playerTable.querySelector('thead tr')?.appendChild(th)}
    const headers=[...playerTable.querySelectorAll('thead th')],actionIndex=headers.findIndex(h=>h.textContent.trim().toUpperCase()==='ACTIONS');
    for(const row of playerTable.querySelectorAll('tbody tr')){
      if(row.cells.length<2)continue;let cell=[...row.cells].find(c=>c.dataset.v094==='robustness');
      if(!cell){cell=document.createElement('td');cell.dataset.v094='robustness';const actionCell=actionIndex>=0?row.cells[actionIndex]:null;if(actionCell)actionCell.before(cell);else row.appendChild(cell)}
      const p=playerForRow(row);if(!p){if(row.dataset.v096RobustnessSig!=='none'){cell.innerHTML='<span class="robustness-badge thin">R —</span>';row.dataset.v096RobustnessSig='none'}continue}
      const r=robustness(p),sig=[r.score,r.label,r.sample,r.coverage,r.agreement,r.freshness].join('|');
      row.dataset.robustness=String(r.score);row.dataset.sources=String(r.sources);row.dataset.hasBs=r.flags.bs?'1':'0';row.dataset.hasToc=r.flags.toc?'1':'0';row.dataset.hasEdc=r.flags.edc?'1':'0';row.dataset.hasCd=r.flags.cd?'1':'0';row.dataset.searchable=norm(\`${'${p.name||\'\'} ${p.nickname||\'\'} ${p.bullshooter?.id||\'\'} ${p.edc?.name||\'\'}'}\`);
      if(row.dataset.v096RobustnessSig!==sig){cell.innerHTML=\`<span class="robustness-badge ${'${r.label.toLowerCase()}'}" title="Sample ${'${r.sample}'}/40 · Verified sources ${'${r.coverage}'}/30 · Agreement ${'${r.agreement}'}/20 · Freshness ${'${r.freshness}'}/10">R ${'${r.score}'}<small>${'${r.label}'}</small></span>\`;row.dataset.v096RobustnessSig=sig}
    }
    applyColumnPrefs();applyPlayerFilters();
  }
  function savedColumns`);

const checksRe=/  function renderColumnChecks\(\)\{[^\n]*\}/;
if(!checksRe.test(ui))throw new Error('V0.9.6 UI patch: column checks function not found');
ui=ui.replace(checksRe,`  function renderColumnChecks(){const host=$('#playerColumnMenu');if(!host||!playerTable)return;const prefs=savedColumns();const markup=headerKeys().map(({key,label})=>{const def=!['CONTACT','HOME'].includes(label.toUpperCase()),on=prefs[key]??def;return\`<label><input type="checkbox" data-col="${'${esc(key)}'}" ${'${on?\'checked\':\'\'}'}>${'${esc(label)}'}</label>\`}).join('');if(host.dataset.v096Markup===markup)return;host.innerHTML=markup;host.dataset.v096Markup=markup;host.querySelectorAll('input').forEach(ch=>ch.addEventListener('change',()=>{const p=savedColumns();p[ch.dataset.col]=ch.checked;saveColumns(p);applyColumnPrefs()}))}`);

const filterRe=/  function applyPlayerFilters\(\)\{[^\n]*\}/;
if(!filterRe.test(ui))throw new Error('V0.9.6 UI patch: player filter function not found');
ui=ui.replace(filterRe,`  function applyPlayerFilters(){if(!playerTable)return;const q=norm($('#playerDirectorySearch')?.value||''),source=$('#playerSourceFilter')?.value||'all',rob=$('#playerRobustFilter')?.value||'all';for(const row of playerTable.querySelectorAll('tbody tr')){const searchable=row.dataset.searchable||norm(row.textContent||'');let ok=!q||searchable.includes(q);const sources=Number(row.dataset.sources||0),score=Number(row.dataset.robustness||0),f={bs:row.dataset.hasBs==='1',toc:row.dataset.hasToc==='1',edc:row.dataset.hasEdc==='1',cd:row.dataset.hasCd==='1'};if(source==='multi')ok=ok&&sources>=2;else if(source==='needs')ok=ok&&sources<2;else if(source==='bs')ok=ok&&f.bs;else if(source==='toc')ok=ok&&f.toc;else if(source==='edc')ok=ok&&f.edc;else if(source==='cd')ok=ok&&f.cd;if(rob==='strong')ok=ok&&score>=70;else if(rob==='solid')ok=ok&&score>=50;else if(rob==='thin')ok=ok&&score<50;row.style.display=ok?'':'none'}}`);

required(
"  async function refreshLinkWorkspace(){const p=selectedPlayer();renderEdcLinkState();if(!p)return;const input=$('#edcLinkSearch');if(input&&!input.dataset.touched)input.value=p.name||'';ensureRobustnessColumn()}",
`  async function loadSelectedTocIntel(p=selectedPlayer()){
    if(!p)return;const id=String(p.id);if(tocIntel.has(id))return;
    try{tocIntel.set(id,await api('/api/players/'+encodeURIComponent(id)+'/toc'));robustnessCache.delete(id);scheduleEnhance()}catch{}
  }
  async function refreshLinkWorkspace(){const p=selectedPlayer();renderEdcLinkState();if(!p)return;const input=$('#edcLinkSearch');if(input&&!input.dataset.touched)input.value=p.name||'';void loadSelectedTocIntel(p);scheduleEnhance()}`,
'on-demand TOC detail'
);

const loadRe=/  async function loadData\(\)\{[\s\S]*?\n  \}\n  function observe\(\)\{[^\n]*\}\n  async function boot\(\)\{[^\n]*\}/;
if(!loadRe.test(ui))throw new Error('V0.9.6 UI patch: load/observer/boot block not found');
ui=ui.replace(loadRe,`  async function loadData(){
    const [p,l]=await Promise.all([api('/api/players'),api('/api/toc/links').catch(()=>[])]);players=Array.isArray(p)?p:[];tocLinks=Array.isArray(l)?l:(l.links||[]);tocIntel.clear();rebuildIndexes();ensurePlayerToolbar();scheduleEnhance();refreshLinkWorkspace();
  }
  function watchRoot(){const root=$('#players');if(!root)return;if(observer)observer.disconnect();observer=new MutationObserver(()=>{if(!enhancing)scheduleEnhance()});observer.observe(root,{childList:true,subtree:true})}
  function scheduleEnhance(){if(enhancing)return;clearTimeout(enhanceTimer);enhanceTimer=setTimeout(runEnhance,120)}
  function runEnhance(){enhanceTimer=null;if(enhancing)return;enhancing=true;observer?.disconnect();try{ensureIntelLayout();ensurePlayerToolbar();ensureRobustnessColumn()}finally{enhancing=false;watchRoot()}}
  async function boot(){if(!$('#players'))return setTimeout(boot,350);ensureIntelLayout();try{await loadData()}catch(e){console.warn('V0.9.6 player intelligence:',e)}watchRoot();scheduleEnhance()}`);

ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.4','EXTERNAL PLAYER INTELLIGENCE · V0.9.6');
fs.writeFileSync(uiPath,ui);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.5'","version:'0.9.6'").replaceAll('Camarillo Darts V0.9.5 running','Camarillo Darts V0.9.6 running');
fs.writeFileSync(serverPath,server);
let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.5','V0.9.6').replaceAll('Camarillo Darts Nexus 0.9.5','Camarillo Darts Nexus 0.9.6');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.6';pkg.description='Camarillo Darts Nexus responsive multi-source player intelligence';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/ui-performance-v096.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
