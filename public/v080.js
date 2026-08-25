(()=>{
 const H={'content-type':'application/json'}; let running=false,failed=[];
 const fmt=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(2);
 async function players(){const r=await fetch('/api/players',{headers:H});if(!r.ok)throw Error('Could not load players');return r.json()}
 async function sync(p){const r=await fetch(`/api/players/${encodeURIComponent(p.id)}/sync`,{method:'POST',headers:H});const d=await r.json();if(!r.ok)throw Error(d.error||'Sync failed');return d}
 function ui(){return{btn:document.querySelector('#syncAllPlayers'),title:document.querySelector('#bulkSyncTitle'),detail:document.querySelector('#bulkSyncDetail'),bar:document.querySelector('#bulkProgressBar'),log:document.querySelector('#bulkSyncLog'),retry:document.querySelector('#retryFailedSync')}}
 function line(t,c=''){const {log}=ui();if(!log)return;const d=document.createElement('div');d.className=c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight}
 function status(done,total,ok,bad,current=''){const u=ui(),pct=total?Math.round(done/total*100):0;if(u.title)u.title.textContent=running?`${done} / ${total}`:`Complete · ${ok} synced${bad?` · ${bad} failed`:''}`;if(u.detail)u.detail.textContent=running?`Fast API sync · ${current||''} · ${ok} successful · ${bad} failed`:(bad?'Use Retry Failed for unsuccessful profiles.':'All profiles synced. Backup snapshot created.');if(u.bar)u.bar.style.width=`${pct}%`;if(u.btn){u.btn.disabled=running;u.btn.textContent=running?`Syncing ${done}/${total}…`:'↻ Sync All Players'};if(u.retry)u.retry.disabled=running||!failed.length}
 async function backup(reason){try{await fetch('/api/system/backup',{method:'POST',headers:H,body:JSON.stringify({reason})})}catch{}}
 async function run(only=null){if(running)return;running=true;failed=[];const u=ui();if(u.log)u.log.innerHTML='';try{const all=await players(),allow=only?new Set(only):null,targets=all.filter(p=>p.bullshooter?.id&&(!allow||allow.has(p.id)));let next=0,done=0,ok=0,bad=0;status(0,targets.length,0,0,'Starting');const worker=async()=>{while(true){const i=next++;if(i>=targets.length)return;const p=targets[i];status(done,targets.length,ok,bad,p.name);try{const r=await sync(p),b=r.bullshooter||{};ok++;line(`✓ ${r.name}: Current ${fmt(b.ppd)}/${fmt(b.mpr)} · 50 ${fmt(b.last50PPD)}/${fmt(b.last50MPR)} · 20 ${fmt(b.last20PPD)}/${fmt(b.last20MPR)} · 10 ${fmt(b.last10PPD)}/${fmt(b.last10MPR)}`,'ok')}catch(e){bad++;failed.push(p.id);line(`✕ ${p.name}: ${e.message}`,'error')}done++;status(done,targets.length,ok,bad,p.name)}};await Promise.all(Array.from({length:Math.min(3,targets.length)},worker));await backup('bulk-sync-complete');running=false;status(done,targets.length,ok,bad);setTimeout(()=>location.reload(),1400)}catch(e){running=false;line(`Bulk sync stopped: ${e.message}`,'error');status(0,0,0,failed.length)}}
 function brand(){
   document.title=document.title.replace(/Camarillo Darts(?! Nexus)/g,'Camarillo Darts Nexus');
   const scope=document.querySelector('aside')||document.querySelector('nav');
   if(!scope)return;
   const nodes=[...scope.querySelectorAll('*')];
   const cd=nodes.find(x=>x.children.length===0&&x.textContent.trim()==='CD');
   const title=nodes.find(x=>x.children.length===0&&x.textContent.trim()==='Camarillo Darts');
   let host=cd?.parentElement||title?.parentElement;
   if(cd&&title){while(host&&host!==scope&&!host.contains(title))host=host.parentElement}
   if(!host||host===scope)return;
   host.className='camarillo-nexus-brand';
   host.innerHTML='<div class="camarillo-nexus-logo-wrap"><img src="/camarillo-logo.png" alt="Camarillo Darts Nexus" class="camarillo-nexus-logo"></div><div class="camarillo-nexus-copy"><div class="camarillo-nexus-title">Camarillo Darts Nexus</div><div class="camarillo-nexus-subtitle">Competition Intelligence</div></div>';
 }
 function renamePlatform(){
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   const changes=[];while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement?.closest('.camarillo-nexus-brand'))continue;if(/Camarillo Darts(?! Nexus)/.test(n.nodeValue||''))changes.push(n)}
   changes.forEach(n=>{n.nodeValue=n.nodeValue.replace(/Camarillo Darts(?! Nexus)/g,'Camarillo Darts Nexus')});
 }
 function boot(){brand();renamePlatform();setTimeout(()=>{brand();renamePlatform();const b=document.querySelector('#syncAllPlayers');if(b){const n=b.cloneNode(true);b.replaceWith(n);n.addEventListener('click',()=>run())}const r=document.querySelector('#retryFailedSync');if(r){const n=r.cloneNode(true);r.replaceWith(n);n.addEventListener('click',()=>run(failed))}},300)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
