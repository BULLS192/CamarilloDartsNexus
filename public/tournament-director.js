import {
  generateBracket,
  availableMatches,
  recordMatchResult,
  participantIndex,
  resolveCompetitor,
  shuffle,
} from '/tournament-brackets.js';

const VERSION = '0.12.2';
const STORAGE_KEY = 'nexus:tournament-director:staging:v0122';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
const safeNum = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function todayLocal() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function defaults() {
  return {
    version: VERSION,
    meta: {
      name: 'NEXUS Blind Draw', date: todayLocal(), time: '20:00', venue: 'Hot Dog Shop', venueCustom: '',
      format: 'double', entrantMode: 'blind-doubles', seeding: 'random', boardCount: 4, autoBoards: true,
      showReset: true, showSeeds: true,
    },
    finance: {
      entryFee: 10, mysteryPerPlayer: 2, honeyAmount: 0, honeyThreshold: 3, expenses: 0,
      barMatchPot: false, barMatchMystery: false, payoutPercents: [50, 30, 20, 0], evenPayouts: false,
    },
    roster: [], teams: [], bracketEntrants: [], resultHistory: [], boardAssignments: {},
    mystery: { target: null, hits: [] }, bigHits: [], started: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return defaults();
    const base = defaults();
    return {
      ...base, ...raw,
      meta: { ...base.meta, ...(raw.meta || {}) }, finance: { ...base.finance, ...(raw.finance || {}) }, mystery: { ...base.mystery, ...(raw.mystery || {}) },
      roster: Array.isArray(raw.roster) ? raw.roster : [], teams: Array.isArray(raw.teams) ? raw.teams : [], bracketEntrants: Array.isArray(raw.bracketEntrants) ? raw.bracketEntrants : [],
      resultHistory: Array.isArray(raw.resultHistory) ? raw.resultHistory : [], boardAssignments: raw.boardAssignments && typeof raw.boardAssignments === 'object' ? raw.boardAssignments : {},
    };
  } catch { return defaults(); }
}

let state = loadState();
let directory = [];
let bracket = null;
let results = new Map();
let activeResultMatchId = null;
let toastTimer = null;

const possibleMasterOuts = (() => {
  const darts = new Set([0, 25, 50]);
  const finishes = new Set([25, 50]);
  for (let n = 1; n <= 20; n++) { darts.add(n); darts.add(n * 2); darts.add(n * 3); finishes.add(n * 2); finishes.add(n * 3); }
  const possible = new Set();
  for (const a of darts) for (const b of darts) for (const fin of finishes) { const total = a + b + fin; if (total >= 1 && total <= 180) possible.add(total); }
  return possible;
})();

function saveState() { state.updatedAt = new Date().toISOString(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function toast(message, kind = '') {
  const el = $('#tdMessage'); if (!el) return; clearTimeout(toastTimer); el.textContent = message; el.className = `td-toast show ${kind}`.trim();
  toastTimer = setTimeout(() => { el.className = 'td-toast'; }, 3500);
}
function normalizeGender(value) { const g = String(value || '').trim().toLowerCase(); if (['f','female','woman'].includes(g)) return 'female'; if (['m','male','man'].includes(g)) return 'male'; return 'other'; }
function normalizeDirectoryPlayer(p) {
  const first = p.firstName ?? p.first_name ?? p.identity?.firstName ?? '', last = p.lastName ?? p.last_name ?? p.identity?.lastName ?? '', nick = p.nickname ?? p.identity?.nickname ?? '';
  const name = p.name ?? p.display_name ?? p.displayName ?? [first, last].filter(Boolean).join(' ');
  return { id: String(p.id ?? p.player_id ?? p.playerId ?? uid('nexus')), name: String(name || 'Unnamed player'), firstName: String(first || ''), lastName: String(last || ''), nickname: nick ? String(nick) : '', gender: normalizeGender(p.gender ?? p.identity?.gender), source: 'nexus' };
}

async function loadDirectory(force = false) {
  if (directory.length && !force) return;
  const status = $('#tdDirectoryStatus'); if (status) status.textContent = 'Loading NEXUS directory…';
  try {
    let response = await fetch('/api/players', { cache: 'no-store' }); let source = 'live NEXUS API';
    if (!response.ok) { response = await fetch('/tournament-preview-players.json', { cache: 'no-store' }); source = 'safe staging snapshot'; }
    if (!response.ok) throw new Error(`Player directory failed (${response.status}).`);
    const payload = await response.json(); const list = Array.isArray(payload) ? payload : (payload.players || payload.items || []);
    directory = list.map(normalizeDirectoryPlayer).filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name));
    if (status) status.textContent = `${directory.length} players · ${source}`; renderDirectory();
  } catch (error) { if (status) status.textContent = 'Player directory unavailable.'; toast(error.message, 'error'); }
}

function readSetupForm() {
  state.meta.name = $('#tdName').value.trim() || 'NEXUS Tournament'; state.meta.date = $('#tdDate').value; state.meta.time = $('#tdTime').value; state.meta.venue = $('#tdVenue').value; state.meta.venueCustom = $('#tdVenueCustom').value.trim();
  state.meta.format = $('#tdFormat').value; state.meta.entrantMode = $('#tdEntrantMode').value; state.meta.seeding = $('#tdSeeding').value; state.meta.boardCount = Math.max(1, Math.min(32, Math.floor(safeNum($('#tdBoardCount').value, 4))));
  state.meta.autoBoards = $('#tdAutoBoards').checked; state.meta.showReset = $('#tdShowReset').checked; state.finance.entryFee = Math.max(0, safeNum($('#tdEntryFee').value)); state.finance.mysteryPerPlayer = Math.max(0, safeNum($('#tdMysteryPerPlayer').value));
  state.finance.honeyAmount = Math.max(0, safeNum($('#tdHoneyAmount').value)); state.finance.honeyThreshold = Math.max(1, Math.floor(safeNum($('#tdHoneyThreshold').value, 3))); state.finance.expenses = Math.max(0, safeNum($('#tdExpenses').value)); state.finance.barMatchPot = $('#tdBarMatchPot').checked; state.finance.barMatchMystery = $('#tdBarMatchMystery').checked;
  saveState(); renderAll();
}

