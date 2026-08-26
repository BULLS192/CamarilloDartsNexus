(()=>{
  const H={'content-type':'application/json'};
  const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','BS / CD RATING','ROBUSTNESS','ACTIONS'];
  const state={data:null,loading:false,observer:null,timer:null};
  const api=async url=>{const r=await fetch(url,{headers:H});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d};
  const table=()=>document.querySelector('#playerRows')?.closest('table')||null;
  const actionCell=row=>[...row.cells].find(c=>[...c.querySelectorAll('button')].some(b=>/^(edit|sync)$/i.test(b.textContent.trim())))||null;
  const upper=s=>String(s||'').trim().toUpperCase();
  const badge=entry=>{
    if(!entry)return'<span class="robustness-badge thin" title="No robustness record matched this BullShooter ID">R —</span>';
    const c=entry.components||{},e=entry.evidence||{};
    const title=`Robustness ${entry.score}/100 · EDC ${c.edc??0}/30 (${e.edcGames??0}/80 games) · PPD/TOC ${c.toc??0}/30 · BullShooter 501 ${c.bullshooter501??0}/20 (${e.bs501Games??0}/50 games) · BullShooter Cricket ${c.bullshooterCricket??0}/20 (${e.bsCricketGames??0}/50 games)`;
    return`<span class="robustness-badge ${String(entry.label||'Thin').toLowerCase()}" title="${title}">R ${entry.score}<small>${entry.label}</small></span>`;
  };

  function canonicalize(t){
    const headRow=t.querySelector('thead tr');if(!headRow)return;
    const oldHeads=[...headRow.querySelectorAll('th')],oldLabels=oldHeads.map(h=>upper(h.textContent));
    const current=oldLabels.join('|');
    const rows=[...t.querySelectorAll('tbody tr')];
    const structurallyCorrect=current===EXPECTED.join('|')&&rows.every(r=>r.cells.length===EXPECTED.length&&actionCell(r)?.cellIndex===EXPECTED.length-1);
    if(structurallyCorrect){syncHidden(t);return}

    const hidden=new Map();oldHeads.forEach((h,i)=>hidden.set(oldLabels[i],h.classList.contains('v094-col-hidden')));
    const newHeads=EXPECTED.map(label=>{const th=document.createElement('th');th.textContent=label==='PLAYER'?'Player':label==='CONTACT'?'Contact':label==='HOME'?'Home':label==='BULLSHOOTER'?'BullShooter':label==='CAMARILLO'?'Camarillo':label==='ACTIONS'?'Actions':label==='ROBUSTNESS'?'Robustness':label;if(hidden.get(label)||(label==='BS50'&&hidden.get('BS30')))th.classList.add('v094-col-hidden');return th});

    for(const row of rows){
      const oldCells=[...row.cells],map=new Map();oldLabels.forEach((label,i)=>{if(oldCells[i]&&!map.has(label))map.set(label,oldCells[i])});
      const act=actionCell(row)||map.get('ACTIONS')||document.createElement('td');
      const used=new Set([act]);
      const take=(...labels)=>{for(const label of labels){const c=map.get(label);if(c&&c!==act&&!used.has(c)){used.add(c);return c}}return null};
      const statRating=[...oldCells].find(c=>c!==act&&c.querySelector?.('.dual-rating'))||take('BS / CD RATING');if(statRating)used.add(statRating);
      const robust=[...oldCells].find(c=>c!==act&&(c.querySelector?.('.robustness-badge')||c.dataset?.v0917==='robustness'||c.dataset?.v0916==='robustness'||c.dataset?.v0915==='robustness'||c.dataset?.v094==='robustness'))||take('ROBUSTNESS');if(robust)used.add(robust);
      const ordered=[
        take('PLAYER'),take('CONTACT'),take('HOME'),take('BULLSHOOTER'),take('BS CURRENT'),take('BS50','BS30'),take('BS20'),take('BS10'),take('CAMARILLO'),statRating,robust,act
      ].map(c=>c||document.createElement('td'));
      ordered[10].dataset.v0918='robustness';
      row.replaceChildren(...ordered);
      row.dataset.v077='1';
    }
    headRow.replaceChildren(...newHeads);headRow.dataset.v077='1';
    syncHidden(t);
  }

  function syncHidden(t){const hs=[...t.querySelectorAll('thead th')];for(const row of t.querySelectorAll('tbody tr'))hs.forEach((h,i)=>{const c=row.cells[i];if(c)c.classList.toggle('v094-col-hidden',h.classList.contains('v094-col-hidden'))})}
  function bullshooterId(row){return String(row.cells[3]?.textContent||'').match(/#\s*(\d{3,})\b/)?.[1]||''}
  function render(){const t=table();if(!t)return;canonicalize(t);const index=state.data?.byBullshooterId||{};
    for(const row of t.querySelectorAll('tbody tr')){if(row.cells.length!==EXPECTED.length)continue;const cell=row.cells[10],id=bullshooterId(row),entry=id?index[id]:null,sig=entry?`${id}|${entry.score}|${entry.label}|${JSON.stringify(entry.components||{})}`:`missing|${id}`;
      if(cell.dataset.v0918Sig!==sig||!cell.querySelector('.robustness-badge')){cell.innerHTML=badge(entry);cell.dataset.v0918Sig=sig}
      if(entry){row.dataset.robustness=String(entry.score);row.dataset.sources=String(entry.sources);row.dataset.hasBs=entry.flags?.bs?'1':'0';row.dataset.hasToc=entry.flags?.toc?'1':'0';row.dataset.hasEdc=entry.flags?.edc?'1':'0';row.dataset.hasCd=entry.flags?.cd?'1':'0'}else delete row.dataset.robustness;
    }
    observe(t);
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(render,80)}
  function observe(t=table()){const body=t?.querySelector('tbody');if(!body)return;if(state.observer)state.observer.disconnect();state.observer=new MutationObserver(schedule);state.observer.observe(body,{childList:true,subtree:true})}
  async function load(){if(state.loading)return;state.loading=true;try{state.data=await api('/api/players/robustness')}catch(e){console.warn('V0.9.18 robustness:',e)}finally{state.loading=false;render()}}
  function boot(){void load();setTimeout(render,500);setTimeout(render,1500);document.addEventListener('camarillo:identity-linked',()=>void load());document.addEventListener('camarillo:source-unlinked',()=>void load());document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(b&&/^sync$/i.test(b.textContent.trim()))setTimeout(()=>void load(),2500)})}
  const exported={refresh:render,reload:load};window.CDNexusRobustnessV0918=exported;window.CDNexusRobustnessV0917=exported;window.CDNexusRobustnessV0916=exported;window.CDNexusRobustnessV0915=exported;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
