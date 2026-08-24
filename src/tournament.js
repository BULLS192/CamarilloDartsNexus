import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH=process.env.TOURNAMENT_DB_PATH||path.join(path.dirname(process.env.DB_PATH||'data/db.json'),'tournaments.json');
const now=()=>new Date().toISOString();
const uid=p=>`${p}_${crypto.randomUUID()}`;
const clean=v=>String(v??'').trim();
const number=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const base=()=>({version:1,tournaments:[],audit:[]});

async function read(){try{return {...base(),...JSON.parse(await fs.readFile(DB_PATH,'utf8'))}}catch(e){if(e.code==='ENOENT')return base();throw e}}
async function write(db){await fs.mkdir(path.dirname(DB_PATH),{recursive:true});await fs.writeFile(DB_PATH,JSON.stringify(db,null,2));return db}
function audit(db,action,tournamentId,detail={}){db.audit.unshift({id:uid('audit'),at:now(),action,tournamentId,detail});db.audit=db.audit.slice(0,1000)}
function getTournament(db,id){const t=db.tournaments.find(x=>x.id===id);if(!t)throw new Error('Tournament not found');return t}
function nextPow2(n){let p=1;while(p<Math.max(2,n))p*=2;return p}
function seedOrder(size){let a=[1,2];while(a.length<size){const sum=a.length*2+1;a=a.flatMap(x=>[x,sum-x])}return a}
function defaultName(t){return `${t.name||'Tournament'} · ${t.date||'TBD'}`}

export async function tournamentSnapshot(){return read()}

export async function createTournament(input={}){
 const db=await read();
 const t={
  id:uid('tournament'),name:clean(input.name)||'Camarillo Darts Tournament',date:input.date||'',time:input.time||'',venue:clean(input.venue),status:'setup',
  entrantType:input.entrantType==='doubles'?'doubles':'singles',teamMode:input.teamMode||'manual',bracketType:'single-elimination',
  gameFormat:input.gameFormat||'mixed',bestOf:Math.max(1,number(input.bestOf,3)),boardCount:Math.max(1,number(input.boardCount,4)),
  handicap:{mode:input.handicapMode||'camarillo',strength:number(input.handicapStrength,70),freezeAt:'bracket'},
  finance:{entryFee:number(input.entryFee,0),payouts:{first:50,second:30,third:20}},
  entrants:[],matches:[],createdAt:now(),updatedAt:now(),notes:clean(input.notes)
 };
 db.tournaments.unshift(t);audit(db,'tournament.create',t.id,{name:t.name});await write(db);return t;
}

export async function updateTournament(id,patch={}){const db=await read(),t=getTournament(db,id);for(const k of ['name','date','time','venue','status','gameFormat','notes','teamMode'])if(k in patch)t[k]=patch[k];if('bestOf'in patch)t.bestOf=Math.max(1,number(patch.bestOf,t.bestOf));if('boardCount'in patch)t.boardCount=Math.max(1,number(patch.boardCount,t.boardCount));if(patch.handicap)t.handicap={...t.handicap,...patch.handicap,strength:number(patch.handicap.strength,t.handicap.strength)};if(patch.finance)t.finance={...t.finance,...patch.finance,entryFee:number(patch.finance.entryFee,t.finance.entryFee),payouts:{...t.finance.payouts,...patch.finance.payouts}};t.updatedAt=now();audit(db,'tournament.update',id,patch);await write(db);return t}

export async function addEntrant(tournamentId,input={}){const db=await read(),t=getTournament(db,tournamentId);if(t.matches.length)throw new Error('Bracket already exists. Reset bracket before changing entrants.');const ids=[...new Set((input.playerIds||[]).filter(Boolean))];const need=t.entrantType==='doubles'?2:1;if(ids.length!==need)throw new Error(`${t.entrantType==='doubles'?'Doubles teams':'Singles entrants'} require ${need} player${need===1?'':'s'}.`);if(t.entrants.some(e=>e.playerIds.some(id=>ids.includes(id))))throw new Error('A selected player is already entered.');const e={id:uid('entrant'),name:clean(input.name),playerIds:ids,seed:number(input.seed,0),checkedIn:input.checkedIn!==false,paid:!!input.paid,amountPaid:number(input.amountPaid,0),status:'active',createdAt:now()};t.entrants.push(e);t.updatedAt=now();audit(db,'entrant.add',t.id,{entrantId:e.id,playerIds:ids});await write(db);return e}

export async function updateEntrant(tournamentId,entrantId,patch={}){const db=await read(),t=getTournament(db,tournamentId),e=t.entrants.find(x=>x.id===entrantId);if(!e)throw new Error('Entrant not found');for(const k of ['name','checkedIn','paid','status'])if(k in patch)e[k]=patch[k];if('seed'in patch)e.seed=number(patch.seed,e.seed);if('amountPaid'in patch)e.amountPaid=number(patch.amountPaid,e.amountPaid);t.updatedAt=now();audit(db,'entrant.update',t.id,{entrantId,patch});await write(db);return e}
export async function removeEntrant(tournamentId,entrantId){const db=await read(),t=getTournament(db,tournamentId);if(t.matches.length)throw new Error('Bracket already exists. Reset bracket first.');t.entrants=t.entrants.filter(x=>x.id!==entrantId);audit(db,'entrant.remove',t.id,{entrantId});await write(db);return {ok:true}}