function syncSetupForm() {
  const m = state.meta, f = state.finance;
  $('#tdName').value = m.name; $('#tdDate').value = m.date || todayLocal(); $('#tdTime').value = m.time || ''; $('#tdVenue').value = ['Hot Dog Shop', "JJ's Bar", "JB's Pub & Grill", 'Other'].includes(m.venue) ? m.venue : 'Other'; $('#tdVenueCustom').value = m.venueCustom || '';
  $('#tdFormat').value = m.format; $('#tdEntrantMode').value = m.entrantMode; $('#tdSeeding').value = m.seeding; $('#tdBoardCount').value = m.boardCount; $('#tdAutoBoards').checked = m.autoBoards; $('#tdShowReset').checked = m.showReset; $('#tdShowSeeds').checked = m.showSeeds;
  $('#tdEntryFee').value = f.entryFee; $('#tdMysteryPerPlayer').value = f.mysteryPerPlayer; $('#tdHoneyAmount').value = f.honeyAmount; $('#tdHoneyThreshold').value = f.honeyThreshold; $('#tdExpenses').value = f.expenses; $('#tdBarMatchPot').checked = f.barMatchPot; $('#tdBarMatchMystery').checked = f.barMatchMystery;
  [1,2,3,4].forEach((n, i) => { $(`#tdPayout${n}`).value = f.payoutPercents[i] ?? 0; }); $('#tdMysteryTarget').value = state.mystery.target ?? '';
}

function rosterById(id) { return state.roster.find(p => p.id === id) || null; }
function genderCounts() { return state.roster.reduce((acc, p) => { acc[normalizeGender(p.gender)] = (acc[normalizeGender(p.gender)] || 0) + 1; return acc; }, { male: 0, female: 0, other: 0 }); }
function financeModel() {
  const count = state.roster.length, genders = genderCounts(), f = state.finance, playerPot = count * f.entryFee, barPotMatch = f.barMatchPot ? playerPot : 0, totalPot = playerPot + barPotMatch, mysteryBase = count * f.mysteryPerPlayer, mysteryMatch = f.barMatchMystery ? mysteryBase : 0, mysteryTotal = mysteryBase + mysteryMatch;
  const honeyQualified = genders.female >= f.honeyThreshold, honey = honeyQualified ? f.honeyAmount : 0, expenses = f.expenses, prizePool = Math.max(0, totalPot - mysteryTotal - honey - expenses), collected = state.roster.filter(p => p.paid).length * f.entryFee;
  const percents = f.payoutPercents.map(v => Math.max(0, safeNum(v))), percentTotal = percents.reduce((a, b) => a + b, 0), divisor = state.meta.entrantMode === 'singles' ? 1 : 2;
  let payouts = percents.map(p => prizePool * p / 100); if (f.evenPayouts) payouts = payouts.map(v => Math.floor(v / divisor) * divisor);
  return { count, genders, playerPot, barPotMatch, totalPot, mysteryBase, mysteryMatch, mysteryTotal, honeyQualified, honey, expenses, prizePool, collected, percents, percentTotal, payouts, reserve: Math.max(0, prizePool - payouts.reduce((a,b)=>a+b,0)) };
}

function invalidateTournament(message = '') { state.started = false; state.bracketEntrants = []; state.resultHistory = []; state.boardAssignments = {}; bracket = null; results = new Map(); if (message) toast(message, 'error'); }
function addRosterPlayer(player) { if (state.roster.some(p => p.id === player.id)) return toast(`${player.name} is already checked in.`, 'error'); state.roster.push({ ...player, gender: normalizeGender(player.gender), paid: false }); if (state.started) invalidateTournament('Roster changed — rebuild the tournament before continuing.'); saveState(); renderAll(); }
function removeRosterPlayer(id) { const p = rosterById(id); if (!p) return; state.roster = state.roster.filter(x => x.id !== id); state.teams = state.teams.filter(t => !t.members.includes(id)); if (state.started) invalidateTournament('Roster changed — bracket returned to setup state.'); saveState(); renderAll(); }

function drawBlindTeams() {
  if (state.meta.entrantMode === 'singles') { state.teams = []; saveState(); renderAll(); return; }
  if (state.meta.entrantMode !== 'blind-doubles') return toast('Use the two player selectors to build fixed teams.', 'error');
  if (state.roster.length < 4 || state.roster.length % 2) return toast('Blind Draw Doubles requires an even number of checked-in players.', 'error');
  const shuffled = shuffle(state.roster); state.teams = [];
  for (let i = 0; i < shuffled.length; i += 2) state.teams.push({ id: uid('team'), name: `Team ${state.teams.length + 1}`, members: [shuffled[i].id, shuffled[i + 1].id] });
  if (state.started) invalidateTournament(); saveState(); renderAll(); toast(`${state.teams.length} blind-draw teams created.`, 'success');
}
function addFixedTeam() {
  if (state.meta.entrantMode !== 'fixed-doubles') return toast('Switch Entrants to Fixed Doubles first.', 'error');
  const a = $('#tdTeamPlayerA').value, b = $('#tdTeamPlayerB').value; if (!a || !b || a === b) return toast('Choose two different players.', 'error'); if (state.teams.some(t => t.members.includes(a) || t.members.includes(b))) return toast('One of those players is already assigned to a team.', 'error');
  state.teams.push({ id: uid('team'), name: `Team ${state.teams.length + 1}`, members: [a, b] }); saveState(); renderAll();
}
function entrantsForBuild() {
  if (state.meta.entrantMode === 'singles') return state.roster.map((p, i) => ({ id: `player:${p.id}`, name: p.name, seed: i + 1, gender: p.gender, nexusPlayerId: p.source === 'nexus' ? p.id : null, memberIds: [p.id] }));
  const used = state.teams.flatMap(t => t.members); if (state.teams.length < (state.meta.format === 'double' ? 3 : 2)) throw new Error(`Need at least ${state.meta.format === 'double' ? 3 : 2} teams for this format.`); if (used.length !== state.roster.length || new Set(used).size !== state.roster.length) throw new Error('Every checked-in player must be assigned to exactly one team.');
  return state.teams.map((t, i) => { const members = t.members.map(rosterById).filter(Boolean); return { id: `team:${t.id}`, name: members.map(p => p.nickname || p.name).join(' + '), fullName: members.map(p => p.name).join(' + '), seed: i + 1, memberIds: t.members }; });
}
function buildTournament() {
  try {
    readSetupForm(); if (state.meta.entrantMode === 'blind-doubles' && state.teams.length * 2 !== state.roster.length) drawBlindTeams(); let entrants = entrantsForBuild(); const min = state.meta.format === 'double' ? 3 : 2; if (entrants.length < min) throw new Error(`Need at least ${min} entrants for ${state.meta.format} elimination.`);
    if (state.meta.seeding === 'random') entrants = shuffle(entrants).map((p, i) => ({ ...p, seed: i + 1 })); state.bracketEntrants = entrants.map((p, i) => ({ ...p, seed: i + 1 })); state.resultHistory = []; state.boardAssignments = {}; state.started = true; rebuildBracketFromState(); if (state.meta.autoBoards) autoAssignBoards(false); saveState(); renderAll(); switchTab('bracket'); toast('Tournament built. First matches are ready.', 'success');
  } catch (error) { toast(error.message, 'error'); }
}
function rebuildBracketFromState() {
  bracket = null; results = new Map(); if (!state.started || !state.bracketEntrants.length) return;
  try { bracket = generateBracket({ participants: state.bracketEntrants, format: state.meta.format, seeding: 'seeded' }); const validHistory = []; for (const record of state.resultHistory) { try { results = recordMatchResult(bracket, results, record.matchId, record.winnerId); validHistory.push(record); } catch { break; } } if (validHistory.length !== state.resultHistory.length) state.resultHistory = validHistory; cleanupBoardAssignments(); }
  catch (error) { invalidateTournament(); toast(`Bracket could not be restored: ${error.message}`, 'error'); }
}

