import assert from 'node:assert/strict';
import { calculateLeagueStandings, standingsToRows } from '../src/league-standings.js';

const teams = ['A', 'B', 'C', 'D'];
const results = [
  { homeTeamId: 'A', awayTeamId: 'B', homeScore: 7, awayScore: 4, status: 'final' },
  { homeTeamId: 'C', awayTeamId: 'D', homeScore: 5, awayScore: 5, status: 'final' },
  { homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 6, status: 'final' },
  { homeTeamId: 'B', awayTeamId: 'D', homeScore: 6, awayScore: 2, status: 'final' },
  { homeTeamId: 'A', awayTeamId: 'D', homeScore: 8, awayScore: 1, status: 'scheduled' },
];

const standard = calculateLeagueStandings(teams, results);
assert.deepEqual(standard.map((r) => r.teamId), ['C', 'A', 'B', 'D']);
assert.deepEqual(standard.map((r) => r.points), [4, 3, 3, 1]);
assert.equal(standard.find((r) => r.teamId === 'A').played, 2, 'non-final result must be ignored');
assert.equal(standard.find((r) => r.teamId === 'A').legDiff, 0);
assert.equal(standard.find((r) => r.teamId === 'B').legDiff, 1);

const twoPointWin = calculateLeagueStandings(teams, results, { pointsWin: 2, pointsDraw: 1, pointsLoss: 0 });
assert.deepEqual(twoPointWin.map((r) => r.points), [3, 2, 2, 1]);

const legsFirst = calculateLeagueStandings(teams, results, { tiebreakers: ['points', 'legs_for', 'id'] });
assert.deepEqual(legsFirst.filter((r) => r.points === 3).map((r) => r.teamId), ['A', 'B']);

const rows = standingsToRows('competition-1', 'season-1', standard);
assert.equal(rows.length, 4);
assert.equal(rows[0].competition_id, 'competition-1');
assert.equal(rows[0].season_id, 'season-1');
assert.equal(rows[0].entity_type, 'team');
assert.equal(rows[0].tiebreak_data.leg_diff, standard[0].legDiff);

assert.throws(() => calculateLeagueStandings(['A', 'A'], []), /unique/);
assert.throws(() => calculateLeagueStandings(['A', 'B'], [{ homeTeamId: 'A', awayTeamId: 'X', homeScore: 1, awayScore: 0 }]), /outside/);
assert.throws(() => calculateLeagueStandings(['A', 'B'], [{ homeTeamId: 'A', awayTeamId: 'A', homeScore: 1, awayScore: 0 }]), /itself/);

console.log('NEXUS League Standings tests passed.');
