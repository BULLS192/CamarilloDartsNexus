const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=(v,d=1)=>Number.isFinite(v)?Math.round(v*10**d)/10**d:null;
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

export function combinedRating(ppd,mpr){
  const p=num(ppd),m=num(mpr);
  if(p===null||m===null)return null;
  return round(p+10*m,1);
}
export function gameWeight(games,cap,maxPoints){
  const g=Math.max(0,num(games)||0);return clamp(g/cap,0,1)*maxPoints;
}
export function tocIndependence(toc={}){
  const provenance=`${toc?.ppdSource||toc?.ppd_source||''} ${toc?.mprSource||toc?.mpr_source||''}`.toLowerCase();
  return /(bull[ -]?shooter|bullshooter\.live|arachnid)/i.test(provenance)?.35:1;
}

export function bullshooterWindowRatings(b={}){
  return {
    current:combinedRating(b.ppd,b.mpr),
    bs50:combinedRating(b.last50PPD,b.last50MPR),
    bs20:combinedRating(b.last20PPD,b.last20MPR),
    bs10:combinedRating(b.last10PPD,b.last10MPR)
  };
}

export function bullshooterForm(b={}){
  const windows=[
    {key:'bs50',ppd:num(b.last50PPD),mpr:num(b.last50MPR),weight:.70},
    {key:'bs20',ppd:num(b.last20PPD),mpr:num(b.last20MPR),weight:.20},
    {key:'bs10',ppd:num(b.last10PPD),mpr:num(b.last10MPR),weight:.10}
  ].filter(x=>x.ppd!==null&&x.mpr!==null);
  if(windows.length){
    const den=windows.reduce((s,x)=>s+x.weight,0);
    const ppd=windows.reduce((s,x)=>s+x.ppd*x.weight,0)/den;
    const mpr=windows.reduce((s,x)=>s+x.mpr*x.weight,0)/den;
    return {ppd,mpr,rating:ppd+10*mpr,windows:windows.map(x=>x.key)};
  }
  const ppd=num(b.ppd),mpr=num(b.mpr);
  return ppd!==null&&mpr!==null?{ppd,mpr,rating:ppd+10*mpr,windows:['current']}:null;
}

function bsEvidenceFactor(b={},hasRating=false){
  if(!hasRating)return 0;
  const x01=Math.max(0,num(b?.currentStatsDiagnostics?.x01Count)||0);
  const cricket=Math.max(0,num(b?.currentStatsDiagnostics?.cricketCount)||0);
  const a=clamp(x01/50,0,1),c=clamp(cricket/50,0,1);
  if(a>0&&c>0)return Math.max(.25,Math.sqrt(a*c));
  return .25;
}
function edcEvidenceFactor(games,hasRating=false){
  if(!hasRating)return 0;
  const g=num(games);if(g===null)return .65;
  return Math.max(.40,Math.sqrt(clamp(g/100,0,1)));
}
function cdEvidenceFactor(g01,gCricket,hasRating=false){
  if(!hasRating)return 0;
  const a=clamp((num(g01)||0)/30,0,1),c=clamp((num(gCricket)||0)/30,0,1);
  if(a<=0&&c<=0)return 0;
  return Math.max(.25,Math.sqrt(Math.max(.01,a)*Math.max(.01,c)));
}

