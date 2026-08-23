export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
export function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
}
const asNumber = v => (v === null || v === undefined || v === '') ? NaN : Number(v);

export function initialEstablished(current, last30, last10) {
  const c=asNumber(current), r30=asNumber(last30), r10=asNumber(last10);
  let base=null;
  if(Number.isFinite(c)&&Number.isFinite(r30)) base=.4*c+.6*r30;
  else if(Number.isFinite(r30)) base=r30;
  else if(Number.isFinite(c)) base=c;
  else if(Number.isFinite(r10)) base=r10;
  if(!Number.isFinite(base)) return null;
  if(Number.isFinite(r10)&&r10>base) base=.8*base+.2*r10;
  return round(base,2);
}

export function blendCamarillo(externalEstablished, cdRolling30, cdLast10, cdGames) {
  const ext=asNumber(externalEstablished), cd30=asNumber(cdRolling30), cd10=asNumber(cdLast10), games=Number(cdGames)||0;
  if(!Number.isFinite(cd30)||games<=0) return Number.isFinite(ext)?round(ext,2):null;
  let ew=0;
  if(games<10) ew=.75; else if(games<20) ew=.5; else if(games<30) ew=.25;
  let base=Number.isFinite(ext)?ew*ext+(1-ew)*cd30:cd30;
  if(games>=30) base=cd30;
  if(Number.isFinite(cd10)&&cd10>base) base=.85*base+.15*cd10;
  return round(base,2);
}

export function computeDisciplineRatings(player) {
  const b=player.bullshooter||{}, c=player.camarillo||{};
  const establishedPPD=initialEstablished(b.ppd,b.last30PPD,b.last10PPD);
  const establishedMPR=initialEstablished(b.mpr,b.last30MPR,b.last10MPR);
  return {
    establishedPPD, establishedMPR,
    handicapPPD: blendCamarillo(establishedPPD,c.last30PPD,c.last10PPD,c.games01||0),
    handicapMPR: blendCamarillo(establishedMPR,c.last30MPR,c.last10MPR,c.gamesCricket||0)
  };
}

export function calculate01Handicap({ base=501,strongPPD,weakPPD,strength=.7,mode='forward',minStart=101,roundTo=1 }) {
  const strong=Number(strongPPD), weak=Number(weakPPD), s=Math.min(1,Math.max(0,Number(strength)));
  if(!(strong>0)||!(weak>0)||strong<=weak||mode==='scratch') return {strongStart:Number(base),weakStart:Number(base),spot:0,mode:'scratch'};
  const r=Math.max(1,Number(roundTo)||1), snap=n=>Math.round(n/r)*r, b=Number(base);
  const forwardWeak=Math.max(minStart,snap(b*((1-s)+s*(weak/strong))));
  const forwardSpot=b-forwardWeak;
  if(mode==='forward') return {strongStart:b,weakStart:forwardWeak,spot:forwardSpot,mode};
  if(mode==='reverse-equivalent') { const ss=snap(b*((1-s)+s*(strong/weak))); return {strongStart:ss,weakStart:b,spot:ss-b,mode}; }
  if(mode==='reverse-lite') return {strongStart:b+forwardSpot,weakStart:b,spot:forwardSpot,mode};
  return {strongStart:b,weakStart:b,spot:0,mode:'scratch'};
}

export function cricketSpotMarks({ strongMPR,weakMPR,strength=.7,step=.2,maxMarks=14 }) {
  const strong=Number(strongMPR), weak=Number(weakMPR);
  if(!(strong>weak)||!(weak>0)) return {marks:0,allocation:[]};
  const full=Math.floor((strong-weak+1e-9)/step), marks=Math.min(maxMarks,Math.max(0,Math.round(full*Math.min(1,Math.max(0,strength)))));
  const targets=['20','19','18','17','16','15','Bull'], alloc=Object.fromEntries(targets.map(t=>[t,0]));
  let remaining=marks;
  while(remaining>0){ for(const t of targets){ if(remaining<=0)break; if(alloc[t]<2){alloc[t]++;remaining--;} } if(Object.values(alloc).every(v=>v>=2))break; }
  return {marks,allocation:targets.filter(t=>alloc[t]).map(t=>({target:t,marks:alloc[t]}))};
}

export function combinedRating(ppd,mpr){
  const p=Number(ppd),m=Number(mpr);
  const pn=Number.isFinite(p)?Math.max(0,Math.min(100,((p-10)/25)*100)):null;
  const mn=Number.isFinite(m)?Math.max(0,Math.min(100,((m-1)/3.5)*100)):null;
  if(pn===null&&mn===null)return null;
  if(pn===null)return round(mn,1); if(mn===null)return round(pn,1);
  return round((pn+mn)/2,1);
}