function readyMatches() { return bracket ? availableMatches(bracket, results) : []; }
function matchById(id) { return bracket?.matches.find(m => m.id === id) || null; }
function matchCompetitors(match) { if (!bracket || !match) return [null, null]; const idx = participantIndex(bracket); return [resolveCompetitor(match.sourceA, results, idx), resolveCompetitor(match.sourceB, results, idx)]; }
function boardForMatch(matchId) { const entry = Object.entries(state.boardAssignments).find(([, id]) => id === matchId); return entry ? Number(entry[0]) : null; }
function cleanupBoardAssignments() { const ready = new Set(readyMatches().map(m => m.id)); for (const [board, matchId] of Object.entries(state.boardAssignments)) if (!ready.has(matchId)) delete state.boardAssignments[board]; }
function assignBoard(matchId, board) { board = Number(board); if (!matchById(matchId) || !readyMatches().some(m => m.id === matchId)) return toast('That match is not ready.', 'error'); for (const [b, id] of Object.entries(state.boardAssignments)) if (id === matchId || Number(b) === board) delete state.boardAssignments[b]; state.boardAssignments[board] = matchId; saveState(); renderAll(); }
function autoAssignBoards(showToast = true) { cleanupBoardAssignments(); const assigned = new Set(Object.values(state.boardAssignments)), waiting = readyMatches().filter(m => !assigned.has(m.id)), free = []; for (let b = 1; b <= state.meta.boardCount; b++) if (!state.boardAssignments[b]) free.push(b); let count = 0; while (waiting.length && free.length) { state.boardAssignments[free.shift()] = waiting.shift().id; count++; } saveState(); renderAll(); if (showToast) toast(count ? `${count} match${count === 1 ? '' : 'es'} assigned.` : 'No free board assignments needed.', count ? 'success' : ''); }

function openResultDialog(matchId) {
  const match = matchById(matchId); if (!match || !readyMatches().some(m => m.id === matchId)) return; activeResultMatchId = matchId; const [a, b] = matchCompetitors(match);
  $('#tdResultMatchLabel').textContent = `Match ${match.number} · ${roundLabel(match.stage, match.round)}`; $('#tdResultPlayers').innerHTML = [a, b].map((p, i) => `<label class="td-result-choice"><input type="radio" name="tdWinner" value="${escapeHtml(p.id)}" ${i === 0 ? 'checked' : ''}/><strong>${escapeHtml(p.name)}</strong><small>${i === 0 ? 'A' : 'B'}</small></label>`).join(''); $('#tdScoreA').value = ''; $('#tdScoreB').value = ''; $('#tdResultNotes').value = '';
  const currentBoard = boardForMatch(matchId); $('#tdResultBoard').innerHTML = `<option value="">Unassigned</option>${Array.from({ length: state.meta.boardCount }, (_, i) => `<option value="${i + 1}">Board ${i + 1}</option>`).join('')}`; $('#tdResultBoard').value = currentBoard || '';
  $$('.td-result-choice').forEach(label => label.addEventListener('click', () => { $$('.td-result-choice').forEach(x => x.classList.remove('selected')); label.classList.add('selected'); label.querySelector('input').checked = true; })); $$('.td-result-choice')[0]?.classList.add('selected'); $('#tdResultDialog').showModal();
}
function saveResult(event) {
  event.preventDefault(); const match = matchById(activeResultMatchId), winnerId = $('input[name="tdWinner"]:checked')?.value; if (!match || !winnerId) return;
  try { results = recordMatchResult(bracket, results, match.id, winnerId); state.resultHistory.push({ matchId: match.id, winnerId, scoreA: $('#tdScoreA').value === '' ? null : safeNum($('#tdScoreA').value), scoreB: $('#tdScoreB').value === '' ? null : safeNum($('#tdScoreB').value), board: $('#tdResultBoard').value ? Number($('#tdResultBoard').value) : boardForMatch(match.id), notes: $('#tdResultNotes').value.trim(), completedAt: new Date().toISOString() }); for (const [board, id] of Object.entries(state.boardAssignments)) if (id === match.id) delete state.boardAssignments[board]; rebuildBracketFromState(); if (state.meta.autoBoards) autoAssignBoards(false); saveState(); $('#tdResultDialog').close(); renderAll(); toast(`Match ${match.number} recorded.`, 'success'); }
  catch (error) { toast(error.message, 'error'); }
}
function undoLastResult() { const last = state.resultHistory.pop(); if (!last) return; rebuildBracketFromState(); state.boardAssignments = {}; if (state.meta.autoBoards) autoAssignBoards(false); saveState(); renderAll(); const m = matchById(last.matchId); toast(`Undid ${m?.number ? `Match ${m.number}` : 'last result'}.`, 'success'); }
function roundLabel(stage, round) { if (stage === 'winners') return `Winners R${round}`; if (stage === 'losers') return `Losers R${round}`; if (stage === 'final') return 'Grand Final'; if (stage === 'reset') return 'If First Loss'; return `Round ${round}`; }
function lowerThird() { if (!bracket?.losersRounds?.length) return null; const lowerFinal = bracket.losersRounds.at(-1)?.matches?.[0]; return lowerFinal ? results.get(lowerFinal.id)?.loser || null : null; }
function outcome() {
  if (!bracket || !state.resultHistory.length) return { champion: null, runnerUp: null, third: null, complete: false };
  if (bracket.format === 'single') { const final = bracket.matches.filter(m => m.stage === 'winners').at(-1), r = final && results.get(final.id); return r ? { champion: r.winner, runnerUp: r.loser, third: null, complete: true } : { champion: null, runnerUp: null, third: null, complete: false }; }
  const gf = bracket.grandFinal, rf = bracket.resetFinal, resetResult = rf && results.get(rf.id); if (resetResult) return { champion: resetResult.winner, runnerUp: resetResult.loser, third: lowerThird(), complete: true }; const gfResult = gf && results.get(gf.id); if (!gfResult) return { champion: null, runnerUp: null, third: lowerThird(), complete: false }; const resetReady = rf && readyMatches().some(m => m.id === rf.id); if (resetReady) return { champion: null, runnerUp: null, third: lowerThird(), complete: false }; return { champion: gfResult.winner, runnerUp: gfResult.loser, third: lowerThird(), complete: true };
}
function displayParticipantName(p) { return p?.fullName || p?.name || 'TBD'; }