export async function randomizeDoubles(tournamentId,playerIds=[]){const db=await read(),t=getTournament(db,tournamentId);if(t.entrantType!=='doubles')throw new Error('Tournament is not set to doubles');if(t.matches.length)throw new Error('Reset bracket before rebuilding teams');const ids=[...new Set(playerIds.filter(Boolean))];if(ids.length<4)throw new Error('Select at least 4 players');if(ids.length%2)throw new Error('Random doubles requires an even number of players');for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}t.entrants=[];for(let i=0;i<ids.length;i+=2)t.entrants.push({id:uid('entrant'),name:'',playerIds:[ids[i],ids[i+1]],seed:0,checkedIn:true,paid:false,amountPaid:0,status:'active',createdAt:now()});t.updatedAt=now();audit(db,'teams.randomize',t.id,{teams:t.entrants.length});await write(db);return t.entrants}

function initialEntrants(t){const active=t.entrants.filter(e=>e.status!=='withdrawn'&&e.checkedIn),seeded=active.filter(e=>number(e.seed,0)>0).sort((a,b)=>a.seed-b.seed),unseeded=active.filter(e=>number(e.seed,0)<=0);for(let i=unseeded.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[unseeded[i],unseeded[j]]=[unseeded[j],unseeded[i]]}return [...seeded,...unseeded]}
function setParticipant(match,slot,entrantId){match[slot==='a'?'entrantAId':'entrantBId']=entrantId||null}
function clearResult(m){m.status='waiting';m.winnerEntrantId=null;m.loserEntrantId=null;m.scoreA=0;m.scoreB=0;m.board=null;m.completedAt=null}
function normalizeReady(t){for(const m of t.matches){if(m.status==='complete'||m.status==='in-progress'||(m.status==='bye'&&m.winnerEntrantId))continue;const a=!!m.entrantAId,b=!!m.entrantBId;if(a&&b)m.status='ready';else if(a||b){const sourcesPending=(m.sourceA&&!t.matches.find(x=>x.id===m.sourceA)?.winnerEntrantId)||(m.sourceB&&!t.matches.find(x=>x.id===m.sourceB)?.winnerEntrantId);m.status=sourcesPending?'waiting':'bye'}else m.status='waiting'}}
function assignWinnerIntoNext(t,m,winnerId){if(!m.nextMatchId)return;const next=t.matches.find(x=>x.id===m.nextMatchId);if(!next)return;setParticipant(next,m.nextSlot,winnerId)}
function autoByes(t){let changed=true;while(changed){changed=false;normalizeReady(t);for(const m of t.matches){if(m.status!=='bye'||m.winnerEntrantId)continue;const winner=m.entrantAId||m.entrantBId;if(!winner)continue;m.winnerEntrantId=winner;m.loserEntrantId=null;m.completedAt=now();assignWinnerIntoNext(t,m,winner);changed=true}}normalizeReady(t)}

export async function generateBracket(tournamentId){const db=await read(),t=getTournament(db,tournamentId);const entrants=initialEntrants(t);if(entrants.length<2)throw new Error('Check in at least two entrants');const size=nextPow2(entrants.length),rounds=Math.log2(size),order=seedOrder(size),bySeed=new Map(entrants.map((e,i)=>[i+1,e.id]));t.matches=[];let previous=[];for(let r=1;r<=rounds;r++){const count=size/(2**r),current=[];for(let i=0;i<count;i++){const m={id:uid('match'),round:r,roundName:r===rounds?'Final':r===rounds-1?'Semifinal':r===rounds-2?'Quarterfinal':`Round ${r}`,matchNo:i+1,entrantAId:null,entrantBId:null,sourceA:null,sourceB:null,nextMatchId:null,nextSlot:null,status:'waiting',board:null,scoreA:0,scoreB:0,winnerEntrantId:null,loserEntrantId:null,startedAt:null,completedAt:null,notes:''};current.push(m)}if(r===1){for(let i=0;i<count;i++){current[i].entrantAId=bySeed.get(order[i*2])||null;current[i].entrantBId=bySeed.get(order[i*2+1])||null}}else{for(let i=0;i<previous.length;i++){const src=previous[i],slot=i%2===0?'a':'b',target=current[Math.floor(i/2)];src.nextMatchId=target.id;src.nextSlot=slot;if(slot==='a')target.sourceA=src.id;else target.sourceB=src.id}}t.matches.push(...current);previous=current}
 t.status='bracket';t.bracketGeneratedAt=now();autoByes(t);audit(db,'bracket.generate',t.id,{entrants:entrants.length,size,rounds});await write(db);return t}

