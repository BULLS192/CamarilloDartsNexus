(()=>{
  const H={'content-type':'application/json'};
  let refreshTimer=null,lastSelected='';
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const fmt=(v,d=2)=>n(v)===null?'—':n(v).toFixed(d);
  const when=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString()};
  const composite=(ppd,mpr)=>n(ppd)!==null&&n(mpr)!==null?Math.round((n(ppd)+10*n(mpr))*1000)/1000:null;
  const normalizedRating=(ppd,mpr)=>{
    const p=n(ppd),m=n(mpr);if(p===null||m===null)return null;
    const pn=Math.max(0,Math.min(100,((p-10)/25)*100));
    const mn=Math.max(0,Math.min(100,((m-1)/3.5)*100));
    return Math.round(((pn+mn)/2)*10)/10;
  };
  const initialEstablished=(current,last50,last20,last10)=>{
    const c=n(current),r50=n(last50),r20=n(last20),r10=n(last10);
    const parts=[[r50,.5],[r20,.3],[r10,.2]].filter(([v])=>v!==null);
    if(parts.length){const w=parts.reduce((s,[,x])=>s+x,0);return Math.round((parts.reduce((s,[v,x])=>s+v*x,0)/w)*100)/100}
    return c===null?null:Math.round(c*100)/100;
  };
  const blendCamarillo=(external,rolling30,last10,games)=>{
    const ext=n(external),cd30=n(rolling30),cd10=n(last10),count=Number(games)||0;
    if(cd30===null||count<=0)return ext===null?null:Math.round(ext*100)/100;
    let ew=0;if(count<10)ew=.75;else if(count<20)ew=.5;else if(count<30)ew=.25;
    let base=ext!==null?ew*ext+(1-ew)*cd30:cd30;if(count>=30)base=cd30;
    if(cd10!==null&&cd10>base)base=.85*base+.15*cd10;
    return Math.round(base*100)/100;
  };
  async function api(url,opt={}){const r=await fetch(url,{headers:H,...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
  function nexusWorking(player){
    const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};
    const bsPPD=initialEstablished(b.ppd,b.last50PPD,b.last20PPD,b.last10PPD);
    const bsMPR=initialEstablished(b.mpr,b.last50MPR,b.last20MPR,b.last10MPR);
    const startPPD=bsPPD!==null?bsPPD:n(e.ppd),startMPR=bsMPR!==null?bsMPR:n(e.mpr);
    const ppdSource=bsPPD!==null?'BullShooter':(n(e.ppd)!==null?'EDC':'—');
    const mprSource=bsMPR!==null?'BullShooter':(n(e.mpr)!==null?'EDC':'—');
    const ppd=blendCamarillo(startPPD,c.last30PPD,c.last10PPD,c.games01||0);
    const mpr=blendCamarillo(startMPR,c.last30MPR,c.last10MPR,c.gamesCricket||0);
    return{ppd,mpr,rating:normalizedRating(ppd,mpr),composite:composite(ppd,mpr),ppdSource,mprSource,games01:Number(c.games01)||0,gamesCricket:Number(c.gamesCricket)||0};
  }
  function divergence(a,b){
    const ap=n(a?.ppd),am=n(a?.mpr),bp=n(b?.ppd),bm=n(b?.mpr);
    if([ap,am,bp,bm].some(v=>v===null))return null;
    const ppd=Math.round(Math.abs(ap-bp)*1000)/1000,mpr=Math.round(Math.abs(am-bm)*1000)/1000;
    let level='review',label='Review';
    if(ppd<=1.5&&mpr<=.15){level='close';label='Close'}else if(ppd<=3&&mpr<=.3){level='moderate';label='Moderate'}
    return{ppd,mpr,level,label};
  }
  function statPair(ppd,mpr){return`<div class="source-stat-pair"><span><small>PPD</small><strong>${fmt(ppd,3)}</strong></span><span><small>MPR</small><strong>${fmt(mpr,3)}</strong></span></div>`}
  function sourceCard({cls='',title,status='',primaryLabel='Composite',primary=null,pair='',detail='',footer='',actions=''}){
    return`<article class="stats-source-card ${cls}"><div class="stats-source-head"><div><span class="stats-source-title">${esc(title)}</span><small>${esc(status)}</small></div>${actions}</div><div class="stats-source-primary"><small>${esc(primaryLabel)}</small><strong>${fmt(primary,primaryLabel.includes('0–100')?1:3)}</strong></div>${pair}<div class="stats-source-detail">${detail}</div>${footer?`<div class="stats-source-footer">${footer}</div>`:''}</article>`;
  }
  function windowRow(label,ppd,mpr){return`<span><b>${esc(label)}</b><small>${fmt(ppd,2)} PPD · ${fmt(mpr,2)} MPR</small></span>`}
  function renderStats(player,intel){
    const panel=$('#sourceStatsPanel');if(!panel)return;
    const b=player?.bullshooter||{},e=player?.edc||{},toc=intel?.toc||null,cmp=intel?.comparison||{},bsRef=cmp.bullshooter||{};
    const nx=nexusWorking(player);
    const bsPair={ppd:bsRef.ppd??b.ppd,mpr:bsRef.mpr??b.mpr};
    const tocPair=toc?{ppd:toc.ppd,mpr:toc.mpr}:null;
    const edcPair=(n(e.ppd)!==null||n(e.mpr)!==null)?{ppd:e.ppd,mpr:e.mpr}:null;
    const bsCard=sourceCard({
      cls:'source-bs',title:'BullShooter',status:b.id?`ID ${b.id}`:'No BullShooter ID',primary:composite(bsPair.ppd,bsPair.mpr),pair:statPair(b.ppd,b.mpr),
      detail:`<div class="source-window-grid">${windowRow('Last 50',b.last50PPD,b.last50MPR)}${windowRow('Last 20',b.last20PPD,b.last20MPR)}${windowRow('Last 10',b.last10PPD,b.last10MPR)}</div>`,
      footer:`Reference: ${esc(bsRef.label||'Current stats')} · ${Number(b.totalGames||0).toLocaleString()} reported games`
    });
    const tocCard=toc?sourceCard({
      cls:'source-toc',title:'PPD/TOC',status:`${toc.vendor||'Best-Known'}${toc.vendorState?' · '+toc.vendorState:''}`,primary:toc.rating??composite(toc.ppd,toc.mpr),pair:statPair(toc.ppd,toc.mpr),
      detail:`<div class="source-meta-list"><span>PPD source <b>${esc(toc.ppdSource||'—')}</b></span><span>MPR source <b>${esc(toc.mprSource||'—')}</b></span></div>`,
      footer:`${toc.tocEligible?'TOC eligible · ':''}${toc.showdown?'Showdown · ':''}${toc.mpid?'MPID '+esc(toc.mpid):'Linked Best-Known record'}`
    }):sourceCard({cls:'source-toc muted',title:'PPD/TOC',status:'No confirmed link',primary:null,pair:statPair(null,null),detail:`<div class="source-empty">${(intel?.candidates||[]).length?`${intel.candidates.length} candidate match${intel.candidates.length===1?'':'es'} available below.`:'Search or select a Best-Known record below.'}</div>`,footer:'Reference-only until a player is linked.'});
    const edcHas=n(e.ppd)!==null||n(e.mpr)!==null||n(e.evpRating)!==null;
    const edcCard=edcHas?sourceCard({
      cls:'source-edc',title:'EDC / EVP',status:e.name?`Matched ${e.name}`:'Saved EDC snapshot',primary:e.evpRating??composite(e.ppd,e.mpr),pair:statPair(e.ppd,e.mpr),
      detail:`<div class="source-meta-list"><span>Games <b>${e.games==null?'—':Number(e.games).toLocaleString()}</b></span><span>Sheet row <b>${e.sourceRow||'—'}</b></span><span>Captured <b>${esc(when(e.capturedAt))}</b></span></div>`,
      footer:esc(e.selectionRule||'Published EDC record selection rule'),actions:'<button id="edcSyncSelected" class="mini secondary">↻ Sync</button>'
    }):sourceCard({cls:'source-edc muted',title:'EDC / EVP',status:'No saved EDC match',primary:null,pair:statPair(null,null),detail:'<div class="source-empty">Sync EDC to search the published ratings sheet for this player.</div>',footer:'Does not overwrite Nexus identity fields.',actions:'<button id="edcSyncSelected" class="mini secondary">↻ Sync</button>'});
    const nexusCard=sourceCard({
      cls:'source-nexus',title:'Nexus Working',status:'Current handicap inputs',primaryLabel:'Nexus rating 0–100',primary:nx.rating,pair:statPair(nx.ppd,nx.mpr),
      detail:`<div class="source-meta-list"><span>External-equivalent composite <b>${fmt(nx.composite,3)}</b></span><span>PPD starts from <b>${esc(nx.ppdSource)}</b></span><span>MPR starts from <b>${esc(nx.mprSource)}</b></span></div>`,
      footer:`Camarillo sanctioned samples: ${nx.games01} X01 · ${nx.gamesCricket} Cricket`
    });
    const pairs=[['BullShooter ↔ PPD/TOC',bsPair,tocPair],['BullShooter ↔ EDC',bsPair,edcPair],['PPD/TOC ↔ EDC',tocPair,edcPair]];
    const divergenceRows=pairs.map(([label,a,bb])=>{const d=divergence(a,bb);return`<div class="source-divergence-row"><span>${esc(label)}</span>${d?`<b class="source-divergence ${d.level}">${d.label}</b><small>Δ PPD ${fmt(d.ppd,3)} · Δ MPR ${fmt(d.mpr,3)}</small>`:'<small>Incomplete pair</small>'}</div>`}).join('');
    panel.innerHTML=`<div class="source-stats-head"><div><span class="kicker">STATS SOURCES</span><b>${esc(player?.name||[player?.firstName,player?.lastName].filter(Boolean).join(' ')||'Selected player')}</b><span>Raw source stats first. Matching and blending rules come next.</span></div><button id="sourceStatsRefresh" class="mini secondary">Refresh stats</button></div><div class="stats-source-grid">${bsCard}${tocCard}${edcCard}${nexusCard}</div><div class="source-divergence-box"><div><b>Cross-source spread</b><span>These are observations only; Nexus is not auto-merging TOC into the handicap yet.</span></div>${divergenceRows}</div>`;
    $('#sourceStatsRefresh')?.addEventListener('click',()=>refreshSelected(true));
    $('#edcSyncSelected')?.addEventListener('click',syncEdc);
  }
  async function syncEdc(){
    const id=$('#tocNexusPlayer')?.value;if(!id)return;
    const btn=$('#edcSyncSelected');if(btn){btn.disabled=true;btn.textContent='Syncing…'}
    try{await api(`/api/players/${encodeURIComponent(id)}/edc-sync`,{method:'POST',body:'{}'});await refreshSelected(true)}
    catch(error){const panel=$('#sourceStatsPanel');if(panel){const note=document.createElement('div');note.className='source-stats-error';note.textContent=`EDC sync: ${error.message}`;panel.appendChild(note)}}
  }
  async function refreshSelected(force=false){
    const select=$('#tocNexusPlayer'),panel=$('#sourceStatsPanel');if(!select||!panel)return;
    const id=select.value;if(!id){lastSelected='';panel.innerHTML='<div class="source-stats-empty">Select a Nexus player to see BullShooter, PPD/TOC, EDC and Nexus working stats.</div>';return}
    if(!force&&id===lastSelected&&panel.dataset.loaded==='1')return;
    lastSelected=id;panel.dataset.loaded='0';panel.innerHTML='<div class="source-stats-empty">Loading all stats sources…</div>';
    try{
      const [players,intel]=await Promise.all([api('/api/players'),api(`/api/players/${encodeURIComponent(id)}/toc`)]);
      const player=(Array.isArray(players)?players:[]).find(p=>String(p.id)===String(id));
      if(!player)throw Error('Selected Nexus player was not found.');
      renderStats(player,intel);panel.dataset.loaded='1';
    }catch(error){panel.innerHTML=`<div class="source-stats-empty error">${esc(error.message)}</div>`}
  }
  function schedule(force=false){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshSelected(force),120)}
  function ensureUi(){
    const select=$('#tocNexusPlayer'),intel=$('#tocPlayerIntel');if(!select||!intel)return false;
    if(!$('#sourceStatsPanel')){const panel=document.createElement('div');panel.id='sourceStatsPanel';panel.className='source-stats-panel';intel.insertAdjacentElement('beforebegin',panel)}
    if(!select.dataset.statsSourcesBound){select.dataset.statsSourcesBound='1';select.addEventListener('change',()=>{lastSelected='';schedule(true)})}
    if(!intel.dataset.statsSourcesObserved){intel.dataset.statsSourcesObserved='1';new MutationObserver(()=>schedule(true)).observe(intel,{childList:true,subtree:true})}
    schedule();return true;
  }
  function boot(){if(!ensureUi())setTimeout(boot,350);else setInterval(()=>ensureUi(),4000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
