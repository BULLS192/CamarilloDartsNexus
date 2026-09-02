import assert from 'node:assert/strict';
import {
  generateSingleElimination, generateDoubleElimination, seedOrder,
  availableMatches, recordMatchResult, participantIndex, resolveCompetitor,
} from '../src/tournament-brackets.js';

const players = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, seed: i + 1 }));

assert.deepEqual(seedOrder(8), [1,8,4,5,2,7,3,6]);
assert.deepEqual(seedOrder(16), [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]);

for (let n = 2; n <= 128; n++) {
  const b = generateSingleElimination({ participants: players(n) });
  assert.equal(b.matches.length, n - 1, `single ${n}`);
  assert.equal(b.byeCount, b.bracketSize - n);
}
for (let n = 3; n <= 128; n++) {
  const b = generateDoubleElimination({ participants: players(n) });
  assert.equal(b.matches.length, 2 * n - 1, `double ${n}`);
  assert.equal(b.grandFinal.number, 2 * n - 2, `GF number ${n}`);
  assert.equal(b.resetFinal.number, 2 * n - 1, `reset number ${n}`);
}

const eight = generateDoubleElimination({ participants: players(8) });
assert.deepEqual(eight.matches.map(m => `${m.number}:${m.displaySourceA.label}-${m.displaySourceB.label}`), [
  '1:Seed 1-Seed 8','2:Seed 4-Seed 5','3:Seed 2-Seed 7','4:Seed 3-Seed 6',
  '5:L1-L2','6:L3-L4','7:W1-W2','8:W3-W4','9:W5-L8','10:W6-L7',
  '11:W7-W8','12:W9-W10','13:W12-L11','14:W11-W13','15:W14-L14',
]);

function playUpperAlways(bracket) {
  let results = new Map();
  const pIndex = participantIndex(bracket);
  while (true) {
    const ready = availableMatches(bracket, results).filter(m => m.stage !== 'reset');
    if (!ready.length) break;
    for (const m of ready) {
      const a = resolveCompetitor(m.sourceA, results, pIndex);
      const b = resolveCompetitor(m.sourceB, results, pIndex);
      const winner = Number(a.seed) <= Number(b.seed) ? a : b;
      results = recordMatchResult(bracket, results, m.id, winner.id);
    }
  }
  return results;
}

for (const n of [3,5,8,13,16,24,60,128]) {
  const b = generateDoubleElimination({ participants: players(n) });
  const results = playUpperAlways(b);
  assert.equal(results.size, 2 * n - 2, `minimum games ${n}`);
  assert.equal(availableMatches(b, results).filter(m => m.stage === 'reset').length, 0, `no reset when upper wins ${n}`);
}

{
  const b = generateDoubleElimination({ participants: players(8) });
  let results = new Map();
  const pIndex = participantIndex(b);
  while (!results.has(b.grandFinal.id)) {
    const ready = availableMatches(b, results).filter(m => m.stage !== 'reset');
    for (const m of ready) {
      const a = resolveCompetitor(m.sourceA, results, pIndex);
      const bb = resolveCompetitor(m.sourceB, results, pIndex);
      const winner = m.stage === 'final' ? bb : (Number(a.seed) <= Number(bb.seed) ? a : bb);
      results = recordMatchResult(b, results, m.id, winner.id);
    }
  }
  const reset = availableMatches(b, results).find(m => m.stage === 'reset');
  assert.ok(reset, 'reset final becomes available');
  const a = resolveCompetitor(reset.sourceA, results, pIndex);
  results = recordMatchResult(b, results, reset.id, a.id);
  assert.equal(results.size, 15);
}

console.log('Tournament bracket engine tests passed.');
