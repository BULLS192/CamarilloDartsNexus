import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH=process.env.LEAGUE_DB_PATH||path.join(path.dirname(process.env.DB_PATH||'data/db.json'),'league.json');
const id=p=>`${p}_${crypto.randomUUID()}`;
const now=()=>new Date().toISOString();
const defaults=()=>({version:1,leagues:[],teams:[],registrations:[],fixtures:[],playoffs:[],audit:[]});

async function load(){try{const raw=JSON.parse(await fs.readFile(DB_PATH,'utf8'));return {...defaults(),...raw}}catch(e){if(e.code!=='ENOENT')throw e;return defaults()}}
async function save(db){await fs.mkdir(path.dirname(DB_PATH),{recursive:true});await fs.writeFile(DB_PATH,JSON.stringify(db,null,2));return db}
function clean(v){return String(v??'').trim()}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function audit(db,action,entityId,detail={}){db.audit.unshift({id:id('audit'),at:now(),action,entityId,detail});db.audit=db.audit.slice(0,500)}

export async function leagueSnapshot(){return load()}

export async function createLeague(input={}){
 const db=await load();
 const league={
  id:id('league'),name:clean(input.name)||'New League',season:clean(input.season),status:'draft',startDate:input.startDate||'',endDate:input.endDate||'',
  teamFormat:{type:input.teamType||'team',minPlayers:num(input.minPlayers,2),maxPlayers:num(input.maxPlayers,4),lineupSize:num(input.lineupSize,2)},
  schedule:{rounds:input.rounds==='double'?2:1,matchDay:clean(input.matchDay),defaultTime:input.defaultTime||'',venueMode:input.venueMode||'home-away'},
  scoring:{winPoints:num(input.winPoints,2),drawPoints:num(input.drawPoints,1),lossPoints:num(input.lossPoints,0),tiebreakers:['matchPoints','wins','legDiff','headToHead']},
  handicap:{mode:input.handicapMode||'camarillo',strength:num(input.handicapStrength,70),teamCap:num(input.teamCap,0),freezeAt:input.freezeAt||'match',allowDirectorOverride:true},
  playoffs:{enabled:input.playoffsEnabled!==false,qualifiers:num(input.qualifiers,4),format:input.playoffFormat||'single-elimination',reseed:!!input.reseed},
  registration:{open:input.registrationOpen!==false,mode:input.registrationMode||'team',fee:num(input.fee,0),deadline:input.deadline||''},
  createdAt:now(),updatedAt:now()
 };
 db.leagues.push(league);audit(db,'league.create',league.id,{name:league.name});await save(db);return league;
}

export async function updateLeague(leagueId,patch={}){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');
 for(const k of ['name','season','status','startDate','endDate'])if(k in patch)l[k]=patch[k];
 if(patch.teamFormat)l.teamFormat={...l.teamFormat,...patch.teamFormat};if(patch.schedule)l.schedule={...l.schedule,...patch.schedule};if(patch.scoring)l.scoring={...l.scoring,...patch.scoring};if(patch.handicap)l.handicap={...l.handicap,...patch.handicap};if(patch.playoffs)l.playoffs={...l.playoffs,...patch.playoffs};if(patch.registration)l.registration={...l.registration,...patch.registration};
 l.updatedAt=now();audit(db,'league.update',l.id,patch);await save(db);return l}

export async function createTeam(leagueId,input={}){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');const players=[...new Set((input.playerIds||[]).filter(Boolean))];if(players.length>l.teamFormat.maxPlayers)throw new Error(`Maximum ${l.teamFormat.maxPlayers} players per team`);
 const t={id:id('team'),leagueId,name:clean(input.name)||`Team ${db.teams.filter(x=>x.leagueId===leagueId).length+1}`,captainPlayerId:input.captainPlayerId||players[0]||null,playerIds:players,homeVenue:clean(input.homeVenue),status:'active',createdAt:now()};db.teams.push(t);audit(db,'team.create',t.id,{leagueId,name:t.name});await save(db);return t}
