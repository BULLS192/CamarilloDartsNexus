import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'camarillo-tournament-'));
process.env.TOURNAMENT_DB_PATH=path.join(dir,'tournaments.json');
const T=await import('../src/tournament.js');

const tournament=await T.createTournament({name:'Regression Cup',entrantType:'singles',boardCount:2,entryFee:10});
for(let i=1;i<=5;i++)await T.addEntrant(tournament.id,{playerIds:[`p${i}`],checkedIn:true,seed:i,paid:true,amountPaid:10});

let built=await T.generateBracket(tournament.id);
assert.equal(built.matches.length,7,'5 entrants should build an 8-slot, 7-match bracket');
assert.equal(built.matches.filter(m=>m.status==='bye').length,3,'three first-round byes should auto-advance');
assert.equal(built.matches.filter(m=>m.status==='ready').length,2,'independent ready matches should be exposed immediately');

await T.autoAssignBoards(tournament.id);
let snap=await T.tournamentSnapshot();
let current=snap.tournaments.find(x=>x.id===tournament.id);
const assigned=current.matches.filter(m=>m.status==='ready'&&m.board);
assert.equal(assigned.length,2,'two available boards should be assigned');
assert.equal(new Set(assigned.map(m=>m.board)).size,2,'assigned boards should be unique');

let firstRealMatch=null;
while(true){
  snap=await T.tournamentSnapshot();
  current=snap.tournaments.find(x=>x.id===tournament.id);
  const ready=current.matches.filter(m=>m.status==='ready');
  if(!ready.length)break;
  for(const m of ready){
    if(!firstRealMatch&&m.round===1)firstRealMatch=m.id;
    await T.recordResult(tournament.id,m.id,{scoreA:1,scoreB:0,board:m.board});
  }
}

snap=await T.tournamentSnapshot();
current=snap.tournaments.find(x=>x.id===tournament.id);
const final=[...current.matches].sort((a,b)=>b.round-a.round)[0];
assert.equal(final.status,'complete','final should complete after all ready matches are scored');
assert.ok(final.winnerEntrantId,'champion should exist');
assert.equal(current.status,'complete','tournament should be complete');

const view=await T.directorView(tournament.id);
assert.equal(view.placements[0].place,1,'director view should expose champion');
assert.equal(view.finance.projected,50,'projected pot should use checked-in entrants');

const early=current.matches.find(m=>m.id===firstRealMatch);
assert.ok(early,'test requires a real first-round match');
const oldWinner=early.winnerEntrantId;
await T.recordResult(tournament.id,early.id,{scoreA:0,scoreB:1});

snap=await T.tournamentSnapshot();
current=snap.tournaments.find(x=>x.id===tournament.id);
const corrected=current.matches.find(m=>m.id===early.id);
assert.notEqual(corrected.winnerEntrantId,oldWinner,'correcting result should change the winner');
const downstream=current.matches.filter(m=>m.round>early.round);
assert.ok(downstream.some(m=>m.status!=='complete'),'winner correction should invalidate dependent downstream results');

console.log('V0.8 tournament regression PASS');
