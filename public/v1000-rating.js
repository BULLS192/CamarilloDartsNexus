(()=>{
  const H={'content-type':'application/json'};
  const state={data:null,loading:false,observer:null,timer:null};
  const upper=s=>String(s||'').trim().toUpperCase();
  const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const api=async url=>{const r=await fetch(url,{headers:H});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d};
  const table=()=>document.querySelector('#playerRows')?.closest('table')||[...document.querySelectorAll('#players table')].find(t=>[...t.querySelectorAll('thead th')].some(h=>upper(h.textContent)==='BULLSHOOTER'))||null;
  const headerIndex=(t,...names)=>{const wanted=names.map(upper);return[...t.querySelectorAll('thead th')].findIndex(h=>wanted.includes(upper(h.textContent)))};
  const fmt=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
  const sourceLine=(entry,key,label)=>{
    const w=Number(entry?.sourceWeights?.[key]||0),b=Number(entry?.sourceBaseWeights?.[key]||0),r=entry?.sourceRatings?.[key],a=Number(entry?.agreementFactors?.[key]||1),o=Number(entry?.outlierFactors?.[key]||1),i=Number(entry?.independenceFactors?.[key]||1);
    if(!(w>0)||!Number.isFinite(Number(r)))return null;
    const factors=[];if(Math.abs(a-1)>.001)factors.push(`agree×${a.toFixed(2)}`);if(Math.abs(o-1)>.001)factors.push(`outlier×${o.toFixed(2)}`);if(Math.abs(i-1)>.001)factors.push(`independent×${i.toFixed(2)}`);
    return`${label} ${Number(r).toFixed(1)} @ ${w.toFixed(1)}w${b>0&&Math.abs(b-w)>.01?` (base ${b.toFixed(1)}${factors.length?', '+factors.join(', '):''})`:factors.length?` (${factors.join(', ')})`:''}`;
  };
  const ratingMarkup=entry=>{
    if(!entry||!Number.isFinite(Number(entry.rating)))return'<div class="nexus-rating-block missing"><div class="nx-main"><span>NX</span><strong>—</strong></div></div>';
    const lines=[sourceLine(entry,'bullshooter','BS'),sourceLine(entry,'edc','EDC'),sourceLine(entry,'toc','TOC'),sourceLine(entry,'camarillo','CD')].filter(Boolean);
    const consensus=Number(entry.sourceCount||0)>1?` · ${entry.sourceCount} sources${Number.isFinite(Number(entry.consensusMedian))?` · median ${fmt(entry.consensusMedian,1)}`:''}`:'';
    const title=`Nexus Rating ${fmt(entry.rating,1)}/150 · ${fmt(entry.nexusPPD,2)} PPD · ${fmt(entry.nexusMPR,2)} MPR${consensus}${lines.length?' · '+lines.join(' · '):''}`;
    return`<div class="nexus-rating-block" title="${title}"><div class="nx-main"><span>NX</span><strong>${fmt(entry.rating,1)}</strong></div><small>${fmt(entry.nexusPPD,2)} PPD · ${fmt(entry.nexusMPR,2)} MPR</small></div>`;
  };
  const robustnessMarkup=r=>{
    if(!r||!Number.isFinite(Number(r.score)))return'<span class="robustness-badge thin" title="No robustness record matched this Nexus player">R —</span>';
    const c=r.components||{},e=r.evidence||{};
    const title=`Robustness ${r.score}/100 · EDC ${c.edc??0}/30 (${e.edcGames??0}/80 games) · PPD/TOC ${c.toc??0}/30 · BullShooter 501 ${c.bullshooter501??0}/20 (${e.bs501Games??0}/50 games) · BullShooter Cricket ${c.bullshooterCricket??0}/20 (${e.bsCricketGames??0}/50 games)`;
    return`<span class="robustness-badge ${String(r.label||'Thin').toLowerCase()}" title="${title}">R ${r.score}<small>${r.label||'Thin'}</small></span>`;
  };
  const nameIndex=()=>{
    const out=new Map();
    for(const entry of Object.values(state.data?.byPlayerId||{})){
      const k=norm(entry?.name);if(!k)continue;
      if(out.has(k))out.set(k,null);else out.set(k,entry);
    }
    return out;
  };
  function entryForRow(row,bsIdx,names){
    const bsCell=row.cells[bsIdx],id=String(bsCell?.textContent||'').match(/#\s*(\d{3,})\b/)?.[1]||'';
    if(id&&state.data?.byBullshooterId?.[id])return{id,entry:state.data.byBullshooterId[id]};
    const pid=String(row.dataset.nexusPlayerId||'');
    if(pid&&state.data?.byPlayerId?.[pid])return{id,pid,entry:state.data.byPlayerId[pid]};
    const key=norm(row.cells[0]?.textContent||'');const byName=key?names.get(key):null;
    return{id,pid,entry:byName||null};
  }

  function render(){
    const t=table();if(!t)return;
    const ratingIdx=headerIndex(t,'NEXUS RATING','BS / CD RATING');
    const robustIdx=headerIndex(t,'ROBUSTNESS');
    const bsIdx=headerIndex(t,'BULLSHOOTER');
    if(ratingIdx<0||robustIdx<0||bsIdx<0)return;
    const heads=t.querySelectorAll('thead th');
    if(heads[ratingIdx]&&upper(heads[ratingIdx].textContent)!=='NEXUS RATING')heads[ratingIdx].textContent='Nexus Rating';
    const names=nameIndex();
    for(const row of t.querySelectorAll('tbody tr')){
      const ratingCell=row.cells[ratingIdx],robustCell=row.cells[robustIdx];if(!ratingCell||!robustCell)continue;
      const {id,entry}=entryForRow(row,bsIdx,names);
      const ratingSig=entry?`${id}|${entry.playerId||''}|${entry.rating}|${entry.nexusPPD}|${entry.nexusMPR}|${JSON.stringify(entry.sourceWeights||{})}`:`missing|${id}`;
      if(ratingCell.dataset.v1001RatingSig!==ratingSig||!ratingCell.querySelector('.nexus-rating-block')){ratingCell.innerHTML=ratingMarkup(entry);ratingCell.dataset.v1001RatingSig=ratingSig}
      const r=entry?.robustness||null;
      const robustSig=r?`${id}|${r.playerId||''}|${r.score}|${r.label}|${JSON.stringify(r.components||{})}`:`missing|${id}|${entry?.playerId||''}`;
      if(robustCell.dataset.v1001RobustSig!==robustSig||!robustCell.querySelector('.robustness-badge')){robustCell.innerHTML=robustnessMarkup(r);robustCell.dataset.v1001RobustSig=robustSig}
      if(entry&&Number.isFinite(Number(entry.rating)))row.dataset.nexusRating=String(entry.rating);else delete row.dataset.nexusRating;
      if(r&&Number.isFinite(Number(r.score))){
        row.dataset.robustness=String(r.score);row.dataset.sources=String(r.sources??0);
        row.dataset.hasBs=r.flags?.bs?'1':'0';row.dataset.hasToc=r.flags?.toc?'1':'0';row.dataset.hasEdc=r.flags?.edc?'1':'0';row.dataset.hasCd=r.flags?.cd?'1':'0';
      }else{
        delete row.dataset.robustness;delete row.dataset.sources;delete row.dataset.hasBs;delete row.dataset.hasToc;delete row.dataset.hasEdc;delete row.dataset.hasCd;
      }
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
    catch(e){console.warn('V0.10.2 Player Metrics:',e)}
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
  window.CDNexusPlayerMetricsV1001=window.CDNexusRatingV1000;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
