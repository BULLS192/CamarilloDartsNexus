const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=(v,d=1)=>Number.isFinite(v)?Math.round(v*10**d)/10**d:null;

export function establishedMetric(current,last50,last20,last10){
  const parts=[[num(last50),.5],[num(last20),.3],[num(last10),.2]].filter(([v])=>v!==null);
  if(parts.length){
    const den=parts.reduce((s,[,w])=>s+w,0);
    return parts.reduce((s,[v,w])=>s+v*w,0)/den;
  }
  return num(current);
}

export function combinedRating(ppd,mpr){
  const p=num(ppd),m=num(mpr);
  if(p===null||m===null)return null;
  return round(p+10*m,1);
}
export function gameWeight(games,cap,maxPoints){
  const g=Math.max(0,num(games)||0);return clamp(g/cap,0,1)*maxPoints;
}
const weightedMean=parts=>{
  const valid=parts.filter(x=>x&&num(x.value)!==null&&Number(x.weight)>0);
  if(!valid.length)return null;
  const den=valid.reduce((s,x)=>s+Number(x.weight),0);
  return valid.reduce((s,x)=>s+Number(x.value)*Number(x.weight),0)/den;
};

export function computeNexusRating(player,{toc=null,tocConfirmed=false}={}){
  const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};
  const bsPPD=establishedMetric(b.ppd,b.last50PPD,b.last20PPD,b.last10PPD);
  const bsMPR=establishedMetric(b.mpr,b.last50MPR,b.last20MPR,b.last10MPR);
  const x01=num(b?.currentStatsDiagnostics?.x01Count)||0;
  const cricket=num(b?.currentStatsDiagnostics?.cricketCount)||0;
  const edcConfirmed=e.confirmed===true;
  const edcGames=num(e.games);
  const edcPPD=num(e.ppd),edcMPR=num(e.mpr);
  const tocPPD=tocConfirmed?num(toc?.ppd):null,tocMPR=tocConfirmed?num(toc?.mpr):null;
  const cdPPD=num(c.last30PPD),cdMPR=num(c.last30MPR);
  const cd01=num(c.games01)||0,cdCricket=num(c.gamesCricket)||0;

  const weights={
    bsPPD:bsPPD===null?0:gameWeight(x01,50,20),
    bsMPR:bsMPR===null?0:gameWeight(cricket,50,20),
    edcPPD:edcConfirmed&&edcPPD!==null?(edcGames===null?5:gameWeight(edcGames,80,15)):0,
    edcMPR:edcConfirmed&&edcMPR!==null?(edcGames===null?5:gameWeight(edcGames,80,15)):0,
    tocPPD:tocPPD===null?0:10,
    tocMPR:tocMPR===null?0:10,
    cdPPD:cdPPD===null?0:gameWeight(cd01,30,10),
    cdMPR:cdMPR===null?0:gameWeight(cdCricket,30,10)
  };

  const nexusPPD=weightedMean([
    {value:bsPPD,weight:weights.bsPPD},{value:edcPPD,weight:weights.edcPPD},
    {value:tocPPD,weight:weights.tocPPD},{value:cdPPD,weight:weights.cdPPD}
  ]);
  const nexusMPR=weightedMean([
    {value:bsMPR,weight:weights.bsMPR},{value:edcMPR,weight:weights.edcMPR},
    {value:tocMPR,weight:weights.tocMPR},{value:cdMPR,weight:weights.cdMPR}
  ]);
  const sourceWeights={
    bullshooter:weights.bsPPD+weights.bsMPR,
    edc:weights.edcPPD+weights.edcMPR,
    toc:weights.tocPPD+weights.tocMPR,
    camarillo:weights.cdPPD+weights.cdMPR
  };
  return {
    rating:combinedRating(nexusPPD,nexusMPR),
    ratingScaleMax:150,
    formula:'PPD + 10*MPR',
    ratingWeights:{bullshooter:40,edc:30,toc:20,camarillo:20},
    nexusPPD:round(nexusPPD,2),nexusMPR:round(nexusMPR,2),
    evidenceWeight:round(Object.values(sourceWeights).reduce((a,v)=>a+v,0),1),
    sourceWeights:Object.fromEntries(Object.entries(sourceWeights).map(([k,v])=>[k,round(v,1)])),
    sourceRatings:{
      bullshooter:combinedRating(bsPPD,bsMPR),
      edc:edcConfirmed?combinedRating(edcPPD,edcMPR):null,
      toc:tocConfirmed?combinedRating(tocPPD,tocMPR):null,
      camarillo:combinedRating(cdPPD,cdMPR)
    },
    evidence:{bs501Games:x01,bsCricketGames:cricket,edcGames,cd501Games:cd01,cdCricketGames:cdCricket},
    flags:{bs:sourceWeights.bullshooter>0,edc:sourceWeights.edc>0,toc:sourceWeights.toc>0,cd:sourceWeights.camarillo>0}
  };
}
