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
const median=values=>{
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;
  const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;
};
export function tocIndependence(toc={}){
  const provenance=`${toc?.ppdSource||toc?.ppd_source||''} ${toc?.mprSource||toc?.mpr_source||''}`.toLowerCase();
  return /(bull[ -]?shooter|bullshooter\.live|arachnid)/i.test(provenance)?.35:1;
}

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

  const sourceRows=[];
  const bsRating=combinedRating(bsPPD,bsMPR);
  const bsBase=bsRating===null?0:gameWeight(x01,50,20)+gameWeight(cricket,50,20);
  if(bsRating!==null&&bsBase>0)sourceRows.push({key:'bullshooter',ppd:bsPPD,mpr:bsMPR,rating:bsRating,baseWeight:bsBase,independence:1});

  const edcRating=edcConfirmed?combinedRating(edcPPD,edcMPR):null;
  const edcBase=edcRating===null?0:(edcGames===null?10:gameWeight(edcGames,80,30));
  if(edcRating!==null&&edcBase>0)sourceRows.push({key:'edc',ppd:edcPPD,mpr:edcMPR,rating:edcRating,baseWeight:edcBase,independence:1});

  const tocRating=tocConfirmed?combinedRating(tocPPD,tocMPR):null;
  const tocIndependent=tocRating===null?0:tocIndependence(toc||{});
  const tocBase=tocRating===null?0:20*tocIndependent;
  if(tocRating!==null&&tocBase>0)sourceRows.push({key:'toc',ppd:tocPPD,mpr:tocMPR,rating:tocRating,baseWeight:tocBase,independence:tocIndependent});

  const cdRating=combinedRating(cdPPD,cdMPR);
  const cdBase=cdRating===null?0:gameWeight(cd01,30,10)+gameWeight(cdCricket,30,10);
  if(cdRating!==null&&cdBase>0)sourceRows.push({key:'camarillo',ppd:cdPPD,mpr:cdMPR,rating:cdRating,baseWeight:cdBase,independence:1});

  const independentRatings=sourceRows.filter(s=>s.independence>=.75).map(s=>s.rating);
  const center=median(independentRatings);
  for(const s of sourceRows){
    const others=sourceRows.filter(o=>o.key!==s.key&&o.independence>=.75);
    let agreement=1;
    if(s.independence>=.75&&others.some(o=>Math.abs(o.rating-s.rating)<=2))agreement=1.25;
    else if(s.independence>=.75&&others.some(o=>Math.abs(o.rating-s.rating)<=5))agreement=1.10;
    let outlier=1;
    if(independentRatings.length>=3&&center!==null){
      const d=Math.abs(s.rating-center);if(d>12)outlier=.60;else if(d>8)outlier=.80;
    }
    s.agreementFactor=agreement;s.outlierFactor=outlier;s.finalWeight=s.baseWeight*agreement*outlier;
  }

  const rating=weightedMean(sourceRows.map(s=>({value:s.rating,weight:s.finalWeight})));
  const nexusPPD=weightedMean(sourceRows.map(s=>({value:s.ppd,weight:s.finalWeight})));
  const nexusMPR=weightedMean(sourceRows.map(s=>({value:s.mpr,weight:s.finalWeight})));
  const byKey=key=>sourceRows.find(s=>s.key===key)||null;
  const keys=['bullshooter','edc','toc','camarillo'];
  const obj=fn=>Object.fromEntries(keys.map(k=>[k,fn(byKey(k))]));
  return {
    rating:round(rating,1),
    ratingScaleMax:150,
    formula:'weighted source consensus; source rating = PPD + 10*MPR',
    formulaVersion:'1.2.0',
    ratingWeights:{bullshooter:40,edc:30,toc:20,camarillo:20},
    nexusPPD:round(nexusPPD,2),nexusMPR:round(nexusMPR,2),
    sourceCount:sourceRows.length,independentSourceCount:independentRatings.length,consensusMedian:round(center,1),
    evidenceWeight:round(sourceRows.reduce((a,s)=>a+s.baseWeight,0),1),
    effectiveWeight:round(sourceRows.reduce((a,s)=>a+s.finalWeight,0),1),
    sourceBaseWeights:obj(s=>s?round(s.baseWeight,1):0),
    sourceWeights:obj(s=>s?round(s.finalWeight,1):0),
    agreementFactors:obj(s=>s?round(s.agreementFactor,2):1),
    outlierFactors:obj(s=>s?round(s.outlierFactor,2):1),
    independenceFactors:obj(s=>s?round(s.independence,2):1),
    sourceRatings:obj(s=>s?round(s.rating,1):null),
    evidence:{bs501Games:x01,bsCricketGames:cricket,edcGames,cd501Games:cd01,cdCricketGames:cdCricket,
      tocPPDSource:toc?.ppdSource||toc?.ppd_source||null,tocMPRSource:toc?.mprSource||toc?.mpr_source||null},
    flags:{bs:!!byKey('bullshooter'),edc:!!byKey('edc'),toc:!!byKey('toc'),cd:!!byKey('camarillo')}
  };
}
