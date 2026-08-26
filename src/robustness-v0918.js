const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const nonneg=v=>Math.max(0,Number(v)||0);
const maxKnown=(...values)=>Math.max(0,...values.map(v=>nonneg(v)));

function preferredCount(primary,...fallbacks){
  const p=finite(primary);
  if(p!==null&&p>0)return Math.max(0,p);
  return maxKnown(...fallbacks);
}

export function normalizeRobustnessPlayer(record={}){
  const raw=record?.raw_data&&typeof record.raw_data==='object'?record.raw_data:record?.rawData&&typeof record.rawData==='object'?record.rawData:record;
  const bull=raw?.bullshooter&&typeof raw.bullshooter==='object'?raw.bullshooter:record?.bullshooter&&typeof record.bullshooter==='object'?record.bullshooter:record?.bullshooter_data&&typeof record.bullshooter_data==='object'?record.bullshooter_data:{};
  const edc=raw?.edc&&typeof raw.edc==='object'?raw.edc:record?.edc&&typeof record.edc==='object'?record.edc:{};
  const camarillo=raw?.camarillo&&typeof raw.camarillo==='object'?raw.camarillo:record?.camarillo&&typeof record.camarillo==='object'?record.camarillo:{};
  const bsId=String(bull?.id??bull?.playerId??bull?.player_id??record?.bullshooter_id??record?.bullshooterId??'').replace(/^#/,'').trim();
  return{...raw,id:String(raw?.id??record?.player_id??record?.playerId??record?.id??''),name:raw?.name??record?.display_name??record?.name??'',bullshooter:{...bull,...(bsId?{id:bsId}:{})},edc,camarillo};
}

export function playerBullshooterId(record={}){return normalizeRobustnessPlayer(record).bullshooter?.id||''}

export function bullshooter501Games(b={}){
  return preferredCount(b?.currentStatsDiagnostics?.x01Count,b?.last50PPDSampleSize,b?.last20PPDSampleSize,b?.last10PPDSampleSize,b?.recent01Count,Array.isArray(b?.recent01Games)?b.recent01Games.length:0);
}

export function bullshooterCricketGames(b={}){
  return preferredCount(b?.currentStatsDiagnostics?.cricketCount,b?.last50MPRSampleSize,b?.last20MPRSampleSize,b?.last10MPRSampleSize,b?.recentCricketCount,Array.isArray(b?.recentCricketGames)?b.recentCricketGames.length:0);
}

export function bullshooterEvidenceGames(b={}){return bullshooter501Games(b)+bullshooterCricketGames(b)}

export function robustnessLabel(score){if(score>=85)return'Verified';if(score>=70)return'Strong';if(score>=50)return'Solid';if(score>=25)return'Developing';return'Thin'}

export function scorePlayerRobustness(record,{tocLink=null}={}){
  const player=normalizeRobustnessPlayer(record),b=player.bullshooter||{},e=player.edc||{},c=player.camarillo||{};
  const bs501Games=bullshooter501Games(b),bsCricketGames=bullshooterCricketGames(b),edcGames=e?.confirmed===true?nonneg(e.games):0;
  const edcPoints=30*clamp(edcGames/80,0,1),tocPoints=tocLink&&tocLink.confirmed!==false?30:0,bs501Points=20*clamp(bs501Games/50,0,1),bsCricketPoints=20*clamp(bsCricketGames/50,0,1);
  const score=Math.round(clamp(edcPoints+tocPoints+bs501Points+bsCricketPoints,0,100)),cdGames=nonneg(c.games01)+nonneg(c.gamesCricket);
  const flags={bs:Boolean(bs501Games>0||bsCricketGames>0),toc:Boolean(tocPoints>0),edc:Boolean(e?.confirmed===true),cd:Boolean(cdGames>0||c.last30PPD!=null||c.last30MPR!=null)};
  return{score,label:robustnessLabel(score),sources:Object.values(flags).filter(Boolean).length,flags,components:{edc:Math.round(edcPoints*10)/10,toc:tocPoints,bullshooter501:Math.round(bs501Points*10)/10,bullshooterCricket:Math.round(bsCricketPoints*10)/10},evidence:{edcGames,bs501Games,bsCricketGames}};
}

export function robustnessIndex(records,{links=[]}={}){
  const linkByPlayer=new Map((links||[]).map(l=>[String(l.playerId??l.player_id??''),l])),byBullshooterId={},byPlayerId={};
  for(const record of records||[]){
    const p=normalizeRobustnessPlayer(record),playerId=String(p.id||''),bullshooterId=String(p.bullshooter?.id||''),link=linkByPlayer.get(playerId)||null,r=scorePlayerRobustness(p,{tocLink:link});
    const entry={playerId,bullshooterId,name:p.name||'',...r};if(playerId)byPlayerId[playerId]=entry;if(bullshooterId)byBullshooterId[bullshooterId]=entry;
  }
  return{generatedAt:new Date().toISOString(),formulaVersion:'0.9.18',dataContractVersion:'0.9.19',byBullshooterId,byPlayerId,count:Object.keys(byPlayerId).length};
}
