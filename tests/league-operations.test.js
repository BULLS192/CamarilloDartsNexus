import assert from 'node:assert/strict';
import { generateRoundRobinPreview } from '../public/league-operations.js';

function pairKey(a,b){ return [a,b].sort().join('::'); }

for (const count of [3,4,5,6,8,13]) {
  const teams = Array.from({length:count},(_,i)=>`T${i+1}`);
  const rounds = generateRoundRobinPreview(teams);
  const pairs = new Map();
  const byeCount = new Map(teams.map((id)=>[id,0]));
  for (const round of rounds) {
    const seen = new Set();
    for (const match of round.matches) {
      assert.notEqual(match.homeTeamId, match.awayTeamId);
      assert.equal(seen.has(match.homeTeamId), false);
      assert.equal(seen.has(match.awayTeamId), false);
      seen.add(match.homeTeamId); seen.add(match.awayTeamId);
      const key = pairKey(match.homeTeamId, match.awayTeamId);
      pairs.set(key,(pairs.get(key)||0)+1);
    }
    for (const team of round.byes) byeCount.set(team,byeCount.get(team)+1);
  }
  assert.equal(pairs.size, count*(count-1)/2);
  assert.equal([...pairs.values()].every((n)=>n===1), true);
  if (count % 2 === 1) assert.equal([...byeCount.values()].every((n)=>n===1), true);

  const double = generateRoundRobinPreview(teams,{doubleRoundRobin:true});
  const doublePairs = new Map();
  for (const round of double) for (const match of round.matches) {
    const key = pairKey(match.homeTeamId,match.awayTeamId);
    doublePairs.set(key,(doublePairs.get(key)||0)+1);
  }
  assert.equal([...doublePairs.values()].every((n)=>n===2), true);
}

assert.throws(()=>generateRoundRobinPreview(['A']),/At least two/);
assert.throws(()=>generateRoundRobinPreview(['A','A']),/unique/);
console.log('NEXUS League Operations tests passed.');
