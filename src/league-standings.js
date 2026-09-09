const DEFAULT_TIEBREAKERS = ['points', 'leg_diff', 'legs_for', 'wins', 'id'];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function makeRow(teamId) {
  return {
    teamId,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDiff: 0,
  };
}

function compareField(a, b, key) {
  switch (key) {
    case 'points': return b.points - a.points;
    case 'leg_diff': return b.legDiff - a.legDiff;
    case 'legs_for': return b.legsFor - a.legsFor;
    case 'wins': return b.wins - a.wins;
    case 'draws': return b.draws - a.draws;
    case 'played': return a.played - b.played;
    case 'id': return String(a.teamId).localeCompare(String(b.teamId));
    default: return 0;
  }
}

export function calculateLeagueStandings(teamIds, results = [], config = {}) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) throw new Error('teamIds are required');
  if (new Set(teamIds).size !== teamIds.length) throw new Error('teamIds must be unique');

  const {
    pointsWin = 3,
    pointsDraw = 1,
    pointsLoss = 0,
    tiebreakers = DEFAULT_TIEBREAKERS,
  } = config;

  const rows = new Map(teamIds.map((id) => [id, makeRow(id)]));

  for (const result of results) {
    if (result?.status && !['final', 'completed'].includes(result.status)) continue;
    const home = rows.get(result.homeTeamId);
    const away = rows.get(result.awayTeamId);
    if (!home || !away) throw new Error('Result references a team outside this standings table');
    if (home.teamId === away.teamId) throw new Error('A team cannot play itself');

    const homeScore = number(result.homeScore);
    const awayScore = number(result.awayScore);

    home.played += 1;
    away.played += 1;
    home.legsFor += homeScore;
    home.legsAgainst += awayScore;
    away.legsFor += awayScore;
    away.legsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
      home.points += number(pointsWin);
      away.points += number(pointsLoss);
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
      away.points += number(pointsWin);
      home.points += number(pointsLoss);
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += number(pointsDraw);
      away.points += number(pointsDraw);
    }
  }

  const standings = [...rows.values()].map((row) => ({
    ...row,
    legDiff: row.legsFor - row.legsAgainst,
  }));

  standings.sort((a, b) => {
    for (const key of tiebreakers) {
      const comparison = compareField(a, b, key);
      if (comparison !== 0) return comparison;
    }
    return String(a.teamId).localeCompare(String(b.teamId));
  });

  return standings.map((row, index) => ({ rank: index + 1, ...row }));
}

export function standingsToRows(competitionId, seasonId, standings) {
  return standings.map((row) => ({
    competition_id: competitionId,
    season_id: seasonId || null,
    entity_type: 'team',
    team_id: row.teamId,
    rank: row.rank,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    points: row.points,
    legs_for: row.legsFor,
    legs_against: row.legsAgainst,
    tiebreak_data: { leg_diff: row.legDiff },
  }));
}

export const LEAGUE_TIEBREAKERS = Object.freeze([
  'points',
  'leg_diff',
  'legs_for',
  'wins',
  'draws',
  'played',
  'id',
]);
