const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const round=(v,d=2)=>{const n=num(v);if(n===null)return null;const p=10**d;return Math.round(n*p)/p};
const nonneg=v=>Math.max(0,Number(v)||0);
const maxKnown=(...vs)=>Math.max(0,...vs.map(nonneg));

export const NEXUS_RATING_V2_VERSION='0.9.22-v2.1';
export const NEXUS_RATING_V2_SCALE='PPD + 10×MPR';

export function sampleReliability(games,{prior=20,unknown=.35}={}){
  const n=num(games);
  if(n===null||n<=0)return clamp(unknown,0,1);
  return clamp(n/(n+Math.max(1,Number(prior)||20)),0,1);
}

export function freshnessFactor(value,{halfLifeDays=365,floor=.55}={}){
  if(!value)return 1;
  const ts=new Date(value).getTime();
  if(!Number.isFinite(ts))return 1;
  const days=Math.max(0,(Date.now()-ts)/86400000);
  if(days<=30)return 1;
  const f=2**(-(days-30)/Math.max(30,halfLifeDays));
  return clamp(f,floor,1);
}

function recentAdjustment(baseline,medium,short,{cap,impact=.18}={}){
  const base=num(baseline),m=num(medium),s=num(short);if(base===null)return{value:null,formDelta:null};
  const deltas=[];if(m!==null)deltas.push([m-base,.65]);if(s!==null)deltas.push([s-base,.35]);
  if(!deltas.length)return{value:base,formDelta:0};
  const w=deltas.reduce((a,[,x])=>a+x,0),delta=deltas.reduce((a,[v,x])=>a+v*x,0)/w;
  const clipped=clamp(delta,-Math.abs(cap),Math.abs(cap));
  return{value:base+impact*clipped,formDelta:delta};
}

function bsGames(b,discipline){
  if(discipline==='ppd')return maxKnown(b?.currentStatsDiagnostics?.x01Count,b?.last50PPDSampleSize,b?.last20PPDSampleSize,b?.last10PPDSampleSize,b?.recent01Count);
  return maxKnown(b?.currentStatsDiagnostics?.cricketCount,b?.last50MPRSampleSize,b?.last20MPRSampleSize,b?.last10MPRSampleSize,b?.recentCricketCount);
}

export function bullshooterEstimate(b={},discipline='ppd'){
  const isPpd=discipline==='ppd',current=num(b?.[isPpd?'ppd':'mpr']),r50=num(b?.[isPpd?'last50PPD':'last50MPR']),r20=num(b?.[isPpd?'last20PPD':'last20MPR']),r10=num(b?.[isPpd?'last10PPD':'last10MPR']);
  let baseline=null,basis='none';
  if(r50!==null){baseline=current!==null?.85*r50+.15*current:r50;basis=current!==null?'last50+current':'last50'}
  else if(r20!==null){baseline=current!==null?.8*r20+.2*current:r20;basis=current!==null?'last20+current':'last20'}
  else if(current!==null){baseline=current;basis='current'}
  else if(r10!==null){baseline=r10;basis='last10'}
  if(baseline===null)return null;
  const adj=recentAdjustment(baseline,r20,r10,{cap:isPpd?3:.35,impact:.18}),games=bsGames(b,discipline),reliability=sampleReliability(games,{prior:18,unknown:.45}),freshness=freshnessFactor(b?.syncedAt||b?.rawImportedAt),weight=reliability*freshness;
  return{source:'BullShooter',discipline,value:round(adj.value,4),baseline:round(baseline,4),formDelta:round(adj.formDelta,4),games,reliability:round(reliability,4),freshness:round(freshness,4),baseTrust:1,rawWeight:round(weight,5),basis,included:true};
}

function externalEstimate(source,obj={},discipline='ppd'){
  const value=num(obj?.[discipline]);if(value===null)return null;
  const isEdc=source==='EDC',games=isEdc?num(obj?.games):40;
  const reliability=sampleReliability(games,{prior:20,unknown:isEdc?.35:.67});
  const freshness=freshnessFactor(isEdc?(obj?.capturedAt||obj?.updatedAt):(obj?.updatedAt||obj?.lastSeenAt),{halfLifeDays:isEdc?365:540,floor:.6});
  let duplication=1;
  if(source==='TOC'){
    const text=String(obj?.[discipline==='ppd'?'ppdSource':'mprSource']||obj?.vendor||'').toLowerCase();
    if(/bull\s*shooter|bullshooter|arachnid/.test(text))duplication=.45;
  }
  const baseTrust=isEdc?.95:.9,rawWeight=baseTrust*reliability*freshness*duplication;
  return{source,discipline,value:round(value,4),games:games===null?null:games,reliability:round(reliability,4),freshness:round(freshness,4),baseTrust,duplication:round(duplication,3),rawWeight:round(rawWeight,5),basis:isEdc?'confirmed EDC snapshot':'confirmed TOC Best-Known',included:true};
}

