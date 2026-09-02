import { generateBracket, availableMatches, recordMatchResult, participantIndex, resolveCompetitor, shuffle } from '/tournament-brackets.js';

const $ = sel => document.querySelector(sel);
const els = {
  name: $('#tdName'), format: $('#tdFormat'), seeding: $('#tdSeeding'), participants: $('#tdParticipants'),
  showSeeds: $('#tdShowSeeds'), showReset: $('#tdShowReset'), generate: $('#tdGenerate'), loadNexus: $('#tdLoadNexus'),
  shuffle: $('#tdShuffle'), print: $('#tdPrint'), undo: $('#tdUndo'), message: $('#tdMessage'), summary: $('#tdSummary'),
  bracket: $('#tdBracket'), tournamentLabel: $('#tdTournamentLabel'), bracketTitle: $('#tdBracketTitle'), template: $('#tdMatchTemplate'),
};
let bracket = null;
let results = new Map();
let history = [];

function namesFromInput() { return els.participants.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean); }
function participantObjects() { return namesFromInput().map((name, i) => ({ id: `entry-${i + 1}`, name, seed: i + 1 })); }
function setMessage(text = '') { els.message.textContent = text; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function sourceText(source) {
  const pIndex = participantIndex(bracket);
  const player = resolveCompetitor(source, results, pIndex);
  if (player) return { player, label: player.name };
  if (source?.type === 'participant') return { player: null, label: bracket.participants.find(p => p.id === source.participantId)?.name || 'TBD' };
  if (source?.type === 'winner' || source?.type === 'loser') {
    const number = bracket.matches.find(m => m.id === source.matchId)?.number ?? '?';
    return { player: null, label: `${source.type === 'winner' ? 'W' : 'L'}${number}` };
  }
  return { player: null, label: 'TBD' };
}
function roundLabel(stage, round) {
  if (stage === 'winners') return `Winners R${round}`;
  if (stage === 'losers') return `Losers R${round}`;
  if (stage === 'final') return 'Championship';
  return 'If First Loss';
}
function resultFor(match) { return results.get(match.id); }
function readyIds() { return new Set(availableMatches(bracket, results).map(m => m.id)); }
function isResetActive(match) { return match.stage !== 'reset' || readyIds().has(match.id) || results.has(match.id); }

function renderMatch(match, ready) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  node.dataset.matchId = match.id;
  node.querySelector('.td-match-number').textContent = `Match ${match.number}`;
  node.querySelector('.td-match-round').textContent = roundLabel(match.stage, match.round);
  if (match.stage === 'reset') node.classList.add('conditional');
  const a = sourceText(match.sourceA);
  const b = sourceText(match.sourceB);
  const done = resultFor(match);
  if (ready.has(match.id)) node.classList.add('ready');
  if (done) node.classList.add('done');

  [['.td-slot-a', a], ['.td-slot-b', b]].forEach(([sel, data]) => {
    const btn = node.querySelector(sel);
    const seed = data.player && els.showSeeds.checked ? `<span class="td-seed">${data.player.seed}</span>` : '';
    const label = data.player ? escapeHtml(data.label) : `<span class="td-source">${escapeHtml(data.label)}</span>`;
    btn.innerHTML = `${seed}<span>${label}</span>`;
    btn.disabled = !ready.has(match.id) || !data.player;
    if (done && data.player) btn.classList.add(done.winner.id === data.player.id ? 'winner' : 'loser');
    if (!btn.disabled) btn.addEventListener('click', () => completeMatch(match.id, data.player.id));
  });
  return node;
}

function renderRounds(title, rounds, ready) {
  if (!rounds?.length) return null;
  const section = document.createElement('section'); section.className = 'td-section';
  const h = document.createElement('h3'); h.className = 'td-section-title'; h.textContent = title; section.append(h);
  const wrap = document.createElement('div'); wrap.className = 'td-rounds';
  for (const round of rounds) {
    const col = document.createElement('div'); col.className = 'td-round';
    const rt = document.createElement('div'); rt.className = 'td-round-title'; rt.textContent = `${title === "Winner's Bracket" ? 'Winners' : 'Losers'} Round ${round.round}`; col.append(rt);
    round.matches.forEach(m => col.append(renderMatch(m, ready)));
    wrap.append(col);
  }
  section.append(wrap); return section;
}

