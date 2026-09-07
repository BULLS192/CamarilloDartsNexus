import assert from 'node:assert/strict';
import {
  calculatePrizePool,
  createTournamentState,
  prepareEntrants,
  readyMatchDetails,
  recordTournamentResult,
  undoTournamentResult,
} from '../src/tournament-ops.js';

const players = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, seed: i + 1 }));

{
  const entrants = prepareEntrants({ participants: players(8), teamMode: 'blind', teamSize: 2, rng: () => 0.4 });
  assert.equal(entrants.length, 4);
  assert.ok(entrants.every(t => t.members.length === 2));
  assert.equal(new Set(entrants.flatMap(t => t.members.map(m => m.id))).size, 8);
  assert.throws(() => prepareEntrants({ participants: players(7), teamMode: 'blind', teamSize: 2 }), /divisible by 2/);
}

{
  const pool = calculatePrizePool({ entrantCount: 16, entryFee: 20, expenses: 40, payoutPercentages: [50, 30, 20] });
  assert.equal(pool.gross, 320);
  assert.equal(pool.prizePool, 280);
  assert.deepEqual(pool.amounts, [140, 84, 56]);
  assert.equal(pool.reserve, 0);
  assert.throws(() => calculatePrizePool({ entrantCount: 8, entryFee: 10, payoutPercentages: [60, 50] }), /more than 100/);
}

{
  let state = createTournamentState({
    name: 'Board Queue Test',
    format: 'single',
    participants: players(8),
    boardCount: 2,
    autoAssign: true,
  });
  assert.equal(state.boards.filter(b => b.matchId).length, 2);
  const firstBoard = state.boards.find(b => b.matchId);
  const ready = readyMatchDetails(state).find(x => x.match.id === firstBoard.matchId);
  state = recordTournamentResult(state, ready.match.id, ready.competitorA.id, { scoreA: 2, scoreB: 0 });
  assert.equal(Object.keys(state.results).length, 1);
  assert.equal(state.boards.filter(b => b.matchId).length, 2, 'auto assign should refill the released board');
  state = undoTournamentResult(state, ready.match.id);
  assert.equal(Object.keys(state.results).length, 0);
  assert.equal(state.status, 'active');
}

{
  let state = createTournamentState({
    name: 'Eight Player Double',
    format: 'double',
    participants: players(8),
    boardCount: 4,
    autoAssign: false,
  });
  let guard = 0;
  while (state.status !== 'completed' && guard++ < 100) {
    const ready = readyMatchDetails(state).sort((a, b) => a.match.number - b.match.number);
    assert.ok(ready.length, 'a playable match should exist before completion');
    const next = ready[0];
    const winner = Number(next.competitorA.seed) <= Number(next.competitorB.seed) ? next.competitorA : next.competitorB;
    state = recordTournamentResult(state, next.match.id, winner.id);
  }
  assert.equal(state.status, 'completed');
  assert.equal(state.outcome.champion.seed, 1);
  assert.equal(Object.keys(state.results).length, 14, 'upper-bracket champion should avoid reset');
}

{
  let state = createTournamentState({
    name: 'Reset Final Test',
    format: 'double',
    participants: players(4),
    boardCount: 2,
    autoAssign: false,
  });
  let guard = 0;
  while (!state.results[state.bracket.grandFinal.id] && guard++ < 50) {
    const next = readyMatchDetails(state).sort((a, b) => a.match.number - b.match.number)[0];
    assert.ok(next);
    const winner = next.match.stage === 'final'
      ? next.competitorB
      : (Number(next.competitorA.seed) <= Number(next.competitorB.seed) ? next.competitorA : next.competitorB);
    state = recordTournamentResult(state, next.match.id, winner.id);
  }
  assert.equal(state.status, 'active', 'lower-bracket win in grand final must require reset');
  const reset = readyMatchDetails(state).find(x => x.match.stage === 'reset');
  assert.ok(reset, 'reset should be ready');
  state = recordTournamentResult(state, reset.match.id, reset.competitorA.id);
  assert.equal(state.status, 'completed');
  assert.equal(Object.keys(state.results).length, 7);
  assert.equal(state.outcome.resetPlayed, true);
}

console.log('Tournament operations tests passed.');