export function camarilloEstimate(c={},discipline='ppd'){
  const isPpd=discipline==='ppd',games=nonneg(c?.[isPpd?'games01':'gamesCricket']),r30=num(c?.[isPpd?'last30PPD':'last30MPR']),r10=num(c?.[isPpd?'last10PPD':'last10MPR']);
  if(games<=0||r30===null)return{source:'Camarillo',discipline,value:r30,games,reliability:0,freshness:1,baseTrust:1.05,rawWeight:0,basis:'no sanctioned sample yet',included:false};
  const cap=isPpd?2.5:.3,delta=r10===null?0:clamp(r10-r30,-cap,cap),value=r30+.15*delta,reliability=sampleReliability(games,{prior:20,unknown:0}),weight=1.05*reliability;
  return{source:'Camarillo',discipline,value:round(value,4),baseline:round(r30,4),formDelta:round(r10===null?0:r10-r30,4),games,reliability:round(reliability,4),freshness:1,baseTrust:1.05,rawWeight:round(weight,5),basis:'rolling30 + symmetric recent form',included:true};
}

function weightedMedian(items){
  const rows=items.filter(x=>x&&x.included&&x.rawWeight>0&&num(x.value)!==null).sort((a,b)=>a.value-b.value);if(!rows.length)return null;
  const total=rows.reduce((s,x)=>s+x.rawWeight,0),half=total/2;let seen=0;for(const row of rows){seen+=row.rawWeight;if(seen>=half)return row.value}return rows.at(-1).value;
}

export function robustBlend(items,discipline='ppd'){
  const rows=items.filter(x=>x&&x.included&&x.rawWeight>0&&num(x.value)!==null).map(x=>({...x}));
  if(!rows.length)return{value:null,confidence:0,agreement:0,center:null,uncertainty:null,sources:[]};
  const center=weightedMedian(rows),threshold=discipline==='ppd'?2.25:.225;
  for(const row of rows){const z=Math.abs(row.value-center)/threshold;const outlierFactor=z<=1?1:1/(1+2*(z-1)**2);row.outlierFactor=round(outlierFactor,4);row.adjustedWeight=row.rawWeight*outlierFactor;row.outlier=z>1.75}
  const w=rows.reduce((s,x)=>s+x.adjustedWeight,0),value=w?rows.reduce((s,x)=>s+x.value*x.adjustedWeight,0)/w:center;
  const mad=w?rows.reduce((s,x)=>s+Math.abs(x.value-value)*x.adjustedWeight,0)/w:0;
  const agreement=rows.length===1?.55:clamp(1-(mad/(threshold*1.8)),0,1);
  const rawWeight=rows.reduce((s,x)=>s+x.rawWeight,0),evidence=clamp(rawWeight/2.2,0,1),diversity=[0,.35,.7,.9,1][Math.min(4,rows.length)]||1;
  const quality=rawWeight?rows.reduce((s,x)=>s+x.rawWeight*x.reliability*x.freshness,0)/rawWeight:0;
  const confidence=100*(.45*evidence+.2*diversity+.3*agreement+.05*quality);
  return{value:round(value,3),confidence:round(confidence,1),agreement:round(agreement*100,1),center:round(center,3),uncertainty:round(mad,3),sources:rows.map(x=>({...x,adjustedWeight:round(x.adjustedWeight,5)}))};
}

function legacyRobustness(input={}){
  const b=input.bullshooter||{},e=input.edc||{},c=input.camarillo||{},toc=input.toc||null,bs01=bsGames(b,'ppd'),bsCr=bsGames(b,'mpr'),edcGames=e?.confirmed===true?nonneg(e.games):0,cdGames=nonneg(c.games01)+nonneg(c.gamesCricket);
  const score=Math.round(clamp(30*clamp(edcGames/80,0,1)+(toc?30:0)+20*clamp(bs01/50,0,1)+20*clamp(bsCr/50,0,1),0,100));
  return{score,label:robustnessLabel(score),flags:{bs:bs01>0||bsCr>0,toc:Boolean(toc),edc:e?.confirmed===true,cd:cdGames>0},evidence:{bs501Games:bs01,bsCricketGames:bsCr,edcGames,cdGames}};
}

export function robustnessLabel(score){if(score>=85)return'Verified';if(score>=70)return'Strong';if(score>=50)return'Solid';if(score>=30)return'Developing';return'Thin'}