export async function resetBracket(tournamentId){const db=await read(),t=getTournament(db,tournamentId);t.matches=[];t.status='setup';delete t.bracketGeneratedAt;audit(db,'bracket.reset',t.id);await write(db);return t}
function descendants(t,startId){const out=[];let id=startId;while(id){const m=t.matches.find(x=>x.id===id);if(!m)break;out.push(m);id=m.nextMatchId}return out}
function invalidateDownstream(t,m){if(!m.nextMatchId)return;for(const d of descendants(t,m.nextMatchId)){clearResult(d);const pa=d.sourceA&&t.matches.find(x=>x.id===d.sourceA)?.winnerEntrantId,pb=d.sourceB&&t.matches.find(x=>x.id===d.sourceB)?.winnerEntrantId;d.entrantAId=pa||null;d.entrantBId=pb||null}}

export async function startMatch(tournamentId,matchId,board=null){const db=await read(),t=getTournament(db,tournamentId),m=t.matches.find(x=>x.id===matchId);if(!m)throw new Error('Match not found');if(m.status!=='ready'&&m.status!=='in-progress')throw new Error('Match is not ready');m.status='in-progress';m.board=board||m.board;m.startedAt=m.startedAt||now();audit(db,'match.start',t.id,{matchId,board:m.board});await write(db);return m}

export async function recordResult(tournamentId,matchId,input={}){const db=await read(),t=getTournament(db,tournamentId),m=t.matches.find(x=>x.id===matchId);if(!m)throw new Error('Match not found');if(!m.entrantAId||!m.entrantBId)throw new Error('Both entrants must be present');const a=number(input.scoreA),b=number(input.scoreB);if(a===b)throw new Error('Elimination matches cannot end tied');const winner=a>b?m.entrantAId:m.entrantBId,loser=a>b?m.entrantBId:m.entrantAId,was=m.winnerEntrantId;if(was&&was!==winner)invalidateDownstream(t,m);m.scoreA=a;m.scoreB=b;m.winnerEntrantId=winner;m.loserEntrantId=loser;m.status='complete';m.board=input.board??m.board;m.completedAt=now();assignWinnerIntoNext(t,m,winner);autoByes(t);if(!m.nextMatchId)t.status='complete';t.updatedAt=now();audit(db,'match.result',t.id,{matchId,scoreA:a,scoreB:b,winner,edited:!!was});await write(db);return {match:m,tournament:t}}

export async function updateMatch(tournamentId,matchId,patch={}){const db=await read(),t=getTournament(db,tournamentId),m=t.matches.find(x=>x.id===matchId);if(!m)throw new Error('Match not found');for(const k of ['board','notes'])if(k in patch)m[k]=patch[k];audit(db,'match.update',t.id,{matchId,patch});await write(db);return m}

export async function autoAssignBoards(tournamentId){const db=await read(),t=getTournament(db,tournamentId),used=new Set(t.matches.filter(m=>m.status==='in-progress'&&m.board).map(m=>String(m.board))),free=[];for(let i=1;i<=t.boardCount;i++)if(!used.has(String(i)))free.push(String(i));const ready=t.matches.filter(m=>m.status==='ready'&&!m.board).sort((a,b)=>a.round-b.round||a.matchNo-b.matchNo);let assigned=0;for(const m of ready){if(!free.length)break;m.board=free.shift();assigned++}audit(db,'boards.autoassign',t.id,{assigned});await write(db);return t.matches}

export async function clearFinishedBoards(tournamentId){const db=await read(),t=getTournament(db,tournamentId);for(const m of t.matches)if(m.status==='complete'||m.status==='bye')m.board=null;audit(db,'boards.clear',t.id);await write(db);return t.matches}

export async function directorView(tournamentId){const db=await read(),t=getTournament(db,tournamentId),entrants=t.entrants,entrant=id=>entrants.find(x=>x.id===id)||null,ready=t.matches.filter(x=>x.status==='ready'),live=t.matches.filter(x=>x.status==='in-progress'),complete=t.matches.filter(x=>x.status==='complete'),waiting=t.matches.filter(x=>x.status==='waiting'),final=[...t.matches].sort((a,b)=>b.round-a.round)[0]||null;let placements=[];if(final?.status==='complete'){placements.push({place:1,entrant:entrant(final.winnerEntrantId)},{place:2,entrant:entrant(final.loserEntrantId)});const semis=t.matches.filter(x=>x.round===final.round-1&&x.status==='complete');semis.map(x=>entrant(x.loserEntrantId)).filter(Boolean).forEach(e=>placements.push({place:3,entrant:e}))}const collected=entrants.reduce((s,e)=>s+number(e.amountPaid,0),0),projected=number(t.finance.entryFee,0)*entrants.filter(e=>e.checkedIn).length;return {tournament:t,ready,live,complete,waiting,placements,finance:{collected,projected,payouts:{first:projected*t.finance.payouts.first/100,second:projected*t.finance.payouts.second/100,third:projected*t.finance.payouts.third/100}},audit:db.audit.filter(a=>a.tournamentId===t.id).slice(0,100),label:defaultName(t)}}