export async function updateTeam(teamId,patch={}){const db=await load();const t=db.teams.find(x=>x.id===teamId);if(!t)throw new Error('Team not found');Object.assign(t,patch,{id:t.id,leagueId:t.leagueId});audit(db,'team.update',t.id,patch);await save(db);return t}

export async function register(leagueId,input={}){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');if(!l.registration.open)throw new Error('Registration is closed');const r={id:id('reg'),leagueId,type:input.type||l.registration.mode,playerId:input.playerId||null,teamId:input.teamId||null,name:clean(input.name),email:clean(input.email),phone:clean(input.phone),status:input.status||'pending',paymentStatus:input.paymentStatus||'unpaid',amount:num(input.amount,l.registration.fee),notes:clean(input.notes),createdAt:now()};db.registrations.push(r);audit(db,'registration.create',r.id,{leagueId});await save(db);return r}
export async function updateRegistration(regId,patch={}){const db=await load();const r=db.registrations.find(x=>x.id===regId);if(!r)throw new Error('Registration not found');Object.assign(r,patch,{id:r.id,leagueId:r.leagueId});audit(db,'registration.update',r.id,patch);await save(db);return r}

function roundRobin(teamIds,legs=1){let ids=[...teamIds];if(ids.length<2)return[];if(ids.length%2)ids.push(null);const n=ids.length,half=n/2,out=[];let ring=[...ids];for(let cycle=0;cycle<legs;cycle++)for(let round=0;round<n-1;round++){
 for(let i=0;i<half;i++){let a=ring[i],b=ring[n-1-i];if(a&&b){const flip=(round+i+cycle)%2===1;out.push({round:cycle*(n-1)+round+1,homeTeamId:flip?b:a,awayTeamId:flip?a:b})}}
 ring=[ring[0],ring[n-1],...ring.slice(1,n-1)];}
 return out}

export async function generateSchedule(leagueId,{replace=false}={}){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');const teams=db.teams.filter(x=>x.leagueId===leagueId&&x.status!=='withdrawn');if(teams.length<2)throw new Error('Add at least two active teams');if(replace)db.fixtures=db.fixtures.filter(x=>x.leagueId!==leagueId||x.status==='complete');else if(db.fixtures.some(x=>x.leagueId===leagueId))throw new Error('Schedule already exists; use replace to regenerate');
 const generated=roundRobin(teams.map(x=>x.id),l.schedule.rounds).map((g,i)=>({id:id('match'),leagueId,stage:'regular',week:g.round,round:g.round,matchNo:i+1,homeTeamId:g.homeTeamId,awayTeamId:g.awayTeamId,date:'',time:l.schedule.defaultTime||'',venue:'',board:'',status:'scheduled',homeScore:0,awayScore:0,winnerTeamId:null,handicapSnapshot:null,notes:'',updatedAt:now()}));db.fixtures.push(...generated);l.status=l.status==='draft'?'scheduled':l.status;audit(db,'schedule.generate',leagueId,{matches:generated.length});await save(db);return generated}

export async function updateFixture(matchId,patch={}){const db=await load();const m=db.fixtures.find(x=>x.id===matchId);if(!m)throw new Error('Match not found');for(const k of ['date','time','venue','board','status','notes','homeScore','awayScore','handicapSnapshot'])if(k in patch)m[k]=patch[k];
 if(patch.status==='complete'||patch.complete){m.status='complete';m.homeScore=num(patch.homeScore,m.homeScore);m.awayScore=num(patch.awayScore,m.awayScore);m.winnerTeamId=m.homeScore===m.awayScore?null:(m.homeScore>m.awayScore?m.homeTeamId:m.awayTeamId)}m.updatedAt=now();audit(db,'match.update',m.id,patch);await save(db);return m}

export async function standings(leagueId){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');const teams=db.teams.filter(x=>x.leagueId===leagueId);const rows=teams.map(t=>({teamId:t.id,name:t.name,played:0,wins:0,draws:0,losses:0,for:0,against:0,diff:0,points:0}));const map=new Map(rows.map(x=>[x.teamId,x]));for(const m of db.fixtures.filter(x=>x.leagueId===leagueId&&x.stage==='regular'&&x.status==='complete')){const h=map.get(m.homeTeamId),a=map.get(m.awayTeamId);if(!h||!a)continue;h.played++;a.played++;h.for+=num(m.homeScore);h.against+=num(m.awayScore);a.for+=num(m.awayScore);a.against+=num(m.homeScore);if(m.homeScore>m.awayScore){h.wins++;a.losses++;h.points+=l.scoring.winPoints;a.points+=l.scoring.lossPoints}else if(m.awayScore>m.homeScore){a.wins++;h.losses++;a.points+=l.scoring.winPoints;h.points+=l.scoring.lossPoints}else{h.draws++;a.draws++;h.points+=l.scoring.drawPoints;a.points+=l.scoring.drawPoints}}
 for(const r of rows)r.diff=r.for-r.against;rows.sort((a,b)=>b.points-a.points||b.wins-a.wins||b.diff-a.diff||b.for-a.for||a.name.localeCompare(b.name));return rows.map((r,i)=>({...r,position:i+1}))}

function bracketSeeds(n){const size=2**Math.ceil(Math.log2(Math.max(2,n)));let seeds=[1,2];while(seeds.length<size){const next=seeds.length*2+1;seeds=seeds.flatMap(s=>[s,next-s])}return seeds}
export async function generatePlayoffs(leagueId,{replace=false}={}){const db=await load();const l=db.leagues.find(x=>x.id===leagueId);if(!l)throw new Error('League not found');const table=await standings(leagueId);const q=Math.min(num(l.playoffs.qualifiers,4),table.length);if(q<2)throw new Error('Not enough teams for playoffs');if(replace)db.fixtures=db.fixtures.filter(x=>x.leagueId!==leagueId||x.stage!=='playoff');else if(db.fixtures.some(x=>x.leagueId===leagueId&&x.stage==='playoff'))throw new Error('Playoff bracket already exists');const selected=table.slice(0,q),seedMap=new Map(selected.map(x=>[x.position,x.teamId])),seeds=bracketSeeds(q),roundName=seeds.length===2?'Final':seeds.length===4?'Semifinal':seeds.length===8?'Quarterfinal':'Round of 16';const created=[];for(let i=0;i<seeds.length;i+=2){const s1=seeds[i],s2=seeds[i+1],a=seedMap.get(s1)||null,b=seedMap.get(s2)||null;if(!a&&!b)continue;created.push({id:id('playoff'),leagueId,stage:'playoff',week:999,round:1,roundName,matchNo:i/2+1,seedA:s1,seedB:s2,homeTeamId:a,awayTeamId:b,date:'',time:'',venue:'',board:'',status:a&&b?'scheduled':'bye',homeScore:0,awayScore:0,winnerTeamId:a&&!b?a:b&&!a?b:null,updatedAt:now()})}db.fixtures.push(...created);l.status='playoffs';audit(db,'playoffs.generate',leagueId,{qualifiers:q,matches:created.length});await save(db);return created}

export async function directorDashboard(leagueId){const db=await load();const table=await standings(leagueId);const fixtures=db.fixtures.filter(x=>x.leagueId===leagueId);return {league:db.leagues.find(x=>x.id===leagueId)||null,teams:db.teams.filter(x=>x.leagueId===leagueId),registrations:db.registrations.filter(x=>x.leagueId===leagueId),standings:table,scheduled:fixtures.filter(x=>x.status==='scheduled'||x.status==='bye'),completed:fixtures.filter(x=>x.status==='complete'),audit:db.audit.filter(x=>x.entityId===leagueId||x.detail?.leagueId===leagueId).slice(0,50)}}
