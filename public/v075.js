(() => {
  const API_HEADERS = {'content-type':'application/json'};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmt = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? '—' : Number(v).toFixed(2);
  let syncAllRunning = false;
  let failedIds = [];
  let patchTimer = null;

  async function getPlayers(){
    const r = await fetch('/api/players', {headers: API_HEADERS});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Could not load players');
    return data;
  }

  async function syncOne(id){
    const r = await fetch(`/api/players/${encodeURIComponent(id)}/sync`, {method:'POST',headers:API_HEADERS});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Sync failed');
    return data;
  }

  function ensureUi(){
    const quick = document.querySelector('#quickAdd');
    if(quick && !document.querySelector('#syncAllPlayers')){
      const btn = document.createElement('button');
      btn.id = 'syncAllPlayers';
      btn.className = 'secondary';
      btn.textContent = '↻ Sync All Players';
      btn.addEventListener('click', () => runSyncAll());
      quick.parentNode.insertBefore(btn, quick);
    }

    const head = document.querySelector('#players .section-head');
    if(head && !document.querySelector('#bulkSyncPanel')){
      const panel = document.createElement('div');
      panel.id = 'bulkSyncPanel';
      panel.className = 'card bulk-sync-panel';
      panel.innerHTML = `
        <div class="bulk-sync-main">
          <div><span class="kicker">BULLSHOOTER BULK SYNC</span><strong id="bulkSyncTitle">Ready</strong><span id="bulkSyncDetail">Sequential sync protects BullShooter and preserves Camarillo identity/contact data.</span></div>
          <div class="bulk-sync-actions"><button id="retryFailedSync" class="mini secondary" disabled>Retry Failed</button></div>
        </div>
        <div class="bulk-progress"><div id="bulkProgressBar"></div></div>
        <div id="bulkSyncLog" class="bulk-sync-log"></div>`;
      head.insertAdjacentElement('afterend', panel);
      document.querySelector('#retryFailedSync').addEventListener('click', () => runSyncAll(failedIds));
    }
  }

  function updateBulkUi(done,total,success,failed,current=''){
    ensureUi();
    const pct = total ? Math.round(done/total*100) : 0;
    const title = document.querySelector('#bulkSyncTitle');
    const detail = document.querySelector('#bulkSyncDetail');
    const bar = document.querySelector('#bulkProgressBar');
    if(title) title.textContent = syncAllRunning ? `${done} / ${total}` : `Complete · ${success} synced${failed ? ` · ${failed} failed` : ''}`;
    if(detail) detail.textContent = syncAllRunning ? `Syncing ${current || 'player'}… ${success} successful · ${failed} failed` : (failed ? 'Use Retry Failed to rerun only unsuccessful profiles.' : 'All selected BullShooter profiles synced successfully.');
    if(bar) bar.style.width = `${pct}%`;
    const retry = document.querySelector('#retryFailedSync');
    if(retry) retry.disabled = syncAllRunning || !failedIds.length;
    const all = document.querySelector('#syncAllPlayers');
    if(all){ all.disabled = syncAllRunning; all.textContent = syncAllRunning ? `Syncing ${done}/${total}…` : '↻ Sync All Players'; }
  }

  function logLine(text, type=''){
    const log = document.querySelector('#bulkSyncLog');
    if(!log) return;
    const div = document.createElement('div');
    div.className = type;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  async function runSyncAll(onlyIds=null){
    if(syncAllRunning) return;
    syncAllRunning = true;
    failedIds = [];
    ensureUi();
    const log = document.querySelector('#bulkSyncLog');
    if(log) log.innerHTML = '';
    try{
      const players = await getPlayers();
      const allow = onlyIds ? new Set(onlyIds) : null;
      const targets = players.filter(p => p.bullshooter?.id && (!allow || allow.has(p.id)));
      if(!targets.length){
        logLine('No players with BullShooter IDs to sync.');
        syncAllRunning = false;
        updateBulkUi(0,0,0,0);
        return;
      }
      let success = 0, failed = 0;
      updateBulkUi(0,targets.length,success,failed,targets[0]?.name);
      for(let i=0;i<targets.length;i++){
        const p = targets[i];
        updateBulkUi(i,targets.length,success,failed,p.name);
        try{
          const result = await syncOne(p.id);
          success++;
          const b = result.bullshooter || {};
          logLine(`✓ ${result.name}: ${fmt(b.ppd)} PPD / ${fmt(b.mpr)} MPR · recent 01 ${b.recent01Count ?? 0}, Cricket ${b.recentCricketCount ?? 0}`, 'ok');
        }catch(e){
          failed++;
          failedIds.push(p.id);
          logLine(`✕ ${p.name}: ${e.message}`, 'error');
        }
        updateBulkUi(i+1,targets.length,success,failed,p.name);
        if(i < targets.length-1) await sleep(1400);
      }
      syncAllRunning = false;
      updateBulkUi(targets.length,targets.length,success,failed);
      await patchNullDisplays();
    }catch(e){
      syncAllRunning = false;
      logLine(`Bulk sync stopped: ${e.message}`, 'error');
      updateBulkUi(0,0,0,failedIds.length);
    }
  }

  async function patchNullDisplays(){
    try{
      const players = await getPlayers();
      const rows = [...document.querySelectorAll('#playerRows tr')];
      if(!rows.length || rows.length !== players.length) return;
      rows.forEach((row,idx) => {
        const p = players[idx], b = p?.bullshooter || {}, cells = row.querySelectorAll('td');
        if(cells.length < 10) return;
        cells[4].textContent = `${fmt(b.ppd)} / ${fmt(b.mpr)}`;
        cells[5].innerHTML = `${fmt(b.last30PPD)} / ${fmt(b.last30MPR)}<span class="sub">01 ${b.recent01Count ?? 0} · Cricket ${b.recentCricketCount ?? 0}</span>`;
        cells[6].innerHTML = `${fmt(b.last10PPD)} / ${fmt(b.last10MPR)}<span class="sub">from available recent games</span>`;
      });
    }catch{}
  }

  async function enhanceDiagnostics(){
    const sel = document.querySelector('#bsPlayer');
    const diag = document.querySelector('#bsDiagnostics');
    if(!sel || !diag) return;
    try{
      const players = await getPlayers();
      const p = players.find(x => x.id === sel.value);
      if(!p?.bullshooter?.id) return;
      let box = document.querySelector('#v075Diagnostics');
      if(!box){
        box = document.createElement('div');
        box.id = 'v075Diagnostics';
        box.className = 'info-box';
        diag.insertAdjacentElement('afterend', box);
      }
      const b=p.bullshooter;
      box.innerHTML = `<b>Parser diagnostics</b><br>Recent 01 games: ${b.recent01Count ?? 0} · Recent Cricket games: ${b.recentCricketCount ?? 0}<br>Parser: ${b.parserVersion || '—'} · Last synced: ${b.syncedAt ? new Date(b.syncedAt).toLocaleString() : 'Not synced'}`;
    }catch{}
  }

  function schedulePatch(){
    clearTimeout(patchTimer);
    patchTimer = setTimeout(async()=>{ await patchNullDisplays(); await enhanceDiagnostics(); }, 250);
  }

  function boot(){
    ensureUi();
    schedulePatch();
    const rows = document.querySelector('#playerRows');
    if(rows) new MutationObserver(schedulePatch).observe(rows,{childList:true,subtree:true});
    const diag = document.querySelector('#bsDiagnostics');
    if(diag) new MutationObserver(()=>setTimeout(enhanceDiagnostics,150)).observe(diag,{childList:true,subtree:true,characterData:true});
    const sel = document.querySelector('#bsPlayer');
    if(sel) sel.addEventListener('change', enhanceDiagnostics);
    setTimeout(schedulePatch,1200);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