function renderDirectory() {
  const root = $('#tdDirectoryList'); if (!root) return; const q = $('#tdPlayerSearch').value.trim().toLowerCase(), gf = $('#tdGenderFilter').value, rosterIds = new Set(state.roster.map(p => p.id));
  const filtered = directory.filter(p => { const hay = `${p.name} ${p.nickname}`.toLowerCase(), genderOk = gf === 'all' || (gf === 'other' ? !['male','female'].includes(p.gender) : p.gender === gf); return genderOk && (!q || hay.includes(q)); });
  root.innerHTML = filtered.length ? filtered.map(p => `<div class="td-directory-row"><div class="td-person"><strong>${escapeHtml(p.name)}</strong><small><span class="td-gender ${p.gender}">${p.gender === 'female' ? 'F' : p.gender === 'male' ? 'M' : 'O'}</span>${p.nickname ? `<span>${escapeHtml(p.nickname)}</span>` : ''}<span class="td-source-badge">NEXUS</span></small></div><button data-add-player="${escapeHtml(p.id)}" ${rosterIds.has(p.id) ? 'disabled' : ''}>${rosterIds.has(p.id) ? 'Added' : '+ Add'}</button></div>`).join('') : `<div class="td-empty">No directory players match this filter.</div>`;
  $$('[data-add-player]').forEach(btn => btn.addEventListener('click', () => { const p = directory.find(x => x.id === btn.dataset.addPlayer); if (p) addRosterPlayer(p); }));
}
function renderRoster() {
  const root = $('#tdRosterList'); root.innerHTML = state.roster.length ? state.roster.map((p, i) => `<div class="td-roster-row"><div class="td-person"><strong>${i + 1}. ${escapeHtml(p.name)}</strong><small><span class="td-gender ${p.gender}">${p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : 'Other'}</span>${p.source === 'nexus' ? '<span class="td-source-badge">Linked</span>' : '<span>Walk-in</span>'}</small></div><div class="td-roster-actions"><label class="td-paid"><input type="checkbox" data-paid="${escapeHtml(p.id)}" ${p.paid ? 'checked' : ''}/> Paid</label><button data-remove-player="${escapeHtml(p.id)}">×</button></div></div>`).join('') : `<div class="td-empty">No players checked in yet. Add players from the NEXUS directory.</div>`;
  $$('[data-paid]').forEach(input => input.addEventListener('change', () => { const p = rosterById(input.dataset.paid); if (p) { p.paid = input.checked; saveState(); renderAll(); } })); $$('[data-remove-player]').forEach(btn => btn.addEventListener('click', () => removeRosterPlayer(btn.dataset.removePlayer))); const paid = state.roster.filter(p => p.paid).length; $('#tdPaidCount').textContent = paid; $('#tdUnpaidCount').textContent = state.roster.length - paid;
}
function renderTeamSelectors() {
  const used = new Set(state.teams.flatMap(t => t.members)), available = state.roster.filter(p => !used.has(p.id)), options = `<option value="">Select player…</option>${available.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}`;
  $('#tdTeamPlayerA').innerHTML = options; $('#tdTeamPlayerB').innerHTML = options; const fixed = state.meta.entrantMode === 'fixed-doubles'; $('#tdManualTeamBuilder').style.display = fixed ? 'grid' : 'none'; $('#tdTeamInstruction').textContent = state.meta.entrantMode === 'singles' ? 'Singles mode does not create teams.' : fixed ? 'Build each fixed pair from the checked-in roster.' : 'Blind Draw Doubles randomizes the complete checked-in roster.'; $('#tdDrawTeams').disabled = state.meta.entrantMode === 'fixed-doubles' || state.meta.entrantMode === 'singles';
}
function renderTeams() {
  renderTeamSelectors(); const grid = $('#tdTeamsGrid'); if (state.meta.entrantMode === 'singles') grid.innerHTML = `<div class="td-empty">Singles event · ${state.roster.length} entrants will be placed directly into the bracket.</div>`; else grid.innerHTML = state.teams.length ? state.teams.map((t, i) => { const members = t.members.map(rosterById).filter(Boolean); return `<article class="td-team-card"><header><span>Team ${i + 1}</span><button data-remove-team="${escapeHtml(t.id)}">×</button></header><strong>${escapeHtml(members[0]?.name || 'Missing')}</strong><div class="plus">+</div><strong>${escapeHtml(members[1]?.name || 'Missing')}</strong></article>`; }).join('') : `<div class="td-empty">No teams drawn yet.</div>`;
  $$('[data-remove-team]').forEach(btn => btn.addEventListener('click', () => { state.teams = state.teams.filter(t => t.id !== btn.dataset.removeTeam); saveState(); renderAll(); })); const used = state.teams.flatMap(t => t.members), unique = new Set(used), expectedTeams = state.meta.entrantMode === 'singles' ? state.roster.length : Math.floor(state.roster.length / 2), complete = state.meta.entrantMode === 'singles' || (used.length === state.roster.length && unique.size === state.roster.length && state.roster.length % 2 === 0);
  $('#tdTeamDiagnostics').innerHTML = [['Expected entrants', state.meta.entrantMode === 'singles' ? `${state.roster.length} singles` : `${expectedTeams} teams`, true],['Assigned players', state.meta.entrantMode === 'singles' ? state.roster.length : `${unique.size} / ${state.roster.length}`, complete],['Duplicate assignments', state.meta.entrantMode === 'singles' ? 'N/A' : `${used.length - unique.size}`, used.length === unique.size],['Draw ready', complete ? 'Yes' : 'Not yet', complete]].map(([label, value, ok]) => `<div class="td-diag"><span>${label}</span><b class="${ok ? 'good' : 'warn'}">${value}</b></div>`).join('');
}

