import { average, round } from './ratings.js';

const PARSER_VERSION='0.8.0';
const BASE='https://www.bullshooter.live/search';
const headers={accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0 CamarilloDarts/0.8.0'};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const valid=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;

async function getJson(url){
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(`BullShooter API ${res.status}`);
  return data;
}

async function playerProfile(id){
  const url=`${BASE}/fetch_player.php?player_id=${encodeURIComponent(id)}`;
  const p=await getJson(url);
  if(!p?.success) throw new Error('BullShooter player not found.');
  const x01=num(p.total_x01_15), cricket=num(p.total_crk_15);
  const rawPPD=num(p.ppd_15), rawMPR=num(p.mpr_15);
  return {
    id:String(id),
    name:typeof p.name==='string'?p.name.trim():null,
    ppd:valid(rawPPD,5,100)&&(!Number.isFinite(x01)||x01>0)?round(rawPPD,2):null,
    mpr:valid(rawMPR,.5,9)&&(!Number.isFinite(cricket)||cricket>0)?round(rawMPR,2):null,
    wins:num(p.wins_15??p.wins), losses:num(p.losses_15??p.losses),
    total01:x01, totalCricket:cricket, totalGames:num(p.total_games_15),
    sourceUrl:`https://www.bullshooter.live/profile/?id=${encodeURIComponent(id)}`,
    currentStatsSource:'bullshooter-fetch-player-api',
    currentStatsDiagnostics:{url,ppdField:'ppd_15',mprField:'mpr_15',rawPPD,rawMPR,x01Count:x01,cricketCount:cricket}
  };
}

async function games(id,discipline,limit=50){
  const gameType=discipline==='cricket'?'cricket':'x01';
  const url=`${BASE}/fetch_games.php?player_id=${encodeURIComponent(id)}&game_type=${gameType}&page=1&per_page=${limit}`;
  try{
    const p=await getJson(url);
    if(!p?.success||!Array.isArray(p.games)) return {url,rows:[],available:false};
    const min=discipline==='cricket'?.5:5,max=discipline==='cricket'?9:100;
    const rows=p.games.map(g=>{
      const stat=num(g.stat);
      return {discipline,stat:valid(stat,min,max)?stat:null,result:/^w/i.test(String(g.result||''))?'W':/^l/i.test(String(g.result||''))?'L':null,opponentId:null,opponentName:g.nicename||null,dateText:g.date||null,playedAt:g.date?new Date(g.date).toISOString():null,rawText:[g.result,g.nicename,g.stat,g.date].filter(Boolean).join(' | ')};
    }).filter(r=>Number.isFinite(r.stat));
    return {url,rows,available:true};
  }catch(error){return {url,rows:[],available:false,error:error.message}}
}

const avg=(rows,n)=>{const v=rows.slice(0,n).map(r=>r.stat).filter(Number.isFinite);return v.length?round(average(v),2):null};

export async function importBullshooterProfile(id){
  if(!/^\d+$/.test(String(id))) throw new Error('BullShooter ID must contain digits only.');
  const [profile,x01,cricket]=await Promise.all([playerProfile(id),games(id,'01',50),games(id,'cricket',50)]);
  profile.recent01Games=x01.rows.slice(0,30);
  profile.recentCricketGames=cricket.rows.slice(0,30);
  profile.recent01Count=x01.rows.length;
  profile.recentCricketCount=cricket.rows.length;
  profile.recentGameCount=x01.rows.length+cricket.rows.length;
  profile.last10PPD=avg(x01.rows,10); profile.last20PPD=avg(x01.rows,20); profile.last50PPD=avg(x01.rows,50);
  profile.last10MPR=avg(cricket.rows,10); profile.last20MPR=avg(cricket.rows,20); profile.last50MPR=avg(cricket.rows,50);
  profile.last10PPDSampleSize=Math.min(10,x01.rows.length)||null; profile.last20PPDSampleSize=Math.min(20,x01.rows.length)||null; profile.last50PPDSampleSize=Math.min(50,x01.rows.length)||null;
  profile.last10MPRSampleSize=Math.min(10,cricket.rows.length)||null; profile.last20MPRSampleSize=Math.min(20,cricket.rows.length)||null; profile.last50MPRSampleSize=Math.min(50,cricket.rows.length)||null;
  profile.last30PPD=null; profile.last30MPR=null; profile.last30SampleSize=null;
  profile.recentPerformanceSource='bullshooter-fetch-games-api-fast';
  profile.directGameApiDiagnostics={x01:{url:x01.url,rowCount:x01.rows.length,error:x01.error||null},cricket:{url:cricket.url,rowCount:cricket.rows.length,error:cricket.error||null}};
  profile.rawImportedAt=new Date().toISOString(); profile.parserVersion=PARSER_VERSION;
  if(![profile.ppd,profile.mpr,profile.last10PPD,profile.last10MPR].some(Number.isFinite)) throw new Error('BullShooter returned no usable statistics.');
  return profile;
}
