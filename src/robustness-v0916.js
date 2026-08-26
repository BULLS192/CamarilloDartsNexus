const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const freshness=date=>{if(!date)return 0;const t=new Date(date).getTime();if(!Number.isFinite(t))return 0;const days=(Date.now()-t)/864e5;if(days<=7)return 1;if(days<=30)return .8;if(days<=90)return .5;if(days<=180)return .25;return 0};
const established=(current,last50,last20,last10)=>{const c=num(current),a=num(last50),b=num(last20),d=num(last10),parts=[[a,.5],[b,.3],[d,.2]].filter(([v])=>v!==null);if(parts.length){const w=parts.reduce((s,[,x])=>s+x,0);return parts.reduce((s,[v,x])=>s+v*x,0)/w}return c};

export function bullshooterEvidenceGames(b={}){
  const diag=Math.max(0,Number(b?.currentStatsDiagnostics?.x01Count||0)+Number(b?.currentStatsDiagnostics?.cricketCount||0));
  if(diag>0)return diag;
  const explicit=Math.max(0,Number(b.totalGames||b.games||0));if(explicit>0)return explicit;
  return Math.max(0,Number(b.last50SampleSize||0),Number(b.last50PPDSampleSize||0),Number(b.last50MPRSampleSize||0),Number(b.last20SampleSize||0),Number(b.last20PPDSampleSize||0),Number(b.last20MPRSampleSize||0),Number(b.last10SampleSize||0),Number(b.last10PPDSampleSize||0),Number(b.last10MPRSampleSize||0),(num(b.ppd)!==null||num(b.mpr)!==null)?1:0);
}

function pair(player,source,toc){const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};if(source==='bs'){const ppd=established(b.ppd,b.last50PPD,b.last20PPD,b.last10PPD),mpr=established(b.mpr,b.last50MPR,b.last20MPR,b.last10MPR);return ppd!==null&&mpr!==null?{ppd,mpr}:null}if(source==='edc'&&e.confirmed===true){const ppd=num(e.ppd),mpr=num(e.mpr);return ppd!==null&&mpr!==null?{ppd,mpr}:null}if(source==='cd'){const ppd=num(c.last30PPD),mpr=num(c.last30MPR);return ppd!==null&&mpr!==null?{ppd,mpr}:null}if(source==='toc'){const ppd=num(toc?.ppd),mpr=num(toc?.mpr);return ppd!==null&&mpr!==null?{ppd,mpr}:null}return null}

export function scorePlayerRobustness(player,{tocLink=null,toc=null}={}){
  const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};
  const bsGames=bullshooterEvidenceGames(b),edcGames=Math.max(0,Number(e.games||0)),cdGames=Math.max(0,Number(c.games01||0)+Number(c.gamesCricket||0));
  const flags={bs:bsGames>0,toc:Boolean(tocLink&&tocLink.confirmed!==false),edc:Boolean(e.confirmed===true&&(num(e.ppd)!==null||num(e.mpr)!==null)),cd:Boolean(cdGames>0||num(c.last30PPD)!==null||num(c.last30MPR)!==null)};
  const sources=Object.values(flags).filter(Boolean).length;
  let sample=0;if(flags.bs)sample+=24*clamp(Math.log1p(bsGames)/Math.log(2001),0,1);if(flags.edc)sample+=8*clamp(Math.log1p(Math.max(1,edcGames))/Math.log(1001),0,1);if(flags.cd)sample+=8*clamp(Math.log1p(Math.max(1,cdGames))/Math.log(101),0,1);sample=clamp(sample,0,40);
  const coverage=clamp(sources*7.5,0,30),pairs=['bs','toc','edc','cd'].map(s=>pair(player,s,toc)).filter(Boolean);let agreement=0;
  if(pairs.length>=2){let total=0,count=0;for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){const dp=Math.abs(pairs[i].ppd-pairs[j].ppd),dm=Math.abs(pairs[i].mpr-pairs[j].mpr);total+=dp<=1.5&&dm<=.15?1:dp<=3&&dm<=.3?.6:.2;count++}agreement=20*(total/count)}
  const fresh=[];if(flags.bs)fresh.push(freshness(b.syncedAt||b.lastSyncedAt||b.updatedAt));if(flags.edc)fresh.push(freshness(e.capturedAt));if(flags.toc)fresh.push(freshness(tocLink?.updatedAt||tocLink?.updated_at||tocLink?.linkedAt||tocLink?.linked_at));const freshnessScore=fresh.length?10*(fresh.reduce((a,v)=>a+v,0)/fresh.length):0;
  const score=Math.round(clamp(sample+coverage+agreement+freshnessScore,0,100)),label=score>=85?'Verified':score>=70?'Strong':score>=50?'Solid':score>=25?'Developing':'Thin';
  return{score,label,sample:Math.round(sample),coverage:Math.round(coverage),agreement:Math.round(agreement),freshness:Math.round(freshnessScore),sources,flags,evidence:{bullshooterGames:bsGames,edcGames,cdGames}};
}

export function robustnessIndex(players,{links=[],tocById=new Map()}={}){const linkByPlayer=new Map((links||[]).map(l=>[String(l.playerId??l.player_id??''),l]));const byBullshooterId={},byPlayerId={};for(const p of players||[]){const link=linkByPlayer.get(String(p?.id))||null,toc=link?tocById.get(String(link.tocId??link.toc_id??''))||null:null,r=scorePlayerRobustness(p,{tocLink:link,toc}),entry={playerId:String(p?.id||''),bullshooterId:String(p?.bullshooter?.id||p?.bullshooterId||''),name:p?.name||'',...r};if(entry.playerId)byPlayerId[entry.playerId]=entry;if(entry.bullshooterId)byBullshooterId[entry.bullshooterId]=entry}return{generatedAt:new Date().toISOString(),byBullshooterId,byPlayerId,count:Object.keys(byPlayerId).length}}
