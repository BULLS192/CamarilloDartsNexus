import crypto from 'node:crypto';
import {
  availableMatches,
  generateBracket,
  participantIndex,
  recordMatchResult,
  resolveCompetitor,
  shuffle,
} from './tournament-brackets.js';

const now = () => new Date().toISOString();
const clone = value => structuredClone(value);
const cleanName = value => String(value ?? '').trim();
const asMoney = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

export function makeTournamentId(name = 'tournament') {
  const slug = cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'tournament';
  return `t_${slug}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizePerson(person, index) {
  if (typeof person === 'string') return { id: `player-${index + 1}`, name: cleanName(person) };
  if (!person || typeof person !== 'object') throw new Error('Each entrant/player must be a name or object.');
  const name = cleanName(person.name ?? person.displayName ?? [person.firstName, person.lastName].filter(Boolean).join(' '));
  if (!name) throw new Error(`Entrant/player ${index + 1} has no name.`);
  return {
    ...person,
    id: String(person.id ?? person.playerId ?? `player-${index + 1}`),
    name,
  };
}

export function prepareEntrants({
  participants = [],
  teamMode = 'singles',
  teamSize = 1,
  rng = Math.random,
} = {}) {
  if (!Array.isArray(participants)) throw new Error('participants must be an array.');
  const size = Number(teamSize) || 1;
  if (![1, 2, 3].includes(size)) throw new Error('Team size must be 1, 2 or 3.');
  const people = participants.map(normalizePerson);

  if (teamMode === 'singles' || size === 1) {
    if (new Set(people.map(p => p.id)).size !== people.length) throw new Error('Entrant IDs must be unique.');
    return people.map((p, i) => ({ ...p, seed: i + 1, members: p.members || [{ id: p.id, name: p.name }] }));
  }

  if (teamMode === 'fixed') {
    const teams = people.map((entry, i) => {
      const members = Array.isArray(entry.members) ? entry.members.map(normalizePerson) : [];
      if (members.length !== size) throw new Error(`Fixed team "${entry.name}" must contain exactly ${size} members.`);
      return {
        ...entry,
        id: String(entry.id || `team-${i + 1}`),
        name: cleanName(entry.name) || members.map(m => m.name).join(' / '),
        seed: i + 1,
        members,
      };
    });
    if (new Set(teams.map(t => t.id)).size !== teams.length) throw new Error('Team IDs must be unique.');
    return teams;
  }

  if (teamMode === 'blind') {
    if (people.length % size !== 0) throw new Error(`Blind draw ${size === 2 ? 'doubles' : 'triples'} requires a player count divisible by ${size}.`);
    const randomized = shuffle(people, rng);
    const teams = [];
    for (let i = 0; i < randomized.length; i += size) {
      const members = randomized.slice(i, i + size);
      teams.push({
        id: `team-${teams.length + 1}`,
        name: members.map(m => m.name).join(' / '),
        seed: teams.length + 1,
        members,
        blindDraw: true,
      });
    }
    return teams;
  }

  throw new Error(`Unsupported team mode: ${teamMode}`);
}

export function calculatePrizePool({ entrantCount = 0, entryFee = 0, expenses = 0, payoutPercentages = [50, 30, 20] } = {}) {
  const gross = Math.round(Number(entrantCount || 0) * asMoney(entryFee) * 100) / 100;
  const net = Math.max(0, Math.round((gross - asMoney(expenses)) * 100) / 100);
  const percentages = (Array.isArray(payoutPercentages) ? payoutPercentages : [])
    .map(Number)
    .filter(n => Number.isFinite(n) && n >= 0);
  if (percentages.reduce((a, b) => a + b, 0) > 100.0001) throw new Error('Payout percentages cannot total more than 100%.');
  const amounts = percentages.map(p => Math.round(net * p) / 100);
  const allocated = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  return { gross, expenses: asMoney(expenses), prizePool: net, percentages, amounts, reserve: Math.round((net - allocated) * 100) / 100 };
}

function resultMap(state) {
  return new Map(Object.entries(state.results || {}));
}

export function readyMatchDetails(state) {
  const results = resultMap(state);
  const pIndex = participantIndex(state.bracket);
  return availableMatches(state.bracket, results).map(match => ({
    match,
    competitorA: resolveCompetitor(match.sourceA, results, pIndex),
    competitorB: resolveCompetitor(match.sourceB, results, pIndex),
  }));
}

function matchAssignment(state, matchId) {
  return (state.boards || []).find(b => b.matchId === matchId) || null;
}

function appendHistory(state, event) {
  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.push({ at: now(), ...event });
  if (state.history.length > 500) state.history = state.history.slice(-500);
}

function stageTerminal(state) {
  const bracket = state.bracket;
  const results = resultMap(state);
  const pIndex = participantIndex(bracket);

  if (bracket.format === 'single') {
    const final = [...bracket.matches].sort((a, b) => b.number - a.number).find(m => m.stage === 'winners');
    const r = final ? results.get(final.id) : null;
    if (!r) return null;
    const semifinalLosers = bracket.matches
      .filter(m => m.stage === 'winners' && m.round === Math.max(1, final.round - 1))
      .map(m => results.get(m.id)?.loser)
      .filter(Boolean);
    return { champion: r.winner, runnerUp: r.loser, third: semifinalLosers, finalMatchId: final.id };
  }

  const gf = bracket.grandFinal;
  if (!gf) return null;
  const gfResult = results.get(gf.id);
  if (!gfResult) return null;
  const lowerEntrant = resolveCompetitor(gf.sourceB, results, pIndex);
  if (!lowerEntrant) return null;

  if (gfResult.winner.id === lowerEntrant.id) {
    const rf = bracket.resetFinal;
    const reset = rf ? results.get(rf.id) : null;
    if (!reset) return null;
    const lowerFinal = [...bracket.matches].filter(m => m.stage === 'losers').sort((a, b) => b.round - a.round || b.number - a.number)[0];
    return {
      champion: reset.winner,
      runnerUp: reset.loser,
      third: lowerFinal ? [results.get(lowerFinal.id)?.loser].filter(Boolean) : [],
      finalMatchId: rf.id,
      resetPlayed: true,
    };
  }

  const lowerFinal = [...bracket.matches].filter(m => m.stage === 'losers').sort((a, b) => b.round - a.round || b.number - a.number)[0];
  return {
    champion: gfResult.winner,
    runnerUp: gfResult.loser,
    third: lowerFinal ? [results.get(lowerFinal.id)?.loser].filter(Boolean) : [],
    finalMatchId: gf.id,
    resetPlayed: false,
  };
}

export function refreshTournamentOutcome(inputState) {
  const state = clone(inputState);
  const outcome = stageTerminal(state);
  state.outcome = outcome;
  if (outcome) {
    state.status = 'completed';
    state.completedAt = state.completedAt || now();
  } else {
    state.status = state.status === 'draft' ? 'draft' : 'active';
    state.completedAt = null;
  }
  const financials = calculatePrizePool({
    entrantCount: state.entrants.length,
    entryFee: state.settings?.entryFee,
    expenses: state.settings?.expenses,
    payoutPercentages: state.settings?.payoutPercentages,
  });
  state.financials = financials;
  const recipients = [
    outcome?.champion ? [outcome.champion] : [],
    outcome?.runnerUp ? [outcome.runnerUp] : [],
    outcome?.third || [],
  ];
  state.payouts = financials.amounts.map((amount, index) => {
    const group = recipients[index] || [];
    return {
      place: index + 1,
      amount,
      recipients: group,
      perRecipient: group.length ? Math.round((amount / group.length) * 100) / 100 : 0,
    };
  });
  return state;
}

export function createTournamentState({
  id,
  name = 'NEXUS Tournament',
  format = 'double',
  seeding = 'seeded',
  participants = [],
  teamMode = 'singles',
  teamSize = 1,
  boardCount = 1,
  autoAssign = true,
  entryFee = 0,
  expenses = 0,
  payoutPercentages = [50, 30, 20],
  rng = Math.random,
} = {}) {
  const entrants = prepareEntrants({ participants, teamMode, teamSize, rng });
  const bracket = generateBracket({ participants: entrants, format, seeding, rng });
  const count = Math.max(1, Math.min(64, Number(boardCount) || 1));
  let state = {
    id: id || makeTournamentId(name),
    name: cleanName(name) || 'NEXUS Tournament',
    type: 'tournament',
    moduleVersion: '0.12.1',
    format,
    seeding,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    revision: 1,
    entrants: bracket.participants,
    bracket,
    results: {},
    boards: Array.from({ length: count }, (_, i) => ({ number: i + 1, matchId: null, assignedAt: null })),
    history: [],
    settings: {
      teamMode,
      teamSize: Number(teamSize) || 1,
      boardCount: count,
      autoAssign: autoAssign !== false,
      entryFee: asMoney(entryFee),
      expenses: asMoney(expenses),
      payoutPercentages: (Array.isArray(payoutPercentages) ? payoutPercentages : [50, 30, 20]).map(Number),
    },
    outcome: null,
    financials: null,
    payouts: [],
  };
  state = refreshTournamentOutcome(state);
  appendHistory(state, { type: 'tournament_created', name: state.name });
  if (state.settings.autoAssign) state = autoAssignBoards(state);
  return state;
}

export function assignBoard(inputState, matchId, boardNumber) {
  const state = clone(inputState);
  if (state.status === 'completed') throw new Error('Tournament is complete.');
  const ready = readyMatchDetails(state).some(x => x.match.id === matchId);
  if (!ready) throw new Error('Match is not ready for board assignment.');
  if (matchAssignment(state, matchId)) return state;
  const board = state.boards.find(b => b.number === Number(boardNumber));
  if (!board) throw new Error('Board not found.');
  if (board.matchId) throw new Error(`Board ${board.number} is already assigned.`);
  board.matchId = matchId;
  board.assignedAt = now();
  state.updatedAt = now();
  state.revision += 1;
  appendHistory(state, { type: 'board_assigned', board: board.number, matchId });
  return state;
}

export function releaseBoard(inputState, boardNumber) {
  const state = clone(inputState);
  const board = state.boards.find(b => b.number === Number(boardNumber));
  if (!board) throw new Error('Board not found.');
  const matchId = board.matchId;
  board.matchId = null;
  board.assignedAt = null;
  state.updatedAt = now();
  state.revision += 1;
  if (matchId) appendHistory(state, { type: 'board_released', board: board.number, matchId });
  return state;
}

export function autoAssignBoards(inputState) {
  let state = clone(inputState);
  if (state.status === 'completed') return state;
  const freeBoards = state.boards.filter(b => !b.matchId).map(b => b.number);
  const assignedMatches = new Set(state.boards.map(b => b.matchId).filter(Boolean));
  const ready = readyMatchDetails(state)
    .map(x => x.match)
    .filter(m => !assignedMatches.has(m.id))
    .sort((a, b) => a.number - b.number);
  for (let i = 0; i < Math.min(freeBoards.length, ready.length); i++) {
    state = assignBoard(state, ready[i].id, freeBoards[i]);
  }
  return state;
}

export function recordTournamentResult(inputState, matchId, winnerId, { scoreA = null, scoreB = null, boardNumber = null, notes = '' } = {}) {
  let state = clone(inputState);
  if (state.status === 'completed') throw new Error('Tournament is complete.');
  const ready = readyMatchDetails(state).find(x => x.match.id === matchId);
  if (!ready) throw new Error('Match is not ready.');
  const assigned = matchAssignment(state, matchId);
  const board = boardNumber ? state.boards.find(b => b.number === Number(boardNumber)) : assigned;
  if (boardNumber && board?.matchId && board.matchId !== matchId) throw new Error(`Board ${board.number} is assigned to another match.`);

  const map = recordMatchResult(state.bracket, resultMap(state), matchId, winnerId);
  const rawResult = map.get(matchId);
  const result = {
    ...rawResult,
    scoreA: scoreA === '' || scoreA === null ? null : Number(scoreA),
    scoreB: scoreB === '' || scoreB === null ? null : Number(scoreB),
    boardNumber: board?.number ?? assigned?.number ?? null,
    notes: cleanName(notes),
  };
  state.results = Object.fromEntries(map);
  state.results[matchId] = result;

  for (const b of state.boards) {
    if (b.matchId === matchId) {
      b.matchId = null;
      b.assignedAt = null;
    }
  }

  state.updatedAt = now();
  state.revision += 1;
  appendHistory(state, {
    type: 'match_result',
    matchId,
    winnerId: result.winner.id,
    loserId: result.loser.id,
    board: result.boardNumber,
    scoreA: result.scoreA,
    scoreB: result.scoreB,
  });
  state = refreshTournamentOutcome(state);
  if (state.status !== 'completed' && state.settings.autoAssign) state = autoAssignBoards(state);
  return state;
}

function dependentMatchIds(bracket, rootId) {
  const out = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of bracket.matches) {
      if (out.has(match.id)) continue;
      const deps = [match.sourceA, match.sourceB]
        .filter(s => s && (s.type === 'winner' || s.type === 'loser'))
        .map(s => s.matchId);
      if (deps.some(id => out.has(id))) {
        out.add(match.id);
        changed = true;
      }
    }
  }
  return out;
}

export function undoTournamentResult(inputState, matchId) {
  let state = clone(inputState);
  if (!state.results?.[matchId]) throw new Error('That match has no recorded result.');
  const removed = dependentMatchIds(state.bracket, matchId);
  for (const id of removed) delete state.results[id];
  for (const board of state.boards) {
    if (board.matchId && removed.has(board.matchId)) {
      board.matchId = null;
      board.assignedAt = null;
    }
  }
  state.status = 'active';
  state.completedAt = null;
  state.outcome = null;
  state.updatedAt = now();
  state.revision += 1;
  appendHistory(state, { type: 'match_result_undone', matchId, removedMatchIds: [...removed] });
  state = refreshTournamentOutcome(state);
  if (state.settings.autoAssign) state = autoAssignBoards(state);
  return state;
}

export function updateTournamentSettings(inputState, patch = {}) {
  let state = clone(inputState);
  if (patch.name !== undefined) state.name = cleanName(patch.name) || state.name;
  if (patch.autoAssign !== undefined) state.settings.autoAssign = Boolean(patch.autoAssign);
  if (patch.entryFee !== undefined) state.settings.entryFee = asMoney(patch.entryFee);
  if (patch.expenses !== undefined) state.settings.expenses = asMoney(patch.expenses);
  if (patch.payoutPercentages !== undefined) state.settings.payoutPercentages = (Array.isArray(patch.payoutPercentages) ? patch.payoutPercentages : []).map(Number);
  if (patch.boardCount !== undefined) {
    const count = Math.max(1, Math.min(64, Number(patch.boardCount) || 1));
    const occupiedAbove = state.boards.filter(b => b.number > count && b.matchId);
    if (occupiedAbove.length) throw new Error('Cannot reduce board count while removed boards have active matches.');
    const old = new Map(state.boards.map(b => [b.number, b]));
    state.boards = Array.from({ length: count }, (_, i) => old.get(i + 1) || ({ number: i + 1, matchId: null, assignedAt: null }));
    state.settings.boardCount = count;
  }
  state.updatedAt = now();
  state.revision += 1;
  appendHistory(state, { type: 'settings_updated', patch: { ...patch } });
  state = refreshTournamentOutcome(state);
  if (state.settings.autoAssign) state = autoAssignBoards(state);
  return state;
}

export function publicTournamentSnapshot(state) {
  const ready = readyMatchDetails(state).map(({ match, competitorA, competitorB }) => ({
    matchId: match.id,
    number: match.number,
    stage: match.stage,
    round: match.round,
    competitorA,
    competitorB,
    boardNumber: matchAssignment(state, match.id)?.number ?? null,
  }));
  return {
    id: state.id,
    name: state.name,
    format: state.format,
    seeding: state.seeding,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
    entrants: state.entrants,
    bracket: state.bracket,
    results: state.results,
    boards: state.boards,
    ready,
    outcome: state.outcome,
    financials: state.financials,
    payouts: state.payouts,
  };
}
