(() => {
  const API_HEADERS = {'content-type':'application/json'};
  const n = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const fmtStat = v => Number.isFinite(n(v)) ? n(v).toFixed(2) : '—';
  const fmtRating = v => Number.isFinite(n(v)) ? n(v).toFixed(1) : '—';

  function combinedRating(ppd,mpr){
    const p=n(ppd), m=n(mpr);
    const pn=Number.isFinite(p)?Math.max(0,Math.min(100,((p-10)/25)*100)):null;
    const mn=Number.isFinite(m)?Math.max(0,Math.min(100,((m-1)/3.5)*100)):null;
    if(pn===null&&mn===null)return null;
    if(pn===null)return Math.round(mn*10)/10;
    if(mn===null)return Math.round(pn*10)/10;
    return Math.round(((pn+mn)/2)*10)/10;
  }

  function initialEstablished(current,last30,last10){
    const c=n(current), r30=n(last30), r10=n(last10);
    let base=null;
    if(Number.isFinite(c)&&Number.isFinite(r30)) base=.4*c+.6*r30;
    else if(Number.isFinite(r30)) base=r30;
    else if(Number.isFinite(c)) base=c;
    else if(Number.isFinite(r10)) base=r10;
    if(!Number.isFinite(base)) return null;
    if(Number.isFinite(r10)&&r10>base) base=.8*base+.2*r10;
    return Math.round(base*100)/100;
  }

  function blendCamarillo(external,rolling30,last10,games){
    const ext=n(external), cd30=n(rolling30), cd10=n(last10), count=Number(games)||0;
    if(!Number.isFinite(cd30)||count<=0) return Number.isFinite(ext)?Math.round(ext*100)/100:null;
    let ew=0;
    if(count<10) ew=.75; else if(count<20) ew=.5; else if(count<30) ew=.25;
    let base=Number.isFinite(ext)?ew*ext+(1-ew)*cd30:cd30;
    if(count>=30) base=cd30;
    if(Number.isFinite(cd10)&&cd10>base) base=.85*base+.15*cd10;
    return Math.round(base*100)/100;
  }

  function ratingsFor(player){
    const b=player?.bullshooter||{}, c=player?.camarillo||{};
    const bsPPD=Number.isFinite(n(b.ppd))?n(b.ppd):null;
    const bsMPR=Number.isFinite(n(b.mpr))?n(b.mpr):null;
    const establishedPPD=initialEstablished(b.ppd,b.last30PPD,b.last10PPD);
    const establishedMPR=initialEstablished(b.mpr,b.last30MPR,b.last10MPR);
    const cdPPD=blendCamarillo(establishedPPD,c.last30PPD,c.last10PPD,c.games01||0);
    const cdMPR=blendCamarillo(establishedMPR,c.last30MPR,c.last10MPR,c.gamesCricket||0);
    return {
      bsPPD, bsMPR, bsRating:combinedRating(bsPPD,bsMPR),
      cdPPD, cdMPR, cdRating:combinedRating(cdPPD,cdMPR)
    };
  }

  async function getPlayers(){
    const r=await fetch('/api/players',{headers:API_HEADERS});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Could not load players');
    return data;
  }

  function setHeader(){
    const body=document.querySelector('#playerRows');
    const table=body?.closest('table');
    const head=table?.querySelector('thead tr');
    if(!head) return;
    const ths=[...head.querySelectorAll('th')];
    if(ths.length>=11) ths[9].textContent='BS / CD RATING';
  }

  function ratingMarkup(r){
    return `<div class="dual-rating">
      <div class="rating-block"><div class="rating-top"><span class="rating-label">BS</span><strong class="rating-value">${fmtRating(r.bsRating)}</strong></div><span class="rating-detail">${fmtStat(r.bsPPD)} PPD · ${fmtStat(r.bsMPR)} MPR</span></div>
      <div class="rating-block"><div class="rating-top"><span class="rating-label">CD</span><strong class="rating-value">${fmtRating(r.cdRating)}</strong></div><span class="rating-detail">${fmtStat(r.cdPPD)} PPD · ${fmtStat(r.cdMPR)} MPR</span></div>
    </div>`;
  }

  async function patchRatings(){
    try{
      setHeader();
      const players=await getPlayers();
      const rows=[...document.querySelectorAll('#playerRows tr')];
      if(!rows.length||rows.length!==players.length) return;
      rows.forEach((row,idx)=>{
        const cells=[...row.querySelectorAll('td')];
        if(cells.length<11) return;
        cells[9].innerHTML=ratingMarkup(ratingsFor(players[idx]));
      });
    }catch{}
  }

  let timer=null;
  function schedule(){clearTimeout(timer);timer=setTimeout(patchRatings,180);}
  function boot(){
    schedule();
    const rows=document.querySelector('#playerRows');
    if(rows)new MutationObserver(schedule).observe(rows,{childList:true,subtree:true});
    setTimeout(schedule,900);
    setTimeout(schedule,1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();