function assertTeams(teamIds) {
  if (!Array.isArray(teamIds)) throw new TypeError('teamIds must be an array');
  const clean = teamIds.filter((id) => id !== null && id !== undefined && id !== '');
  if (new Set(clean).size !== clean.length) throw new Error('teamIds must be unique');
  if (clean.length < 2) throw new Error('At least two teams are required');
  return clean;
}

function rotate(items) {
  const fixed = items[0];
  const rest = items.slice(1);
  rest.unshift(rest.pop());
  return [fixed, ...rest];
}

function firstHalf(teamIds) {
  const teams = assertTeams(teamIds);
  const BYE = Symbol('BYE');
  let ring = teams.length % 2 === 0 ? [...teams] : [...teams, BYE];
  const rounds = [];
  const roundCount = ring.length - 1;

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const matches = [];
    const byes = [];

    for (let i = 0; i < ring.length / 2; i += 1) {
      const left = ring[i];
      const right = ring[ring.length - 1 - i];
      if (left === BYE || right === BYE) {
        byes.push(left === BYE ? right : left);
        continue;
      }

      // Alternating the fixed team's home/away position reduces long runs of
      // consecutive home or away fixtures while preserving the circle method.
      const swap = i === 0 && roundIndex % 2 === 1;
      matches.push({
        homeTeamId: swap ? right : left,
        awayTeamId: swap ? left : right,
      });
    }

    rounds.push({ roundNumber: roundIndex + 1, matches, byes });
    ring = rotate(ring);
  }

  return rounds;
}

export function generateRoundRobin(teamIds, options = {}) {
  const {
    doubleRoundRobin = false,
    startRound = 1,
    mirrorHomeAway = true,
  } = options;

  if (!Number.isInteger(startRound) || startRound < 1) throw new Error('startRound must be a positive integer');

  const first = firstHalf(teamIds).map((round, index) => ({
    ...round,
    roundNumber: startRound + index,
  }));

  if (!doubleRoundRobin) return first;

  const offset = first.length;
  const second = first.map((round, index) => ({
    roundNumber: startRound + offset + index,
    matches: round.matches.map((match) => mirrorHomeAway
      ? { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId }
      : { ...match }),
    byes: [...round.byes],
  }));

  return [...first, ...second];
}

export function validateRoundRobin(teamIds, rounds, options = {}) {
  const teams = assertTeams(teamIds);
  const { doubleRoundRobin = false } = options;
  const expectedPairCount = (teams.length * (teams.length - 1)) / 2;
  const expectedMeetings = doubleRoundRobin ? 2 : 1;
  const pairCounts = new Map();
  const gamesPerTeam = new Map(teams.map((id) => [id, 0]));

  for (const round of rounds) {
    const seenThisRound = new Set();
    for (const match of round.matches || []) {
      const { homeTeamId, awayTeamId } = match;
      if (!gamesPerTeam.has(homeTeamId) || !gamesPerTeam.has(awayTeamId)) {
        return { valid: false, reason: 'Unknown team in schedule' };
      }
      if (homeTeamId === awayTeamId) return { valid: false, reason: 'Team scheduled against itself' };
      if (seenThisRound.has(homeTeamId) || seenThisRound.has(awayTeamId)) {
        return { valid: false, reason: 'Team scheduled more than once in a round' };
      }
      seenThisRound.add(homeTeamId);
      seenThisRound.add(awayTeamId);
      gamesPerTeam.set(homeTeamId, gamesPerTeam.get(homeTeamId) + 1);
      gamesPerTeam.set(awayTeamId, gamesPerTeam.get(awayTeamId) + 1);
      const key = [String(homeTeamId), String(awayTeamId)].sort().join('::');
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  if (pairCounts.size !== expectedPairCount) return { valid: false, reason: 'Not every team pairing is present' };
  if ([...pairCounts.values()].some((count) => count !== expectedMeetings)) {
    return { valid: false, reason: 'Team pairing count is incorrect' };
  }

  const expectedGames = (teams.length - 1) * expectedMeetings;
  if ([...gamesPerTeam.values()].some((count) => count !== expectedGames)) {
    return { valid: false, reason: 'Team game count is incorrect' };
  }

  return { valid: true, pairCounts, gamesPerTeam };
}

export function scheduleSummary(teamIds, rounds) {
  const teams = assertTeams(teamIds);
  const totalMatches = rounds.reduce((sum, round) => sum + (round.matches?.length || 0), 0);
  const byeCount = rounds.reduce((sum, round) => sum + (round.byes?.length || 0), 0);
  return {
    teams: teams.length,
    rounds: rounds.length,
    totalMatches,
    byeCount,
  };
}