function sourceData(source) {
  if (!bracket) return { player: null, label: 'TBD' }; const player = resolveCompetitor(source, results, participantIndex(bracket)); if (player) return { player, label: displayParticipantName(player) }; if (source?.type === 'participant') return { player: null, label: bracket.participants.find(p => p.id === source.participantId)?.name || 'TBD' }; if (source?.type === 'winner' || source?.type === 'loser') { const number = matchById(source.matchId)?.number ?? '?'; return { player: null, label: `${source.type === 'winner' ? 'W' : 'L'}${number}` }; } return { player: null, label: 'TBD' };
}
function renderMatch(match, readySet) {
  const a = sourceData(match.sourceA), b = sourceData(match.sourceB), done = results.get(match.id), board = boardForMatch(match.id), classes = ['td-match', readySet.has(match.id) ? 'ready' : '', done ? 'done' : ''].filter(Boolean).join(' ');
  const slot = (data) => { const isWinner = done && data.player?.id === done.winner.id, isLoser = done && data.player?.id === done.loser.id; return `<div class="td-slot ${isWinner ? 'winner' : isLoser ? 'loser' : ''}">${state.meta.showSeeds && data.player?.seed ? `<span class="td-seed">${data.player.seed}</span>` : ''}<span>${data.player ? escapeHtml(data.label) : `<span class="td-source">${escapeHtml(data.label)}</span>`}</span></div>`; };
  const record = state.resultHistory.find(r => r.matchId === match.id), score = record && record.scoreA !== null && record.scoreB !== null ? `${record.scoreA}–${record.scoreB}` : '';
  return `<article class="${classes}"><div class="td-match-head"><span class="td-match-number">Match ${match.number}</span><span>${roundLabel(match.stage, match.round)}</span></div>${slot(a)}${slot(b)}<div class="td-match-foot"><span>${board ? `<span class="td-board-chip">Board ${board}</span>` : score || (done ? 'Complete' : readySet.has(match.id) ? 'Ready' : 'Waiting')}</span>${readySet.has(match.id) ? `<button data-record-match="${escapeHtml(match.id)}">Record Result</button>` : ''}</div></article>`;
}
function renderRounds(title, rounds, readySet) { if (!rounds?.length) return ''; return `<section class="td-section"><h3 class="td-section-title">${title}</h3><div class="td-rounds">${rounds.map(r => `<div class="td-round"><div class="td-round-title">${title.includes('Winner') ? 'Winners' : 'Losers'} Round ${r.round}</div>${r.matches.map(m => renderMatch(m, readySet)).join('')}</div>`).join('')}</div></section>`; }
function renderBracket() {
  const root = $('#tdBracket'); if (!bracket) { root.innerHTML = `<div class="td-empty">No bracket yet. Complete player check-in, draw teams if needed, then choose <strong>Build Tournament</strong> in Setup.</div>`; $('#tdBracketTitle').textContent = 'Bracket not built'; $('#tdBracketSubtitle').textContent = 'Setup → Check-in → Teams → Build Tournament'; return; }
  const readySet = new Set(readyMatches().map(m => m.id)); let html = renderRounds("Winner's Bracket", bracket.winnersRounds, readySet); html += renderRounds("Loser's Bracket", bracket.losersRounds, readySet); if (bracket.grandFinal) html += `<section class="td-section"><h3 class="td-section-title">Championship</h3><div class="td-final-row"><div class="td-round">${renderMatch(bracket.grandFinal, readySet)}</div>${state.meta.showReset && bracket.resetFinal ? `<div class="td-round">${renderMatch(bracket.resetFinal, readySet)}</div>` : ''}</div></section>`;
  root.innerHTML = html; $$('[data-record-match]').forEach(btn => btn.addEventListener('click', () => openResultDialog(btn.dataset.recordMatch))); $('#tdBracketTitle').textContent = `${bracket.participantCount} Entrant ${bracket.format === 'double' ? 'Double' : 'Single'} Elimination`; $('#tdBracketSubtitle').textContent = `${bracket.byeCount} bye${bracket.byeCount === 1 ? '' : 's'} · ${results.size} completed · ${readySet.size} ready`;
}

