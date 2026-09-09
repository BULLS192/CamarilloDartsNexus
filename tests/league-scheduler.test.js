import assert from 'node:assert/strict';
import { generateRoundRobin, scheduleSummary, validateRoundRobin } from '../src/league-scheduler.js';

for (const size of [3, 4, 5, 6, 8, 13]) {
  const teams = Array.from({ length: size }, (_, i) => `T${i + 1}`);
  const single = generateRoundRobin(teams);
  const validation = validateRoundRobin(teams, single);
  assert.equal(validation.valid, true, `${size}-team single round robin must validate`);
  assert.equal(single.length, size % 2 === 0 ? size - 1 : size);
  assert.equal(scheduleSummary(teams, single).totalMatches, (size * (size - 1)) / 2);

  if (size % 2 === 1) {
    assert.equal(single.every((round) => round.byes.length === 1), true, `${size}-team schedule must have one bye each round`);
    const byeTeams = single.flatMap((round) => round.byes);
    assert.deepEqual([...byeTeams].sort(), [...teams].sort(), `${size}-team schedule must give every team one bye`);
  } else {
    assert.equal(single.every((round) => round.byes.length === 0), true);
  }

  const double = generateRoundRobin(teams, { doubleRoundRobin: true });
  const doubleValidation = validateRoundRobin(teams, double, { doubleRoundRobin: true });
  assert.equal(doubleValidation.valid, true, `${size}-team double round robin must validate`);
  assert.equal(double.length, single.length * 2);
  assert.equal(scheduleSummary(teams, double).totalMatches, size * (size - 1));

  const firstHalf = double.slice(0, single.length);
  const secondHalf = double.slice(single.length);
  for (let r = 0; r < firstHalf.length; r += 1) {
    for (let m = 0; m < firstHalf[r].matches.length; m += 1) {
      assert.equal(secondHalf[r].matches[m].homeTeamId, firstHalf[r].matches[m].awayTeamId);
      assert.equal(secondHalf[r].matches[m].awayTeamId, firstHalf[r].matches[m].homeTeamId);
    }
  }
}

const shifted = generateRoundRobin(['A', 'B', 'C', 'D'], { startRound: 5 });
assert.deepEqual(shifted.map((r) => r.roundNumber), [5, 6, 7]);

assert.throws(() => generateRoundRobin(['A']), /At least two teams/);
assert.throws(() => generateRoundRobin(['A', 'A']), /unique/);
assert.throws(() => generateRoundRobin(['A', 'B'], { startRound: 0 }), /positive integer/);

const invalid = generateRoundRobin(['A', 'B', 'C', 'D']);
invalid[0].matches[0].awayTeamId = invalid[0].matches[0].homeTeamId;
assert.equal(validateRoundRobin(['A', 'B', 'C', 'D'], invalid).valid, false);

console.log('NEXUS League Scheduler tests passed.');
