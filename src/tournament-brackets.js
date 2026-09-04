const MAX_PARTICIPANTS = 128;

export function nextPowerOfTwo(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('Participant count must be a positive integer.');
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function seedOrder(size) {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
    throw new Error('Bracket size must be a power of two >= 2.');
  }
  let order = [1, 2];
  for (let n = 4; n <= size; n *= 2) {
    const sum = n + 1;
    order = order.flatMap(seed => [seed, sum - seed]);
  }
  return order;
}

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalizeParticipants(participants, seeding, rng) {
  if (!Array.isArray(participants)) throw new Error('participants must be an array.');
  const clean = participants.map((p, index) => {
    if (typeof p === 'string') return { id: `p${index + 1}`, name: p, seed: index + 1 };
    if (!p || typeof p !== 'object') throw new Error('Each participant must be a string or object.');
    return {
      ...p,
      id: String(p.id ?? `p${index + 1}`),
      name: String(p.name ?? p.displayName ?? `Participant ${index + 1}`),
      seed: Number.isFinite(Number(p.seed)) ? Number(p.seed) : index + 1,
    };
  });
  if (new Set(clean.map(p => p.id)).size !== clean.length) throw new Error('Participant IDs must be unique.');
  if (seeding === 'random') {
    return shuffle(clean, rng).map((p, index) => ({ ...p, seed: index + 1, originalSeed: p.seed }));
  }
  if (seeding !== 'seeded') throw new Error(`Unsupported seeding mode: ${seeding}`);
  return clean.sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name));
}

function participantSource(seed, participant) {
  return participant ? { type: 'participant', seed, participantId: participant.id } : { type: 'bye', seed };
}
const winnerSource = matchId => ({ type: 'winner', matchId });
const loserSource = matchId => ({ type: 'loser', matchId });

function makeMatch(id, stage, round, index, sourceA, sourceB, extra = {}) {
  return { id, stage, round, index, sourceA, sourceB, ...extra };
}

function buildWinnerBracket(size, participantsBySeed) {
  const slots = seedOrder(size).map(seed => participantSource(seed, participantsBySeed.get(seed)));
  const rounds = [];
  let previous = [];
  let idCounter = 0;
  for (let round = 1, matchCount = size / 2; matchCount >= 1; round += 1, matchCount /= 2) {
    const matches = [];
    for (let i = 0; i < matchCount; i++) {
      const id = `W${++idCounter}`;
      const sourceA = round === 1 ? slots[i * 2] : winnerSource(previous[i * 2].id);
      const sourceB = round === 1 ? slots[i * 2 + 1] : winnerSource(previous[i * 2 + 1].id);
      matches.push(makeMatch(id, 'winners', round, i, sourceA, sourceB));
    }
    rounds.push(matches);
    previous = matches;
  }
  return { slots, rounds };
}

function buildFullDoubleElimination(size, participantsBySeed) {
  const winners = buildWinnerBracket(size, participantsBySeed);
  const k = Math.log2(size);
  const losersRounds = [];
  let lbCounter = 0;

  const first = [];
  const wbFirst = winners.rounds[0];
  for (let i = 0; i < wbFirst.length / 2; i++) {
    first.push(makeMatch(`L${++lbCounter}`, 'losers', 1, i, loserSource(wbFirst[i * 2].id), loserSource(wbFirst[i * 2 + 1].id), { kind: 'minor' }));
  }
  losersRounds.push(first);
  let survivors = first;
  let lbRound = 1;

  for (let wr = 2; wr <= k - 1; wr++) {
    const wbRound = winners.rounds[wr - 1];
    const inject = [];
    lbRound += 1;
    for (let i = 0; i < survivors.length; i++) {
      const cross = i ^ 1;
      const wbIndex = cross < wbRound.length ? cross : i;
      inject.push(makeMatch(`L${++lbCounter}`, 'losers', lbRound, i, winnerSource(survivors[i].id), loserSource(wbRound[wbIndex].id), { kind: 'major', winnerRound: wr }));
    }
    losersRounds.push(inject);

    const consolidate = [];
    lbRound += 1;
    for (let i = 0; i < inject.length / 2; i++) {
      consolidate.push(makeMatch(`L${++lbCounter}`, 'losers', lbRound, i, winnerSource(inject[i * 2].id), winnerSource(inject[i * 2 + 1].id), { kind: 'minor' }));
    }
    losersRounds.push(consolidate);
    survivors = consolidate;
  }

  const wbFinal = winners.rounds[k - 1][0];
  lbRound += 1;
  const lowerFinal = makeMatch(`L${++lbCounter}`, 'losers', lbRound, 0, winnerSource(survivors[0].id), loserSource(wbFinal.id), { kind: 'major', winnerRound: k, lowerFinal: true });
  losersRounds.push([lowerFinal]);

  const grandFinal = makeMatch('GF', 'final', 1, 0, winnerSource(wbFinal.id), winnerSource(lowerFinal.id), { grandFinal: true });
  const resetFinal = makeMatch('RF', 'reset', 1, 0, winnerSource(grandFinal.id), loserSource(grandFinal.id), { resetFinal: true, conditional: 'if-lower-bracket-wins-grand-final' });

  return { slots: winners.slots, winnersRounds: winners.rounds, losersRounds, grandFinal, resetFinal };
}