function renderBoards() {
  cleanupBoardAssignments(); const ready = readyMatches(), readyMap = new Map(ready.map(m => [m.id, m]));
  $('#tdBoardGrid').innerHTML = Array.from({ length: state.meta.boardCount }, (_, i) => { const board = i + 1, matchId = state.boardAssignments[board], match = matchId ? readyMap.get(matchId) : null; if (!match) return `<article class="td-board-card"><header><span class="td-board-number">${board}</span><span class="td-board-state">FREE</span></header><div class="td-board-match">Waiting for next ready match.</div></article>`; const [a,b] = matchCompetitors(match); return `<article class="td-board-card busy"><header><span class="td-board-number">${board}</span><span class="td-board-state">PLAYING</span></header><div class="td-board-match"><strong>Match ${match.number}</strong>${escapeHtml(displayParticipantName(a))}<br><span class="td-muted">vs</span><br>${escapeHtml(displayParticipantName(b))}<div class="td-button-row" style="margin-top:8px"><button data-board-result="${escapeHtml(match.id)}">Result</button><button data-release-board="${board}">Release</button></div></div></article>`; }).join('');
  const assigned = new Set(Object.values(state.boardAssignments)), waiting = ready.filter(m => !assigned.has(m.id)); $('#tdReadyQueue').innerHTML = waiting.length ? waiting.map(m => { const [a,b] = matchCompetitors(m); return `<article class="td-queue-row"><header><span>Match ${m.number}</span><span>${roundLabel(m.stage,m.round)}</span></header><strong>${escapeHtml(displayParticipantName(a))} vs ${escapeHtml(displayParticipantName(b))}</strong><div class="td-queue-actions"><select data-board-select="${escapeHtml(m.id)}"><option value="">Choose board…</option>${Array.from({ length: state.meta.boardCount }, (_, i) => `<option value="${i + 1}" ${state.boardAssignments[i+1] ? 'disabled' : ''}>Board ${i+1}${state.boardAssignments[i+1] ? ' · busy' : ''}</option>`).join('')}</select><button data-assign-selected="${escapeHtml(m.id)}">Assign</button></div></article>`; }).join('') : `<div class="td-empty">${bracket ? 'No ready matches are waiting.' : 'Build the tournament to populate the queue.'}</div>`;
  $$('[data-board-result]').forEach(btn => btn.addEventListener('click', () => openResultDialog(btn.dataset.boardResult))); $$('[data-release-board]').forEach(btn => btn.addEventListener('click', () => { delete state.boardAssignments[Number(btn.dataset.releaseBoard)]; saveState(); renderAll(); })); $$('[data-assign-selected]').forEach(btn => btn.addEventListener('click', () => { const select = $(`[data-board-select="${CSS.escape(btn.dataset.assignSelected)}"]`); if (select?.value) assignBoard(btn.dataset.assignSelected, select.value); }));
}

function renderMystery() {
  const target = state.mystery.target ? Number(state.mystery.target) : null; $('#tdMysteryTarget').value = target || ''; $('#tdMysteryTargetHero').textContent = target || '—'; $('#tdMysteryPlayer').innerHTML = `<option value="">Select player…</option>${state.roster.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}`;
  const byNumber = new Map(); state.mystery.hits.forEach(hit => { if (!byNumber.has(Number(hit.number))) byNumber.set(Number(hit.number), []); byNumber.get(Number(hit.number)).push(hit); });
  $('#tdMysteryGrid').innerHTML = Array.from({ length: 180 }, (_, i) => { const n = i + 1, valid = possibleMasterOuts.has(n), hits = byNumber.get(n) || []; return `<div class="td-out-cell ${!valid ? 'invalid' : ''} ${hits.length ? 'hit' : ''} ${target === n ? 'target' : ''}" title="${hits.length ? hits.map(h => rosterById(h.playerId)?.name || 'Player').join(', ') : valid ? `Valid Master Out ${n}` : `No Master Out ${n}`}">${n}${hits.length ? `<small>×${hits.length}</small>` : ''}</div>`; }).join('');
  $('#tdMysteryHistory').innerHTML = state.mystery.hits.length ? [...state.mystery.hits].reverse().map(hit => { const p = rosterById(hit.playerId), first = state.mystery.hits.find(h => Number(h.number) === Number(hit.number))?.id === hit.id; return `<div class="td-hit-row"><span class="td-hit-number">${hit.number}</span><div><strong>${escapeHtml(p?.name || 'Unknown player')}</strong><small>${first ? 'First hit on this number' : 'Additional hit'} · ${new Date(hit.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></div><button data-remove-hit="${escapeHtml(hit.id)}">×</button></div>`; }).join('') : `<div class="td-empty">No Mystery Out hits recorded yet.</div>`; $$('[data-remove-hit]').forEach(btn => btn.addEventListener('click', () => { state.mystery.hits = state.mystery.hits.filter(h => h.id !== btn.dataset.removeHit); saveState(); renderAll(); }));
}
function recordMysteryHit(event) { event.preventDefault(); const playerId = $('#tdMysteryPlayer').value, number = Math.floor(safeNum($('#tdMysteryNumber').value)); if (!playerId) return toast('Choose the player who hit the out.', 'error'); if (!possibleMasterOuts.has(number)) return toast(`${number || 'That number'} is not a valid 1–180 Master Out.`, 'error'); state.mystery.hits.push({ id: uid('hit'), playerId, number, at: new Date().toISOString() }); saveState(); $('#tdMysteryNumber').value = ''; renderAll(); toast(`${rosterById(playerId)?.name || 'Player'} recorded on ${number}.`, 'success'); }