function formSummary(input={}){
  const b=input.bullshooter||{},c=input.camarillo||{};
  const pieces=[];
  const add=(delta,weight)=>{if(num(delta)!==null&&weight>0)pieces.push([delta,weight])};
  const bp50=num(b.last50PPD),bp10=num(b.last10PPD),bm50=num(b.last50MPR),bm10=num(b.last10MPR);
  if(bp50!==null&&bp10!==null)add(bp10-bp50,.5);if(bm50!==null&&bm10!==null)add(10*(bm10-bm50),.5);
  if(nonneg(c.games01)>0&&num(c.last30PPD)!==null&&num(c.last10PPD)!==null)add(c.last10PPD-c.last30PPD,.5*sampleReliability(c.games01,{unknown:0}));
  if(nonneg(c.gamesCricket)>0&&num(c.last30MPR)!==null&&num(c.last10MPR)!==null)add(10*(c.last10MPR-c.last30MPR),.5*sampleReliability(c.gamesCricket,{unknown:0}));
  if(!pieces.length)return{score:0,label:'Unknown',direction:'—'};
  const w=pieces.reduce((s,[,x])=>s+x,0),score=pieces.reduce((s,[v,x])=>s+v*x,0)/w;
  if(score>=2.5)return{score:round(score,2),label:'Rising fast',direction:'↑↑'};
  if(score>=.8)return{score:round(score,2),label:'Rising',direction:'↑'};
  if(score<=-2.5)return{score:round(score,2),label:'Falling fast',direction:'↓↓'};
  if(score<=-.8)return{score:round(score,2),label:'Falling',direction:'↓'};
  return{score:round(score,2),label:'Steady',direction:'→'};
}

function contributions(ppdBlend,mprBlend,camarilloPpd,camarilloMpr){
  const totals=new Map();for(const blend of [ppdBlend,mprBlend])for(const s of blend.sources||[])totals.set(s.source,(totals.get(s.source)||0)+s.adjustedWeight);
  if(!camarilloPpd?.included&&!camarilloMpr?.included&&!totals.has('Camarillo'))totals.set('Camarillo',0);
  const sum=[...totals.values()].reduce((a,b)=>a+b,0)||1;const out={};for(const [k,v] of totals)out[k]=round(100*v/sum,1);return out;
}

export function nexusRatingV2(input={}){
  const b=input.bullshooter||{},e=input.edc||{},c=input.camarillo||{},toc=input.toc||null;
  const bsP=bullshooterEstimate(b,'ppd'),bsM=bullshooterEstimate(b,'mpr'),edcP=e?.confirmed===true?externalEstimate('EDC',e,'ppd'):null,edcM=e?.confirmed===true?externalEstimate('EDC',e,'mpr'):null,tocP=toc?externalEstimate('TOC',toc,'ppd'):null,tocM=toc?externalEstimate('TOC',toc,'mpr'):null,cdP=camarilloEstimate(c,'ppd'),cdM=camarilloEstimate(c,'mpr');
  const ppd=robustBlend([bsP,edcP,tocP,cdP],'ppd'),mpr=robustBlend([bsM,edcM,tocM,cdM],'mpr');
  const rating=ppd.value!==null&&mpr.value!==null?round(ppd.value+10*mpr.value,1):null;
  let confidence=ppd.value!==null&&mpr.value!==null?(ppd.confidence+mpr.confidence)/2:(ppd.value!==null?ppd.confidence:mpr.value!==null?mpr.confidence:0);
  if(ppd.value===null||mpr.value===null)confidence*=.8;
  confidence=round(confidence,1);
  const combinedUncertainty=Math.sqrt((ppd.uncertainty||0)**2+(10*(mpr.uncertainty||0))**2),half=rating===null?null:round(Math.max(.75,combinedUncertainty+(100-confidence)*.025),1);
  const robustness=legacyRobustness(input),form=formSummary(input),contribution=contributions(ppd,mpr,cdP,cdM);
  return{playerId:String(input.playerId||input.id||''),bullshooterId:String(input.bullshooterId||b.id||''),name:input.name||input.displayName||'',formulaVersion:NEXUS_RATING_V2_VERSION,scale:NEXUS_RATING_V2_SCALE,nexusPPD:ppd.value,nexusMPR:mpr.value,rating,confidence,confidenceLabel:robustnessLabel(confidence),ratingRange:rating===null?null:{low:round(rating-half,1),high:round(rating+half,1),plusMinus:half},form,agreement:{ppd:ppd.agreement,mpr:mpr.agreement},contribution,robustness,disciplines:{ppd,mpr},camarillo:{games01:nonneg(c.games01),gamesCricket:nonneg(c.gamesCricket),active:cdP.included||cdM.included}};
}

export function nexusRatingIndex(inputs=[]){
  const byPlayerId={},byBullshooterId={};for(const input of Array.isArray(inputs)?inputs:[]){const r=nexusRatingV2(input);if(r.playerId)byPlayerId[r.playerId]=r;if(r.bullshooterId)byBullshooterId[r.bullshooterId]=r}
  return{generatedAt:new Date().toISOString(),formulaVersion:NEXUS_RATING_V2_VERSION,scale:NEXUS_RATING_V2_SCALE,count:Object.keys(byPlayerId).length,byPlayerId,byBullshooterId};
}
