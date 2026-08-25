import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const statsPath=fs.existsSync('/app/public/v092-stats.js')?'/app/public/v092-stats.js':'public/v092-stats.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

const req=(text,from,to,label)=>{if(!text.includes(from))throw new Error(`V0.9.8 patch: ${label} anchor not found`);return text.replace(from,to)};

let toc=fs.readFileSync(tocPath,'utf8');
toc=req(toc,
`async function tocCount(){
  if(REMOTE){
    const {res}=await remoteFetch('camarillo_toc_players?select=toc_id&active=eq.true&limit=1',{headers:{prefer:'count=exact'}});
    const cr=res.headers.get('content-range')||''; const m=cr.match(/\\/(\\d+)$/); return m?Number(m[1]):null;
  }
  const db=await readLocal(); return (db.players||[]).filter(x=>x.active!==false).length;
}`,
`async function tocCount(){
  if(REMOTE){
    const {data}=await remoteFetch('rpc/camarillo_toc_active_count',{method:'POST',body:{}});
    return num(data);
  }
  const db=await readLocal(); return (db.players||[]).filter(x=>x.active!==false).length;
}`,
'TOC status count fast path');

const searchRe=/export async function searchTocDirectory\(\{q='',state='',vendor='',limit=50,offset=0,active=true\}=\{\}\)\{[\s\S]*?\n\s*const db=await readLocal\(\);/;
if(!searchRe.test(toc))throw new Error('V0.9.8 patch: TOC search block not found');
const searchPrefix=`export async function searchTocDirectory({q='',state='',vendor='',limit=50,offset=0,active=true}={}){
  limit=Math.max(1,Math.min(250,Number(limit)||50)); offset=Math.max(0,Number(offset)||0);
  if(REMOTE){
    const {data}=await remoteFetch('rpc/camarillo_toc_search',{method:'POST',body:{
      p_query:String(q||'').trim(),
      p_state:String(state||'').trim().toUpperCase(),
      p_vendor:String(vendor||'').trim(),
      p_limit:limit,
      p_offset:offset
    }});
    return (Array.isArray(data)?data:[]).map(fromRemotePlayer);
  }
  const db=await readLocal();`;
toc=toc.replace(searchRe,searchPrefix);
toc=toc.replace("const VERSION='0.9.7';","const VERSION='0.9.8';");
fs.writeFileSync(tocPath,toc);

let stats=fs.readFileSync(statsPath,'utf8');
stats=req(stats,
"  let refreshTimer=null,lastSelected='',playersCache=null,playersCacheAt=0,statsObserver=null;",
"  let refreshTimer=null,lastSelected='',playersCache=null,playersCacheAt=0;",
'stats observer state');
stats=req(stats,
"    if(!intel.dataset.statsSourcesObserved){intel.dataset.statsSourcesObserved='1';statsObserver?.disconnect();statsObserver=new MutationObserver(()=>schedule(true));statsObserver.observe(intel,{childList:true,subtree:true})}\n    schedule();return true;",
"    schedule();return true;",
'remove selected-player mutation feedback loop');
fs.writeFileSync(statsPath,stats);

let ui=fs.readFileSync(playerUiPath,'utf8');
ui=req(ui,
"      if(!cell){cell=document.createElement('td');cell.dataset.v094='robustness';const actionCell=actionIndex>=0?row.cells[actionIndex]:null;if(actionCell)actionCell.before(cell);else row.appendChild(cell)}",
"      if(!cell){const actionCell=row.cells[row.cells.length-1]||null;cell=document.createElement('td');cell.dataset.v094='robustness';if(actionCell)actionCell.before(cell);else row.appendChild(cell)}else{const actionCell=[...row.cells].find(c=>c!==cell&&c.querySelector('button'));if(actionCell&&cell.nextElementSibling!==actionCell)actionCell.before(cell)}",
'robustness/actions column order');
ui=req(ui,
"  async function refreshLinkWorkspace(){const p=selectedPlayer();renderEdcLinkState();if(!p)return;const input=$('#edcLinkSearch');if(input&&!input.dataset.touched)input.value=p.name||'';void loadSelectedTocIntel(p);scheduleEnhance()}",
"  async function refreshLinkWorkspace(){const p=selectedPlayer();renderEdcLinkState();if(!p)return;const input=$('#edcLinkSearch');if(input&&!input.dataset.touched){const probe=[p.firstName,p.lastName].filter(Boolean).join(' ').trim()||String(p.name||'').replace(/[\\\"“”][^\\\"“”]*[\\\"“”]/g,' ').replace(/\\s+/g,' ').trim();input.value=probe||p.name||'';if(input.value)void searchEdc('link')}scheduleEnhance()}",
'auto-surface EDC candidates without auto-linking');
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.7','EXTERNAL PLAYER INTELLIGENCE · V0.9.8');
fs.writeFileSync(playerUiPath,ui);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.7'","version:'0.9.8'").replaceAll('Camarillo Darts V0.9.7 running','Camarillo Darts V0.9.8 running');
fs.writeFileSync(serverPath,server);
let html=fs.readFileSync(indexPath,'utf8');html=html.replaceAll('V0.9.7','V0.9.8').replaceAll('Camarillo Darts Nexus 0.9.7','Camarillo Darts Nexus 0.9.8');fs.writeFileSync(indexPath,html);
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.8';pkg.description='Camarillo Darts Nexus fast verified external linking and responsive player intelligence';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/player-linking-v098.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