function renderPayouts() {
  const f = financeModel(); $('#tdPayoutWarning').textContent = f.percentTotal > 100 ? `Payout split totals ${f.percentTotal}%. Reduce it to 100% or less.` : f.percentTotal < 100 ? `${100 - f.percentTotal}% remains in reserve.` : ''; const out = outcome(), placements = [out.champion, out.runnerUp, out.third, null];
  $('#tdPayoutPositions').innerHTML = f.payouts.map((amount, i) => `<article class="td-payout-card"><span>${i+1}${i===0?'st':i===1?'nd':i===2?'rd':'th'} place · ${f.percents[i]}%</span><strong>${money(amount)}</strong><small>${escapeHtml(displayParticipantName(placements[i]))}</small></article>`).join('');
  $('#tdPotLedger').innerHTML = [['Player Pot', f.playerPot], ['Bar Pot Match', f.barPotMatch], ['Total Pot', f.totalPot, 'total'], ['Mystery Out Base', -f.mysteryBase], ['Mystery Out Match', -f.mysteryMatch], [`Honey Pot${f.honeyQualified ? '' : ' (not triggered)'}`, -f.honey], ['Expenses', -f.expenses], ['Tournament Prize Pool', f.prizePool, 'total'], ['Payout Reserve', f.reserve, 'muted']].map(([label, value, cls='']) => `<div class="td-ledger-row ${cls}"><span>${label}</span><strong>${value < 0 ? '−' : ''}${money(Math.abs(value))}</strong></div>`).join(''); $('#tdFinanceExplain').textContent = `${f.count} players × ${money(state.finance.entryFee)} entry · ${f.genders.female} female player${f.genders.female === 1 ? '' : 's'}`;
}
function renderReadiness() {
  const minEntrants = state.meta.format === 'double' ? 3 : 2, entrants = state.meta.entrantMode === 'singles' ? state.roster.length : state.teams.length, rosterOkay = state.meta.entrantMode === 'singles' ? state.roster.length >= minEntrants : state.roster.length >= minEntrants * 2, teamsOkay = state.meta.entrantMode === 'singles' || (state.teams.length >= minEntrants && state.teams.flatMap(t=>t.members).length === state.roster.length && new Set(state.teams.flatMap(t=>t.members)).size === state.roster.length), paid = state.roster.filter(p=>p.paid).length, f = financeModel();
  const checks = [['Roster minimum', rosterOkay, `${state.roster.length} checked in`], ['Teams / draw', teamsOkay, state.meta.entrantMode === 'singles' ? 'Singles ready' : `${entrants} teams`], ['Payment check', paid === state.roster.length && state.roster.length > 0, `${paid}/${state.roster.length} paid`], ['Payout split', f.percentTotal <= 100, `${f.percentTotal}% allocated`], ['Boards', state.meta.boardCount > 0, `${state.meta.boardCount} available`]];
  $('#tdReadinessList').innerHTML = checks.map(([label, ok, value]) => `<li><span>${label}</span><span class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '•'} ${value}</span></li>`).join('');
}
function renderSummary() {
  const f = financeModel(), paid = state.roster.filter(p=>p.paid).length, activeBoards = Object.keys(state.boardAssignments).length, teamCount = state.meta.entrantMode === 'singles' ? state.roster.length : state.teams.length, totalMatches = bracket?.matches?.length || 0, completed = results.size, progress = totalMatches ? Math.round(completed / totalMatches * 100) : 0, ready = readyMatches().length, out = outcome();
  $('#sumPlayers').textContent = state.roster.length; $('#sumGender').textContent = `${f.genders.male} M · ${f.genders.female} F${f.genders.other ? ` · ${f.genders.other} O` : ''}`; $('#sumPaid').textContent = `${paid} / ${state.roster.length}`; $('#sumCollected').textContent = `${money(f.collected)} collected`; $('#sumTeams').textContent = teamCount; $('#sumMode').textContent = state.meta.entrantMode === 'blind-doubles' ? 'Blind doubles' : state.meta.entrantMode === 'fixed-doubles' ? 'Fixed doubles' : 'Singles'; $('#sumBoards').textContent = `${activeBoards} / ${state.meta.boardCount}`; $('#sumPool').textContent = money(f.prizePool); $('#sumMysteryPot').textContent = `${money(f.mysteryTotal)} Mystery Out`; $('#sumProgress').textContent = out.complete ? '100%' : `${progress}%`; $('#sumReady').textContent = out.complete ? `Champion: ${displayParticipantName(out.champion)}` : bracket ? `${ready} ready match${ready === 1 ? '' : 'es'}` : 'Not started'; $('#tdRosterBadge').textContent = state.roster.length; $('#tdHeaderName').textContent = state.meta.name || 'NEXUS Tournament'; const status = $('#tdHeaderStatus'); status.textContent = out.complete ? 'COMPLETE' : state.started ? 'LIVE' : 'SETUP'; status.className = `td-status ${out.complete ? 'complete' : state.started ? 'live' : 'draft'}`; $('#tdUndo').disabled = !state.resultHistory.length;
}
function renderDashboard() {
  const f = financeModel(), paid = state.roster.filter(p=>p.paid).length, out = outcome(), ready = readyMatches(), totalMatches = bracket?.matches.length || 0;
  $('#tdDashboardMetrics').innerHTML = [['Checked in', state.roster.length], ['Paid', `${paid}/${state.roster.length}`], ['Prize pool', money(f.prizePool)], ['Active boards', Object.keys(state.boardAssignments).length], ['Matches done', `${results.size}/${totalMatches}`], ['Mystery hits', state.mystery.hits.length]].map(([label,value]) => `<article class="td-metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const boardRows = Object.entries(state.boardAssignments).sort((a,b)=>Number(a[0])-Number(b[0])).map(([board,matchId])=>{ const m=matchById(matchId), [a,b]=matchCompetitors(m); return `<div class="td-mini-row"><b>Board ${board} · M${m?.number||'?'}</b><span>${escapeHtml(displayParticipantName(a))} vs ${escapeHtml(displayParticipantName(b))}</span></div>`; }); $('#tdDashboardBoards').innerHTML = `<div class="td-mini-list">${boardRows.join('') || '<div class="td-empty">No active boards.</div>'}</div>`;
  const assigned = new Set(Object.values(state.boardAssignments)), next = ready.filter(m=>!assigned.has(m.id)).slice(0,8).map(m=>{const[a,b]=matchCompetitors(m);return `<div class="td-mini-row"><b>M${m.number}</b><span>${escapeHtml(displayParticipantName(a))} vs ${escapeHtml(displayParticipantName(b))}</span></div>`;}); $('#tdDashboardNext').innerHTML = `<div class="td-mini-list">${next.join('') || '<div class="td-empty">Nothing waiting.</div>'}</div>`;
  $('#tdDashboardMoney').innerHTML = `<div class="td-ledger"><div class="td-ledger-row"><span>Collected</span><strong>${money(f.collected)}</strong></div><div class="td-ledger-row"><span>Projected player pot</span><strong>${money(f.playerPot)}</strong></div><div class="td-ledger-row"><span>Mystery Out</span><strong>${money(f.mysteryTotal)}</strong></div><div class="td-ledger-row total"><span>Prize pool</span><strong>${money(f.prizePool)}</strong></div></div>`;
  $('#tdDashboardResult').innerHTML = `<div class="td-ledger"><div class="td-ledger-row"><span>Mystery target</span><strong>${state.mystery.target || 'Not set'}</strong></div><div class="td-ledger-row"><span>Recorded hits</span><strong>${state.mystery.hits.length}</strong></div><div class="td-ledger-row"><span>Champion</span><strong>${escapeHtml(displayParticipantName(out.champion))}</strong></div><div class="td-ledger-row"><span>Runner-up</span><strong>${escapeHtml(displayParticipantName(out.runnerUp))}</strong></div></div>`;
}
function renderAll() { rebuildBracketFromState(); renderSummary(); renderReadiness(); renderDirectory(); renderRoster(); renderTeams(); renderBracket(); renderBoards(); renderMystery(); renderPayouts(); renderDashboard(); }
function switchTab(tab) { $$('.td-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab)); $$('.td-tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab}`)); if (tab === 'players') loadDirectory(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function setupPublicMode() { const mode = new URLSearchParams(location.search).get('view'); if (mode === 'public' || mode === 'mystery') { document.body.classList.add('public-mode'); if (mode === 'mystery') document.body.classList.add('mystery-display'); setInterval(() => { const next = loadState(); if (next.updatedAt !== state.updatedAt) { state = next; syncSetupForm(); renderAll(); } }, 1500); } }

function bindEvents() {
  $$('.td-tabs button').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  const setupIds = ['tdName','tdDate','tdTime','tdVenue','tdVenueCustom','tdFormat','tdEntrantMode','tdSeeding','tdBoardCount','tdAutoBoards','tdShowReset','tdEntryFee','tdMysteryPerPlayer','tdHoneyAmount','tdHoneyThreshold','tdExpenses','tdBarMatchPot','tdBarMatchMystery'];
  setupIds.forEach(id => $(`#${id}`).addEventListener(id === 'tdName' ? 'input' : 'change', () => { const oldMode = state.meta.entrantMode; readSetupForm(); if (oldMode !== state.meta.entrantMode) { state.teams = []; invalidateTournament(); saveState(); renderAll(); } }));
  $('#tdShowSeeds').addEventListener('change', () => { state.meta.showSeeds = $('#tdShowSeeds').checked; saveState(); renderAll(); }); [1,2,3,4].forEach((n, i) => $(`#tdPayout${n}`).addEventListener('change', () => { state.finance.payoutPercents[i] = Math.max(0, safeNum($(`#tdPayout${n}`).value)); saveState(); renderAll(); }));
  $('#tdPlayerSearch').addEventListener('input', renderDirectory); $('#tdGenderFilter').addEventListener('change', renderDirectory); $('#tdRefreshDirectory').addEventListener('click', () => loadDirectory(true));
  $('#tdManualPlayerForm').addEventListener('submit', e => { e.preventDefault(); const first=$('#tdManualFirst').value.trim(), last=$('#tdManualLast').value.trim(), nick=$('#tdManualNick').value.trim(), gender=$('#tdManualGender').value; if(!first||!gender)return; addRosterPlayer({id:uid('walkin'),name:[first,nick?`"${nick}"`:'',last].filter(Boolean).join(' '),firstName:first,lastName:last,nickname:nick,gender,source:'manual'}); e.target.reset(); });
  $('#tdMarkAllPaid').addEventListener('click', () => { state.roster.forEach(p=>p.paid=true); saveState(); renderAll(); }); $('#tdDrawTeams').addEventListener('click', drawBlindTeams); $('#tdRedrawTeams').addEventListener('click', drawBlindTeams); $('#tdAddFixedTeam').addEventListener('click', addFixedTeam); $('#tdClearTeams').addEventListener('click', () => { state.teams=[]; if(state.started)invalidateTournament(); saveState(); renderAll(); });
  $('#tdStartTournament').addEventListener('click', buildTournament); $('#tdRebuildBracket').addEventListener('click', buildTournament); $('#tdGoPlayers').addEventListener('click', () => switchTab('players')); $('#tdAutoAssignBoards').addEventListener('click', () => autoAssignBoards(true));
  $('#tdMysteryForm').addEventListener('submit', recordMysteryHit); $('#tdMysteryTarget').addEventListener('change', () => { const n=Math.floor(safeNum($('#tdMysteryTarget').value)); if($('#tdMysteryTarget').value && !possibleMasterOuts.has(n)) return toast(`${n} is not a valid Master Out.`, 'error'); state.mystery.target = n || null; saveState(); renderAll(); }); $('#tdSetRandomMystery').addEventListener('click', () => { const valid=[...possibleMasterOuts]; state.mystery.target=valid[Math.floor(Math.random()*valid.length)]; saveState(); renderAll(); });
  $('#tdEvenPayouts').addEventListener('click', () => { state.finance.evenPayouts=!state.finance.evenPayouts; saveState(); renderAll(); toast(state.finance.evenPayouts?'Even-dollar team payouts enabled.':'Exact percentage payouts restored.','success'); }); $('#tdResultForm').addEventListener('submit', saveResult); $('#tdResultCancel').addEventListener('click', () => $('#tdResultDialog').close()); $('#tdUndo').addEventListener('click', undoLastResult);
  $('#tdBoardMode').addEventListener('click', () => switchTab('boards')); $('#tdPublicView').addEventListener('click', () => window.open('/tournament.html?view=public','_blank')); $('#tdMysteryDisplay').addEventListener('click', () => window.open('/tournament.html?view=mystery','_blank')); $('#tdPrint').addEventListener('click', () => window.print());
  $('#tdTheme').addEventListener('click', () => { document.body.classList.toggle('light'); localStorage.setItem('nexus:td:theme', document.body.classList.contains('light')?'light':'dark'); $('#tdTheme').textContent=document.body.classList.contains('light')?'Dark':'Light'; });
  $('#tdResetEvent').addEventListener('click', () => { if (!confirm('Reset this staging tournament? This clears the local roster, bracket, results and pots in this browser.')) return; state=defaults(); saveState(); syncSetupForm(); renderAll(); switchTab('setup'); toast('Staging tournament reset.','success'); });
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY && e.newValue) { state=loadState(); syncSetupForm(); renderAll(); } });
}
function init() { syncSetupForm(); if (localStorage.getItem('nexus:td:theme') === 'light') { document.body.classList.add('light'); $('#tdTheme').textContent='Dark'; } setupPublicMode(); bindEvents(); rebuildBracketFromState(); renderAll(); loadDirectory(); }
init();