function simplifyGraph(full) {
  const all = [
    ...full.winnersRounds.flat(),
    ...(full.losersRounds ? full.losersRounds.flat() : []),
    ...(full.grandFinal ? [full.grandFinal] : []),
    ...(full.resetFinal ? [full.resetFinal] : []),
  ];
  const state = new Map();

  function resolve(source) {
    if (!source || source.type === 'bye') return null;
    if (source.type === 'participant') return source;
    const matchState = state.get(source.matchId);
    if (!matchState) throw new Error(`Source ${source.matchId} was resolved before its match.`);
    if (source.type === 'loser') return matchState.competitive ? { type: 'loser', matchId: source.matchId } : null;
    if (matchState.competitive) return { type: 'winner', matchId: source.matchId };
    return matchState.winnerAlias ? resolve(matchState.winnerAlias) : null;
  }

  for (const match of all) {
    const a = resolve(match.sourceA);
    const b = resolve(match.sourceB);
    const competitive = Boolean(a && b);
    const winnerAlias = competitive ? null : (a || b || null);
    state.set(match.id, { competitive, sourceA: a, sourceB: b, winnerAlias });
  }

  const kept = all.filter(m => state.get(m.id).competitive).map(m => ({ ...m, sourceA: state.get(m.id).sourceA, sourceB: state.get(m.id).sourceB }));
  const keptIds = new Set(kept.map(m => m.id));

  function canonical(source) {
    if (!source) return null;
    if (source.type === 'participant') return source;
    if (keptIds.has(source.matchId)) return source;
    const s = state.get(source.matchId);
    if (source.type === 'loser') return null;
    return s?.winnerAlias ? canonical(s.winnerAlias) : null;
  }
  for (const match of kept) {
    match.sourceA = canonical(match.sourceA);
    match.sourceB = canonical(match.sourceB);
  }

  const keptById = new Map(kept.map(m => [m.id, m]));
  const depthMemo = new Map();
  function depth(match) {
    if (depthMemo.has(match.id)) return depthMemo.get(match.id);
    const deps = [match.sourceA, match.sourceB]
      .filter(s => s && (s.type === 'winner' || s.type === 'loser'))
      .map(s => keptById.get(s.matchId))
      .filter(Boolean);
    const d = deps.length ? 1 + Math.max(...deps.map(depth)) : 0;
    depthMemo.set(match.id, d);
    return d;
  }
  const stagePriority = { losers: 0, winners: 1, final: 2, reset: 3 };
  kept.sort((a, b) => depth(a) - depth(b) || stagePriority[a.stage] - stagePriority[b.stage] || a.round - b.round || a.index - b.index);
  kept.forEach((m, index) => { m.number = index + 1; m.depth = depth(m); });

  const numberById = new Map(kept.map(m => [m.id, m.number]));
  function displaySource(source) {
    if (!source) return { type: 'empty', label: 'TBD' };
    if (source.type === 'participant') return { ...source, label: `Seed ${source.seed}` };
    const n = numberById.get(source.matchId);
    return { ...source, matchNumber: n, label: `${source.type === 'winner' ? 'W' : 'L'}${n}` };
  }
  const outgoing = new Map(kept.map(m => [m.id, { winner: [], loser: [] }]));
  for (const m of kept) {
    for (const [side, source] of [['A', m.sourceA], ['B', m.sourceB]]) {
      if (source && (source.type === 'winner' || source.type === 'loser')) {
        outgoing.get(source.matchId)?.[source.type].push({ matchId: m.id, matchNumber: m.number, side });
      }
    }
  }
  for (const m of kept) {
    m.displaySourceA = displaySource(m.sourceA);
    m.displaySourceB = displaySource(m.sourceB);
    m.routes = outgoing.get(m.id);
  }

  return { matches: kept };
}

