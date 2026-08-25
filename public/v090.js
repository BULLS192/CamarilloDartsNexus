(()=>{
  const H={'content-type':'application/json'};
  let allPlayers=[],directory=[],selectedToc=null,selectedPlayerId='',pollTimer=null,searchTimer=null;
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=3)=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d);
  async function api(url,opt={}){const r=await fetch(url,{headers:H,...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
  async function loadPlayers(){allPlayers=await api('/api/players');fillPlayerSelect()}
  function fillPlayerSelect(){const sel=$('#tocNexusPlayer');if(!sel)return;const cur=selectedPlayerId||sel.value;sel.innerHTML='<option value="">Select Nexus player…</option>'+allPlayers.map(p=>`<option value="${esc(p.id)}">${esc(p.name||[p.firstName,p.lastName].filter(Boolean).join(' ')||p.id)}</option>`).join('');if(cur&&allPlayers.some(p=>p.id===cur)){sel.value=cur;selectedPlayerId=cur}}
  function ensureUi(){
    if($('#tocIntelPanel'))return true;
    const head=$('#players .section-head'); if(!head)return false;
    const panel=document.createElement('div');panel.id='tocIntelPanel';panel.className='card toc-intel-panel';
    panel.innerHTML=`
      <div class="toc-head">
        <div><span class="kicker">PPD / TOC INTELLIGENCE · V0.9</span><strong>Best-Known Stats Layer</strong><span id="tocSummary">Checking cache…</span></div>
        <div class="toc-actions"><button id="tocSync" class="secondary">↻ Sync PPD/TOC</button><button id="tocRefresh" class="mini secondary">Refresh</button></div>
      </div>
      <div id="tocProgressWrap" class="toc-progress-wrap"><div class="toc-progress"><div id="tocProgressBar"></div></div><span id="tocProgressText">Idle</span></div>
      <div class="toc-grid">
        <section class="toc-directory">
          <div class="toc-subhead"><div><b>PPD / TOC Directory</b><span>Cached Best-Known records; Nexus reads this cache instead of scraping on every profile view.</span></div></div>
          <div class="toc-toolbar"><input id="tocSearch" placeholder="Search player, vendor, MPID…"><input id="tocState" maxlength="2" placeholder="State"><button id="tocSearchBtn" class="mini secondary">Search</button></div>
          <div class="toc-table-wrap"><table class="toc-table"><thead><tr><th>Player</th><th>State</th><th>Rating</th><th>PPD / MPR</th><th>Vendor</th><th>Status</th><th></th></tr></thead><tbody id="tocRows"><tr><td colspan="7">No cached records yet.</td></tr></tbody></table></div>
        </section>
        <section class="toc-player-intel">
          <div class="toc-subhead"><div><b>Nexus Player Cross-Check</b><span>Links are conservative: Nexus never auto-links an ambiguous name.</span></div></div>
          <select id="tocNexusPlayer"><option value="">Select Nexus player…</option></select>
          <div id="tocPlayerIntel" class="toc-intel-empty">Select a Nexus player to compare BullShooter and PPD/TOC.</div>
        </section>
      </div>
      <div id="tocToast" class="toc-toast" aria-live="polite"></div>`;
    const bulk=$('#bulkSyncPanel'); (bulk||head).insertAdjacentElement('afterend',panel);
    $('#tocSync').addEventListener('click',startSync);$('#tocRefresh').addEventListener('click',refreshAll);$('#tocSearchBtn').addEventListener('click',searchDirectory);
    $('#tocSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchDirectory,300)});
    $('#tocState').addEventListener('input',()=>{const e=$('#tocState');e.value=e.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);clearTimeout(searchTimer);searchTimer=setTimeout(searchDirectory,300)});
    $('#tocNexusPlayer').addEventListener('change',e=>{selectedPlayerId=e.target.value;loadPlayerIntel()});
    return true;
  }
  function toast(msg,type=''){const el=$('#tocToast');if(!el)return;el.textContent=msg;el.className=`toc-toast ${type}`;clearTimeout(el._t);el._t=setTimeout(()=>{el.textContent='';el.className='toc-toast'},4500)}
  async function status(){
    try{
      const s=await api('/api/toc/status'),c=s.current||{},last=s.lastRun||{};
      const count=s.directoryCount==null?'—':Number(s.directoryCount).toLocaleString();
      const lastAt=last.finished_at||last.finishedAt||last.started_at||last.startedAt;
      $('#tocSummary').textContent=`${count} active Best-Known records · ${s.backend==='supabase'?'Supabase cache':'Local cache'}${lastAt?` · last sync ${new Date(lastAt).toLocaleString()}`:''}`;
      const running=Boolean(c.running);$('#tocSync').disabled=running;$('#tocSync').textContent=running?'Syncing PPD/TOC…':'↻ Sync PPD/TOC';
      const page=Number(c.page||c.pages||0),rows=Number(c.rowsSeen||0),unique=Number(c.uniqueRows||0);
      $('#tocProgressText').textContent=running?`Page ${page||1} · ${rows.toLocaleString()} rows seen · ${unique.toLocaleString()} unique`:(c.status==='error'?`Last sync error: ${c.error||'unknown error'}`:`${c.status||'idle'}${unique?` · ${unique.toLocaleString()} unique rows`:''}`);
      $('#tocProgressBar').style.width=running?`${Math.min(95,10+page*2)}%`:(c.status==='success'?'100%':'0%');
      if(running){clearTimeout(pollTimer);pollTimer=setTimeout(status,1800)}else if(c.status==='success'&&status._wasRunning){status._wasRunning=false;await searchDirectory();toast('PPD/TOC sync complete.','ok')}
      if(running)status._wasRunning=true;
      return s;
    }catch(e){$('#tocSummary').textContent=`TOC status unavailable · ${e.message}`;return null}
  }
  async function startSync(){try{const r=await api('/api/toc/sync',{method:'POST',body:'{}'});toast(r.alreadyRunning?'PPD/TOC sync is already running.':'PPD/TOC sync started.','ok');status._wasRunning=true;await status()}catch(e){toast(e.message,'error')}}
  async function searchDirectory(){
    const q=$('#tocSearch')?.value.trim()||'',state=$('#tocState')?.value.trim()||'';
    try{directory=await api(`/api/toc/directory?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}&limit=50`);renderRows()}catch(e){$('#tocRows').innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`}
  }
  function statusBadges(r){return `${r.showdown===true?'<span class="toc-badge yes">Showdown</span>':''}${r.tocEligible===true?`<span class="toc-badge yes">TOC${r.tocSeason?' '+esc(r.tocSeason):''}</span>`:''}${r.showdown===false&&r.tocEligible===false?'<span class="toc-badge no">No qualifier</span>':''}`}
  function renderRows(){
    const body=$('#tocRows');if(!body)return;if(!directory.length){body.innerHTML='<tr><td colspan="7">No matching cached Best-Known records.</td></tr>';return}
    body.innerHTML=directory.map((r,i)=>`<tr data-toc="${esc(r.tocId)}"><td><b>${esc(r.playerName)}</b><span>${r.mpid?`MPID ${esc(r.mpid)}`:'Cached TOC record'}</span></td><td>${esc(r.vendorState||'—')}</td><td>${fmt(r.rating,3)}</td><td>${fmt(r.ppd,3)} / ${fmt(r.mpr,3)}<span>${esc(r.ppdSource||'—')} · ${esc(r.mprSource||'—')}</span></td><td>${esc(r.vendor||'—')}</td><td>${statusBadges(r)}</td><td><button class="mini secondary toc-use" data-i="${i}">Use</button></td></tr>`).join('');
    body.querySelectorAll('.toc-use').forEach(b=>b.addEventListener('click',()=>{selectedToc=directory[Number(b.dataset.i)];renderSelectedToc();}));
  }
  function extLink(url,label){return url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:esc(label)}
  function renderSelectedToc(){
    if(!selectedPlayerId){toast('Select a Nexus player first.');return}
    const box=$('#tocPlayerIntel');if(!selectedToc||!box)return;
    box.innerHTML=`<div class="toc-selected"><span class="kicker">SELECTED BEST-KNOWN RECORD</span><b>${esc(selectedToc.playerName)}</b><div class="toc-metrics"><span>Rating <strong>${fmt(selectedToc.rating,3)}</strong></span><span>PPD <strong>${fmt(selectedToc.ppd,3)}</strong></span><span>MPR <strong>${fmt(selectedToc.mpr,3)}</strong></span></div><div>${esc(selectedToc.vendor||'—')} · ${esc(selectedToc.vendorState||'—')}</div><div class="toc-source-links">${extLink(selectedToc.ppdSourceUrl,selectedToc.ppdSource||'PPD source')} · ${extLink(selectedToc.mprSourceUrl,selectedToc.mprSource||'MPR source')}</div><button id="tocLinkSelected" class="primary">Link this PPD/TOC record</button></div>`;
    $('#tocLinkSelected').addEventListener('click',()=>linkSelected(selectedToc.tocId));
  }
  async function linkSelected(tocId){if(!selectedPlayerId)return;try{await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'POST',body:JSON.stringify({tocId,confirmed:true,matchMethod:'manual',confidence:'confirmed'})});toast('PPD/TOC player linked.','ok');selectedToc=null;await loadPlayerIntel()}catch(e){toast(e.message,'error')}}
  function confidence(c){const x=String(c||'low').toLowerCase();return `<span class="toc-confidence ${esc(x)}">${esc(x.toUpperCase())}</span>`}
  async function loadPlayerIntel(){
    const box=$('#tocPlayerIntel');if(!box)return;if(!selectedPlayerId){box.className='toc-intel-empty';box.textContent='Select a Nexus player to compare BullShooter and PPD/TOC.';return}
    box.className='';box.innerHTML='Loading PPD/TOC intelligence…';
    try{
      const d=await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc`),cmp=d.comparison||{},b=cmp.bullshooter||{},t=cmp.toc||{};
      if(d.toc){
        box.innerHTML=`<div class="toc-linked-head"><div><span class="kicker">LINKED PPD/TOC RECORD</span><b>${esc(d.toc.playerName)}</b><span>${esc(d.toc.vendor||'—')} · ${esc(d.toc.vendorState||'—')}${d.toc.mpid?` · MPID ${esc(d.toc.mpid)}`:''}</span></div>${confidence(cmp.confidence)}</div>
        <div class="toc-compare"><div><span>${esc(b.label||'BullShooter')}</span><strong>${fmt(b.rating,3)}</strong><small>${fmt(b.ppd,3)} PPD · ${fmt(b.mpr,3)} MPR</small></div><div><span>PPD/TOC Best-Known</span><strong>${fmt(t.rating,3)}</strong><small>${fmt(t.ppd,3)} PPD · ${fmt(t.mpr,3)} MPR</small></div></div>
        <div class="toc-reason">${esc(cmp.reason||'')}${cmp.ppdDelta!=null?` · Δ PPD ${fmt(cmp.ppdDelta,3)} · Δ MPR ${fmt(cmp.mprDelta,3)}`:''}</div>
        <div class="toc-linked-meta">${statusBadges(d.toc)}<span>Handicap policy: reference-only in V0.9</span></div>
        <div class="toc-source-links">${extLink(d.toc.ppdSourceUrl,d.toc.ppdSource||'PPD source')} · ${extLink(d.toc.mprSourceUrl,d.toc.mprSource||'MPR source')}</div>
        <button id="tocUnlink" class="mini secondary">Unlink PPD/TOC record</button>`;
        $('#tocUnlink').addEventListener('click',async()=>{try{await api(`/api/players/${encodeURIComponent(selectedPlayerId)}/toc/link`,{method:'DELETE'});toast('PPD/TOC link removed.','ok');await loadPlayerIntel()}catch(e){toast(e.message,'error')}});
      }else{
        const cand=d.candidates||[];
        box.innerHTML=`<div class="toc-linked-head"><div><span class="kicker">NO CONFIRMED LINK</span><b>Candidate matches</b><span>Nexus will not auto-link ambiguous names.</span></div>${confidence(cmp.confidence)}</div>`+(cand.length?`<div class="toc-candidates">${cand.map((x,i)=>`<button class="toc-candidate" data-i="${i}"><b>${esc(x.toc.playerName)}</b><span>${esc(x.toc.vendorState||'—')} · ${esc(x.toc.vendor||'—')}</span><small>Match score ${x.score}/100 · ${esc(x.method)}</small></button>`).join('')}</div>`:'<div class="toc-intel-empty">No strong cached candidates. Search the directory manually.</div>');
        box.querySelectorAll('.toc-candidate').forEach(btn=>btn.addEventListener('click',()=>{selectedToc=cand[Number(btn.dataset.i)].toc;renderSelectedToc()}));
      }
    }catch(e){box.innerHTML=`<div class="toc-intel-empty">${esc(e.message)}</div>`}
  }
  async function refreshAll(){await Promise.all([status(),loadPlayers(),searchDirectory()]);if(selectedPlayerId)await loadPlayerIntel()}
  async function boot(){if(!ensureUi()){setTimeout(boot,400);return}try{await loadPlayers()}catch{}await status();await searchDirectory();setInterval(()=>{if($('#tocIntelPanel'))status()},30000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
