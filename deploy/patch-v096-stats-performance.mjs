import fs from 'node:fs';

const statsPath=fs.existsSync('/app/public/v092-stats.js')?'/app/public/v092-stats.js':'public/v092-stats.js';
let stats=fs.readFileSync(statsPath,'utf8');
const replaceRequired=(from,to,label)=>{if(!stats.includes(from))throw new Error(`V0.9.6 stats performance patch: ${label} anchor not found`);stats=stats.replace(from,to)};

replaceRequired(
  "  let refreshTimer=null,lastSelected='';",
  "  let refreshTimer=null,lastSelected='',playersCache=null,playersCacheAt=0,statsObserver=null;",
  'stats state'
);

replaceRequired(
  "  async function api(url,opt={}){const r=await fetch(url,{headers:H,...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}",
  "  async function api(url,opt={}){const r=await fetch(url,{headers:H,...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}\n  async function getPlayersCached(force=false){if(!force&&playersCache&&Date.now()-playersCacheAt<60_000)return playersCache;const rows=await api('/api/players');playersCache=Array.isArray(rows)?rows:[];playersCacheAt=Date.now();return playersCache}",
  'player list cache'
);

replaceRequired(
  "    $('#sourceStatsRefresh')?.addEventListener('click',()=>refreshSelected(true));",
  "    $('#sourceStatsRefresh')?.addEventListener('click',()=>refreshSelected(true,true));",
  'explicit refresh invalidates player cache'
);

replaceRequired(
  "    try{await api(`/api/players/${encodeURIComponent(id)}/edc-sync`,{method:'POST',body:'{}'});await refreshSelected(true)}",
  "    try{await api(`/api/players/${encodeURIComponent(id)}/edc-sync`,{method:'POST',body:'{}'});playersCache=null;playersCacheAt=0;await refreshSelected(true,true)}",
  'EDC refresh invalidates player cache'
);

replaceRequired(
  "  async function refreshSelected(force=false){",
  "  async function refreshSelected(force=false,refreshPlayers=false){",
  'refreshSelected signature'
);
replaceRequired(
  "      const [players,intel]=await Promise.all([api('/api/players'),api(`/api/players/${encodeURIComponent(id)}/toc`)]);",
  "      const [players,intel]=await Promise.all([getPlayersCached(refreshPlayers),api(`/api/players/${encodeURIComponent(id)}/toc`)]);",
  'cached selected-player refresh'
);

const ensureBlock=`  function ensureUi(){
    const select=$('#tocNexusPlayer'),intel=$('#tocPlayerIntel');if(!select||!intel)return false;
    if(!$('#sourceStatsPanel')){const panel=document.createElement('div');panel.id='sourceStatsPanel';panel.className='source-stats-panel';intel.insertAdjacentElement('beforebegin',panel)}
    if(!select.dataset.statsSourcesBound){select.dataset.statsSourcesBound='1';select.addEventListener('change',()=>{lastSelected='';schedule(true)})}
    if(!intel.dataset.statsSourcesObserved){intel.dataset.statsSourcesObserved='1';new MutationObserver(()=>schedule(true)).observe(intel,{childList:true,subtree:true})}
    schedule();return true;
  }
  function boot(){if(!ensureUi())setTimeout(boot,350);else setInterval(()=>ensureUi(),4000)}`;
const optimizedBlock=`  function ensureUi(){
    const select=$('#tocNexusPlayer'),intel=$('#tocPlayerIntel');if(!select||!intel)return false;
    if(!$('#sourceStatsPanel')){const panel=document.createElement('div');panel.id='sourceStatsPanel';panel.className='source-stats-panel';intel.insertAdjacentElement('beforebegin',panel)}
    if(!select.dataset.statsSourcesBound){select.dataset.statsSourcesBound='1';select.addEventListener('change',()=>{lastSelected='';schedule(true)})}
    if(!intel.dataset.statsSourcesObserved){intel.dataset.statsSourcesObserved='1';statsObserver?.disconnect();statsObserver=new MutationObserver(()=>schedule(true));statsObserver.observe(intel,{childList:true,subtree:true})}
    schedule();return true;
  }
  function boot(){if(!ensureUi())setTimeout(boot,350)}`;
replaceRequired(ensureBlock,optimizedBlock,'remove stats polling loop');

fs.writeFileSync(statsPath,stats);
