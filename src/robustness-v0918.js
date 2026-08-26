const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const nonneg=v=>Math.max(0,Number(v)||0);
const maxKnown=(...values)=>Math.max(0,...values.map(v=>nonneg(v)));

export function bullshooter501Games(b={}){
  return maxKnown(
    b?.currentStatsDiagnostics?.x01Count,
    b?.last50PPDSampleSize,
    b?.last20PPDSampleSize,
    b?.last10PPDSampleSize,
    b?.recent01Count
  );
}

export function bullshooterCricketGames(b={}){
  return maxKnown(
    b?.currentStatsDiagnostics?.cricketCount,
    b?.last50MPRSampleSize,
    b?.last20MPRSampleSize,
    b?.last10MPRSampleSize,
    b?.recentCricketCount
  );
}

// Backward-compatible aggregate evidence helper for older regression contracts.
export function bullshooterEvidenceGames(b={}){return bullshooter501Games(b)+bullshooterCricketGames(b)}

export function robustnessLabel(score){
  if(score>=85)return'Verified';
  if(score>=70)return'Strong';
  if(score>=50)return'Solid';
  if(score>=25)return'Developing';
  return'Thin';
}

export function scorePlayerRobustness(player,{tocLink=null}={}){
  const b=player?.bullshooter||{},e=player?.edc||{},c=player?.camarillo||{};
  const bs501Games=bullshooter501Games(b),bsCricketGames=bullshooterCricketGames(b);
  const edcGames=e?.confirmed===true?nonneg(e.games):0;

  // Fixed V0.9.18 robustness formula (maximum 100):
  // EDC: up to 30 points at 80 games; PPD/TOC verified link: 30 points;
  // BullShooter 501: up to 20 points at 50 games; BullShooter Cricket: up to 20 points at 50 games.
  const edcPoints=30*clamp(edcGames/80,0,1);
  const tocPoints=tocLink&&tocLink.confirmed!==false?30:0;
  const bs501Points=20*clamp(bs501Games/50,0,1);
  const bsCricketPoints=20*clamp(bsCricketGames/50,0,1);
  const score=Math.round(clamp(edcPoints+tocPoints+bs501Points+bsCricketPoints,0,100));
  const label=robustnessLabel(score);
  const cdGames=nonneg(c.games01)+nonneg(c.gamesCricket);
  const flags={
    bs:Boolean(bs501Games>0||bsCricketGames>0),
    toc:Boolean(tocPoints>0),
    edc:Boolean(e?.confirmed===true),
    cd:Boolean(cdGames>0||c.last30PPD!=null||c.last30MPR!=null)
  };

  return{
    score,label,
    sources:Object.values(flags).filter(Boolean).length,
    flags,
    components:{
      edc:Math.round(edcPoints*10)/10,
      toc:tocPoints,
      bullshooter501:Math.round(bs501Points*10)/10,
      bullshooterCricket:Math.round(bsCricketPoints*10)/10
    },
    evidence:{edcGames,bs501Games,bsCricketGames}
  };
}

export function robustnessIndex(players,{links=[]}={}){
  const linkByPlayer=new Map((links||[]).map(l=>[String(l.playerId??l.player_id??''),l]));
  const byBullshooterId={},byPlayerId={};
  for(const p of players||[]){
    const link=linkByPlayer.get(String(p?.id))||null;
    const r=scorePlayerRobustness(p,{tocLink:link});
    const entry={
      playerId:String(p?.id||''),
      bullshooterId:String(p?.bullshooter?.id||p?.bullshooterId||''),
      name:p?.name||'',
      ...r
    };
    if(entry.playerId)byPlayerId[entry.playerId]=entry;
    if(entry.bullshooterId)byBullshooterId[entry.bullshooterId]=entry;
  }
  return{generatedAt:new Date().toISOString(),formulaVersion:'0.9.18',byBullshooterId,byPlayerId,count:Object.keys(byPlayerId).length};
}