export function computeNexusRating(player,{toc=null,tocConfirmed=false}={}){
  const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};
  const bs=bullshooterForm(b),windowRatings=bullshooterWindowRatings(b);
  const x01=num(b?.currentStatsDiagnostics?.x01Count)||0;
  const cricket=num(b?.currentStatsDiagnostics?.cricketCount)||0;
  const edcConfirmed=e.confirmed===true;
  const edcGames=num(e.games),edcPPD=num(e.ppd),edcMPR=num(e.mpr);
  const tocPPD=tocConfirmed?num(toc?.ppd):null,tocMPR=tocConfirmed?num(toc?.mpr):null;
  const cdPPD=num(c.last30PPD),cdMPR=num(c.last30MPR);
  const cd01=num(c.games01)||0,cdCricket=num(c.gamesCricket)||0,cdGames=cd01+cdCricket;

  const sourceRows=[];
  if(bs){
    const reliability=bsEvidenceFactor(b,true);
    sourceRows.push({key:'bullshooter',ppd:bs.ppd,mpr:bs.mpr,rating:bs.rating,priority:40,reliability,baseWeight:40*reliability,independence:1});
  }

  const edcRating=edcConfirmed?combinedRating(edcPPD,edcMPR):null;
  if(edcRating!==null){
    const reliability=edcEvidenceFactor(edcGames,true);
    sourceRows.push({key:'edc',ppd:edcPPD,mpr:edcMPR,rating:edcRating,priority:30,reliability,baseWeight:30*reliability,independence:1});
  }

  const tocRating=tocConfirmed?combinedRating(tocPPD,tocMPR):null;
  if(tocRating!==null){
    const independence=tocIndependence(toc||{}),reliability=.75;
    sourceRows.push({key:'toc',ppd:tocPPD,mpr:tocMPR,rating:tocRating,priority:20,reliability,baseWeight:20*reliability*independence,independence});
  }

  const cdRating=cdGames>0?combinedRating(cdPPD,cdMPR):0;
  if(cdGames>0&&cdRating!==null){
    const reliability=cdEvidenceFactor(cd01,cdCricket,true);
    if(reliability>0)sourceRows.push({key:'camarillo',ppd:cdPPD,mpr:cdMPR,rating:cdRating,priority:50,reliability,baseWeight:50*reliability,independence:1});
  }

  const independentRatings=sourceRows.filter(s=>s.independence>=.75).map(s=>Number(s.rating));
  const center=median(independentRatings);
  for(const s of sourceRows){
    let outlier=1;
    if(independentRatings.length>=3&&center!==null){
      const d=Math.abs(Number(s.rating)-center);
      if(d>12)outlier=.50;else if(d>8)outlier=.75;
    }
    s.agreementFactor=1;s.outlierFactor=outlier;s.finalWeight=s.baseWeight*outlier;
  }

  const rating=weightedMean(sourceRows.map(s=>({value:s.rating,weight:s.finalWeight})));
  const nexusPPD=weightedMean(sourceRows.map(s=>({value:s.ppd,weight:s.finalWeight})));
  const nexusMPR=weightedMean(sourceRows.map(s=>({value:s.mpr,weight:s.finalWeight})));
  const byKey=key=>sourceRows.find(s=>s.key===key)||null;
  const keys=['bullshooter','edc','toc','camarillo'];
  const obj=(fn,missing=null)=>Object.fromEntries(keys.map(k=>[k,byKey(k)?fn(byKey(k)):missing]));
  return {
    rating:round(rating,1),
    ratingScaleMax:150,
    formula:'Nexus v2: BS form anchor (BS50 70%, BS20 20%, BS10 10%) plus evidence-weighted EDC/TOC/Camarillo; source rating = PPD + 10*MPR; robustness is separate',
    formulaVersion:'2.0.0',
    ratingWeights:{bullshooter:40,edc:30,toc:20,camarillo:50},
    nexusPPD:round(nexusPPD,2),nexusMPR:round(nexusMPR,2),
    bullshooterWindowRatings:windowRatings,
    bullshooterFormWindows:bs?.windows||[],
    camarilloRating:cdGames>0&&cdRating!==null?round(cdRating,1):0,
    sourceCount:sourceRows.length,independentSourceCount:independentRatings.length,consensusMedian:round(center,1),
    evidenceWeight:round(sourceRows.reduce((a,s)=>a+s.baseWeight,0),1),
    effectiveWeight:round(sourceRows.reduce((a,s)=>a+s.finalWeight,0),1),
    sourcePriorities:obj(s=>s.priority,0),
    sourceReliability:obj(s=>round(s.reliability,2),0),
    sourceBaseWeights:obj(s=>round(s.baseWeight,1),0),
    sourceWeights:obj(s=>round(s.finalWeight,1),0),
    agreementFactors:obj(()=>1,1),
    outlierFactors:obj(s=>round(s.outlierFactor,2),1),
    independenceFactors:obj(s=>round(s.independence,2),1),
    sourceRatings:{...obj(s=>round(Number(s.rating),1),null),camarillo:byKey('camarillo')?round(Number(byKey('camarillo').rating),1):0},
    evidence:{bs501Games:x01,bsCricketGames:cricket,edcGames,cd501Games:cd01,cdCricketGames:cdCricket,
      tocPPDSource:toc?.ppdSource||toc?.ppd_source||null,tocMPRSource:toc?.mprSource||toc?.mpr_source||null},
    flags:{bs:!!byKey('bullshooter'),edc:!!byKey('edc'),toc:!!byKey('toc'),cd:!!byKey('camarillo')}
  };
}