function renderFinals(ready) {
  if (!bracket?.grandFinal) return null;
  const section = document.createElement('section'); section.className = 'td-section';
  const h = document.createElement('h3'); h.className = 'td-section-title'; h.textContent = 'Championship'; section.append(h);
  const row = document.createElement('div'); row.className = 'td-final-row';
  const gfCol = document.createElement('div'); gfCol.className = 'td-round'; gfCol.append(renderMatch(bracket.grandFinal, ready)); row.append(gfCol);
  if (els.showReset.checked && bracket.resetFinal) {
    const resetCol = document.createElement('div'); resetCol.className = 'td-round';
    const resetNode = renderMatch(bracket.resetFinal, ready); if (!isResetActive(bracket.resetFinal)) resetNode.style.opacity = '.45';
    resetCol.append(resetNode); row.append(resetCol);
  }
  section.append(row); return section;
}

function render() {
  els.bracket.innerHTML = '';
  if (!bracket) { els.bracket.innerHTML = '<div class="td-empty">Enter participants and generate a bracket.</div>'; return; }
  const ready = readyIds();
  els.tournamentLabel.textContent = els.name.value.trim() || 'NEXUS Tournament';
  els.bracketTitle.textContent = `${bracket.participantCount} Player ${bracket.format === 'double' ? 'Double' : 'Single'} Elimination`;
  const winners = renderRounds("Winner's Bracket", bracket.winnersRounds, ready); if (winners) els.bracket.append(winners);
  const losers = renderRounds("Loser's Bracket", bracket.losersRounds, ready); if (losers) els.bracket.append(losers);
  const finals = renderFinals(ready); if (finals) els.bracket.append(finals);
  const completed = results.size;
  const remaining = bracket.matches.length - completed;
  els.summary.innerHTML = `<b>${bracket.participantCount}</b> participants · <b>${bracket.byeCount}</b> byes · <b>${completed}</b> completed · <b>${remaining}</b> bracket nodes remaining<br>${bracket.format === 'double' ? `${bracket.totalMinimumMatches} matches minimum · ${bracket.totalPossibleMatches} maximum with reset` : `${bracket.totalPossibleMatches} total matches`}`;
  els.undo.disabled = history.length === 0;
}

function generate() {
  try {
    setMessage(); results = new Map(); history = [];
    bracket = generateBracket({ participants: participantObjects(), format: els.format.value, seeding: els.seeding.value });
    render();
  } catch (error) { bracket = null; setMessage(error.message); render(); }
}
function completeMatch(matchId, winnerId) {
  try { results = recordMatchResult(bracket, results, matchId, winnerId); history.push(matchId); setMessage(); render(); }
  catch (error) { setMessage(error.message); }
}
function undoLast() {
  const matchId = history.pop(); if (!matchId) return;
  const number = bracket.matches.find(m => m.id === matchId)?.number ?? Infinity;
  for (const match of bracket.matches) if (match.number >= number) results.delete(match.id);
  history = history.filter(id => (bracket.matches.find(m => m.id === id)?.number ?? Infinity) < number);
  render();
}
async function loadNexusPlayers() {
  try {
    setMessage('Loading NEXUS players…');
    const res = await fetch('/api/players'); if (!res.ok) throw new Error(`NEXUS player load failed (${res.status}).`);
    const payload = await res.json(); const list = Array.isArray(payload) ? payload : (payload.players || payload.items || []);
    const names = list.map(p => p.name || p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ')).filter(Boolean);
    if (!names.length) throw new Error('No player names were returned by NEXUS.');
    els.participants.value = names.slice(0, 128).join('\n');
    setMessage(names.length > 128 ? `Loaded the first 128 of ${names.length} NEXUS players. Remove non-entrants before generating.` : `Loaded ${names.length} NEXUS players. Remove non-entrants before generating.`);
  } catch (error) { setMessage(error.message); }
}

els.generate.addEventListener('click', generate);
els.loadNexus.addEventListener('click', loadNexusPlayers);
els.shuffle.addEventListener('click', () => { els.participants.value = shuffle(namesFromInput()).join('\n'); });
els.undo.addEventListener('click', undoLast);
els.print.addEventListener('click', () => window.print());
els.showSeeds.addEventListener('change', render);
els.showReset.addEventListener('change', render);
els.name.addEventListener('input', () => { if (bracket) render(); });
generate();