function groupRounds(matches, stage) {
  const map = new Map();
  for (const match of matches.filter(m => m.stage === stage)) {
    if (!map.has(match.round)) map.set(match.round, []);
    map.get(match.round).push(match);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([round, ms]) => ({ round, matches: ms.sort((a, b) => a.index - b.index) }));
}

function baseBracket(participants, format, seeding, rng) {
  const min = format === 'double' ? 3 : 2;
  if (!Array.isArray(participants) || participants.length < min || participants.length > MAX_PARTICIPANTS) {
    throw new Error(`${format === 'double' ? 'Double' : 'Single'} elimination supports ${min}-${MAX_PARTICIPANTS} participants.`);
  }
  const normalized = normalizeParticipants(participants, seeding, rng);
  const size = nextPowerOfTwo(normalized.length);
  const bySeed = new Map(normalized.map((p, index) => [index + 1, { ...p, seed: index + 1 }]));
  return { normalized, size, bySeed };
}

export function generateSingleElimination({ participants, seeding = 'seeded', rng = Math.random } = {}) {
  const { normalized, size, bySeed } = baseBracket(participants, 'single', seeding, rng);
  const winners = buildWinnerBracket(size, bySeed);
  const simplified = simplifyGraph({ slots: winners.slots, winnersRounds: winners.rounds });
  const matches = simplified.matches;
  return {
    format: 'single', seeding, participantCount: normalized.length, bracketSize: size, byeCount: size - normalized.length,
    participants: normalized, seedSlots: winners.slots, matches, winnersRounds: groupRounds(matches, 'winners'),
    totalPossibleMatches: normalized.length - 1,
  };
}

export function generateDoubleElimination({ participants, seeding = 'seeded', rng = Math.random } = {}) {
  const { normalized, size, bySeed } = baseBracket(participants, 'double', seeding, rng);
  const full = buildFullDoubleElimination(size, bySeed);
  const simplified = simplifyGraph(full);
  const matches = simplified.matches;
  const grandFinal = matches.find(m => m.stage === 'final');
  const resetFinal = matches.find(m => m.stage === 'reset');
  return {
    format: 'double', seeding, participantCount: normalized.length, bracketSize: size, byeCount: size - normalized.length,
    participants: normalized, seedSlots: full.slots, matches,
    winnersRounds: groupRounds(matches, 'winners'), losersRounds: groupRounds(matches, 'losers'), grandFinal, resetFinal,
    totalMinimumMatches: 2 * normalized.length - 2, totalPossibleMatches: 2 * normalized.length - 1,
  };
}

export function generateBracket(options = {}) {
  return options.format === 'double' ? generateDoubleElimination(options) : generateSingleElimination(options);
}

export function participantIndex(bracket) {
  return new Map(bracket.participants.map(p => [p.id, p]));
}

export function resolveCompetitor(source, results, participants) {
  if (!source) return null;
  if (source.type === 'participant') return participants.get(source.participantId) || null;
  const result = results.get(source.matchId);
  if (!result) return null;
  return source.type === 'winner' ? result.winner : result.loser;
}

export function availableMatches(bracket, resultsInput = new Map()) {
  const results = resultsInput instanceof Map ? resultsInput : new Map(Object.entries(resultsInput));
  const participants = participantIndex(bracket);
  const gf = bracket.grandFinal;
  return bracket.matches.filter(match => {
    if (results.has(match.id)) return false;
    if (match.stage === 'reset') {
      if (!gf || !results.has(gf.id)) return false;
      const gfResult = results.get(gf.id);
      const lower = resolveCompetitor(gf.sourceB, results, participants);
      if (!lower || gfResult.winner.id !== lower.id) return false;
    }
    return Boolean(resolveCompetitor(match.sourceA, results, participants) && resolveCompetitor(match.sourceB, results, participants));
  });
}

export function recordMatchResult(bracket, resultsInput, matchId, winnerId) {
  const results = resultsInput instanceof Map ? new Map(resultsInput) : new Map(Object.entries(resultsInput || {}));
  const match = bracket.matches.find(m => m.id === matchId);
  if (!match) throw new Error('Match not found.');
  const participants = participantIndex(bracket);
  const a = resolveCompetitor(match.sourceA, results, participants);
  const b = resolveCompetitor(match.sourceB, results, participants);
  if (!a || !b) throw new Error('Match is not ready.');
  const winner = [a, b].find(p => p.id === winnerId);
  if (!winner) throw new Error('Winner must be one of the match competitors.');
  const loser = winner.id === a.id ? b : a;
  results.set(match.id, { matchId, winner, loser, completedAt: new Date().toISOString() });
  return results;
}
