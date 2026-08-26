(()=>{
  const H={'content-type':'application/json'};
  const state={data:null,loading:false,observer:null,timer:null};
  const api=async url=>{const r=await fetch(url,{headers:H});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d};
  const table=()=>document.querySelector('#playerRows')?.closest('table')||null;
  const heads=t=>[...t.querySelectorAll('thead th')];
  const hidx=(t,label)=>heads(t).findIndex(h=>h.textContent.trim().toUpperCase()===label);
  const actionCell=row=>[...row.cells].find(c=>[...c.querySelectorAll('button')].some(b=>/^(edit|sync)$/i.test(b.textContent.trim())))||null;
  const badge=entry=>entry?`<span class="robustness-badge ${String(entry.label||'Thin').toLowerCase()}" title="Robustness ${entry.score}/100 · sample ${entry.sample}/40 · verified sources ${entry.coverage}/30 · agreement ${entry.agreement}/20 · freshness ${entry.freshness}/10 · BullShooter evidence ${entry.evidence?.bullshooterGames||0} games">R ${entry.score}<small>${entry.label}</small></span>`:'<span class="robustness-badge thin" title="No robustness record matched this BullShooter ID">R —</span>';

  function ensureHeaders(t){
    const row=t.querySelector('thead tr');if(!row)return;
    let hs=heads(t),actions=hs.find(h=>h.textContent.trim().toUpperCase()==='ACTIONS');
    const robs=hs.filter(h=>h.textContent.trim().toUpperCase()==='ROBUSTNESS');
    let rob=robs.shift()||document.createElement('th');for(const extra of robs)extra.remove();
    rob.textContent='Robustness';rob.dataset.v0917='robustness';
    if(!rob.isConnected)row.appendChild(rob);
    if(actions&&rob.nextElementSibling!==actions)actions.before(rob);
  }

  function ensureRows(t){
    ensureHeaders(t);let hs=heads(t),robIdx=hidx(t,'ROBUSTNESS'),actionsIdx=hidx(t,'ACTIONS');if(robIdx<0||actionsIdx<0)return;
    for(const row of t.querySelectorAll('tbody tr')){
      const act=actionCell(row);if(!act)continue;
      // If the row has no cell at the Robustness slot, create exactly one immediately before Actions.
      if(act.cellIndex===robIdx){const c=document.createElement('td');c.dataset.v0917='robustness';act.before(c)}
      // If a previous patch left the Actions cell one position too far right, remove only marked legacy robustness extras.
      while(act.cellIndex>actionsIdx){const extras=[...row.cells].filter((c,i)=>i<act.cellIndex&&i!==robIdx&&(c.dataset.v094==='robustness'||c.dataset.v0915==='robustness'||c.dataset.v0916==='robustness'));if(!extras.length)break;extras.at(-1).remove()}
      const c=row.cells[robIdx];if(c&&c!==act){c.dataset.v0917='robustness';delete c.dataset.v0916Sig;delete c.dataset.v0915Sig}
    }
    hs=heads(t);for(const row of t.querySelectorAll('tbody tr'))hs.forEach((h,i)=>{const c=row.cells[i];if(c)c.classList.toggle('v094-col-hidden',h.classList.contains('v094-col-hidden'))});
  }

  function bullshooterId(row,t){const i=hidx(t,'BULLSHOOTER');if(i<0||!row.cells[i])return'';return String(row.cells[i].textContent||'').match(/#\s*(\d{3,})\b/)?.[1]||''}
  function render(){const t=table();if(!t)return;ensureRows(t);const robIdx=hidx(t,'ROBUSTNESS');if(robIdx<0)return;const index=state.data?.byBullshooterId||{};
    for(const row of t.querySelectorAll('tbody tr')){const cell=row.cells[robIdx];if(!cell||actionCell(row)===cell)continue;const id=bullshooterId(row,t),entry=id?index[id]:null,sig=entry?`${id}|${entry.score}|${entry.label}`:`missing|${id}`;
      if(cell.dataset.v0917Sig!==sig||!cell.querySelector('.robustness-badge')){cell.innerHTML=badge(entry);cell.dataset.v0917Sig=sig}
      if(entry){row.dataset.robustness=String(entry.score);row.dataset.sources=String(entry.sources);row.dataset.hasBs=entry.flags?.bs?'1':'0';row.dataset.hasToc=entry.flags?.toc?'1':'0';row.dataset.hasEdc=entry.flags?.edc?'1':'0';row.dataset.hasCd=entry.flags?.cd?'1':'0'}else delete row.dataset.robustness;
    }
    observe(t);
  }
  function schedule(){clearTimeout(state.timer);state.timer=setTimeout(render,60)}
  function observe(t=table()){const body=t?.querySelector('tbody');if(!body)return;if(state.observer)state.observer.disconnect();state.observer=new MutationObserver(schedule);state.observer.observe(body,{childList:true,subtree:true})}
  async function load(){if(state.loading)return;state.loading=true;try{state.data=await api('/api/players/robustness')}catch(e){console.warn('V0.9.17 robustness:',e)}finally{state.loading=false;render()}}
  function boot(){void load();setTimeout(render,500);setTimeout(render,1500);document.addEventListener('camarillo:identity-linked',()=>void load());document.addEventListener('camarillo:source-unlinked',()=>void load());document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(b&&/^sync$/i.test(b.textContent.trim()))setTimeout(()=>void load(),2500)})}
  const exported={refresh:render,reload:load};window.CDNexusRobustnessV0917=exported;window.CDNexusRobustnessV0916=exported;window.CDNexusRobustnessV0915=exported;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
