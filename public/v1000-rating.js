(()=>{
  const H={'content-type':'application/json'};
  const state={data:null,loading:false,observer:null,timer:null};
  const upper=s=>String(s||'').trim().toUpperCase();
  const api=async url=>{const r=await fetch(url,{headers:H});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d};
  const table=()=>document.querySelector('#playerRows')?.closest('table')||[...document.querySelectorAll('#players table')].find(t=>[...t.querySelectorAll('thead th')].some(h=>upper(h.textContent)==='BULLSHOOTER'))||null;
  const headerIndex=(t,...names)=>{const wanted=names.map(upper);return[...t.querySelectorAll('thead th')].findIndex(h=>wanted.includes(upper(h.textContent)))};
  const fmt=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
  const sourceLine=(entry,key,label)=>{
    const w=Number(entry?.sourceWeights?.[key]||0),r=entry?.sourceRatings?.[key];
    if(!(w>0)||!Number.isFinite(Number(r)))return null;
    return`${label} ${Number(r).toFixed(1)} @ ${w.toFixed(1)}w`;
  };
  const markup=entry=>{
    if(!entry||!Number.isFinite(Number(entry.rating)))return'<div class="nexus-rating-block missing"><div class="nx-main"><span>NX</span><strong>—</strong></div></div>';
    const lines=[sourceLine(entry,'bullshooter','BS'),sourceLine(entry,'edc','EDC'),sourceLine(entry,'toc','TOC'),sourceLine(entry,'camarillo','CD')].filter(Boolean);
    const title=`Nexus Rating ${fmt(entry.rating,1)}/100 · ${fmt(entry.nexusPPD,2)} PPD · ${fmt(entry.nexusMPR,2)} MPR${lines.length?' · '+lines.join(' · '):''}`;
    return`<div class="nexus-rating-block" title="${title}"><div class="nx-main"><span>NX</span><strong>${fmt(entry.rating,1)}</strong></div><small>${fmt(entry.nexusPPD,2)} PPD · ${fmt(entry.nexusMPR,2)} MPR</small></div>`;
  };

  function render(){
    const t=table();if(!t)return;
    const ratingIdx=headerIndex(t,'NEXUS RATING','BS / CD RATING');
    const bsIdx=headerIndex(t,'BULLSHOOTER');
    if(ratingIdx<0||bsIdx<0)return;
    const th=t.querySelectorAll('thead th')[ratingIdx];if(th&&upper(th.textContent)!=='NEXUS RATING')th.textContent='Nexus Rating';
    const index=state.data?.byBullshooterId||{};
    for(const row of t.querySelectorAll('tbody tr')){
      const cell=row.cells[ratingIdx],bsCell=row.cells[bsIdx];if(!cell||!bsCell)continue;
      const id=String(bsCell.textContent||'').match(/#\s*(\d{3,})\b/)?.[1]||'';
      const entry=id?index[id]:null;
      const sig=entry?`${id}|${entry.rating}|${entry.nexusPPD}|${entry.nexusMPR}|${JSON.stringify(entry.sourceWeights||{})}`:`missing|${id}`;
      if(cell.dataset.v1000Sig!==sig||!cell.querySelector('.nexus-rating-block')){cell.innerHTML=markup(entry);cell.dataset.v1000Sig=sig}
      if(entry&&Number.isFinite(Number(entry.rating)))row.dataset.nexusRating=String(entry.rating);else delete row.dataset.nexusRating;
    }
    observe(t);
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(render,80)}
  function observe(t=table()){
    const body=t?.querySelector('tbody');if(!body)return;
    if(state.observer)state.observer.disconnect();
    state.observer=new MutationObserver(schedule);
    state.observer.observe(body,{childList:true});
  }
  async function load(){
    if(state.loading)return;state.loading=true;
    try{state.data=await api('/api/players/nexus-rating');render()}
    catch(e){console.warn('V0.10.0 Nexus Rating:',e)}
    finally{state.loading=false}
  }
  function boot(){
    void load();
    setTimeout(render,500);setTimeout(render,1500);setTimeout(render,3000);
    document.addEventListener('camarillo:identity-linked',()=>void load());
    document.addEventListener('camarillo:source-unlinked',()=>void load());
    document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(b&&/^sync$/i.test(b.textContent.trim()))setTimeout(()=>void load(),2500)});
  }
  window.CDNexusRatingV1000={reload:load,refresh:render,get data(){return state.data}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
