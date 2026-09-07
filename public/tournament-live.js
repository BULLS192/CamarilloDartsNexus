import { availableMatches, participantIndex, resolveCompetitor } from '/tournament-brackets.js';

const $ = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const tournamentId = params.get('id');
const els = {
  name: $('#liveName'), status: $('#liveStatus'), state: $('#liveState'), entrants: $('#liveEntrants'),
  boards: $('#liveBoards'), champion: $('#liveChampion'), boardGrid: $('#liveBoardGrid'),
  bracket: $('#liveBracket'), template: $('#liveMatchTemplate'),
};
let snapshot = null;

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const resultMap = () => new Map(Object.entries(snapshot?.results || {}));

function sourceText(source) {
  const bracket = snapshot.bracket;
  const results = resultMap();
  const pIndex = participantIndex(bracket);
  const player = resolveCompetitor(source, results, pIndex);
  if (player) return player.name;
  if (source?.type === 'participant') return bracket.participants.find(p => p.id === source.participantId)?.name || 'TBD';
  if (source?.type === 'winner' || source?.type === 'loser') {
    const number = bracket.matches.find(m => m.id === source.matchId)?.number ?? '?';
    return `${source.type === 'winner' ? 'W' : 'L'}${number}`;
  }
  return 'TBD';
}

function roundLabel(stage, round) {
  if (stage === 'winners') return `Winners R${round}`;
  if (stage === 'losers') return `Losers R${round}`;
  if (stage === 'final') return 'Championship';
  return 'If First Loss';
}

function boardFor(matchId) {
  return snapshot.boards?.find(b => b.matchId === matchId) || null;
}

function renderMatch(match, readyIds) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const done = snapshot.results?.[match.id] || null;
  const board = boardFor(match.id);
  node.querySelector('.td-match-number').textContent = `Match ${match.number}`;
  node.querySelector('.td-match-board').textContent = board ? `Board ${board.number}` : '';
  node.querySelector('.td-match-round').textContent = roundLabel(match.stage, match.round);
  node.querySelector('.td-slot-a').innerHTML = escapeHtml(sourceText(match.sourceA));
  node.querySelector('.td-slot-b').innerHTML = escapeHtml(sourceText(match.sourceB));
  if (readyIds.has(match.id)) node.classList.add('ready');
  if (done) {
    node.classList.add('done');
    const slots = [node.querySelector('.td-slot-a'), node.querySelector('.td-slot-b')];
    const names = [sourceText(match.sourceA), sourceText(match.sourceB)];
    slots.forEach((slot, i) => {
      if (names[i] === done.winner?.name) slot.classList.add('winner');
      if (names[i] === done.loser?.name) slot.classList.add('loser');
    });
    const score = node.querySelector('.td-match-score');
    if (done.scoreA !== null || done.scoreB !== null) score.textContent = `${done.scoreA ?? '–'} – ${done.scoreB ?? '–'}`;
    else score.remove();
  } else node.querySelector('.td-match-score').remove();
  if (match.stage === 'reset') node.classList.add('conditional');
  return node;
}

function renderRounds(title, rounds, readyIds) {
  if (!rounds?.length) return null;
  const section = document.createElement('section');
  section.className = 'td-section';
  const h = document.createElement('h3');
  h.className = 'td-section-title';
  h.textContent = title;
  section.append(h);
  const wrap = document.createElement('div');
  wrap.className = 'td-rounds';
  for (const round of rounds) {
    const col = document.createElement('div');
    col.className = 'td-round';
    const rt = document.createElement('div');
    rt.className = 'td-round-title';
    rt.textContent = `${title === "Winner's Bracket" ? 'Winners' : 'Losers'} Round ${round.round}`;
    col.append(rt);
    round.matches.forEach(m => col.append(renderMatch(m, readyIds)));
    wrap.append(col);
  }
  section.append(wrap);
  return section;
}

function render() {
  if (!snapshot) return;
  els.name.textContent = snapshot.name;
  els.status.textContent = `Updated ${new Date(snapshot.updatedAt).toLocaleTimeString()}`;
  els.state.textContent = snapshot.status;
  els.entrants.textContent = snapshot.entrants?.length ?? 0;
  const busy = (snapshot.boards || []).filter(b => b.matchId).length;
  els.boards.textContent = `${busy}/${snapshot.boards?.length ?? 0} active`;
  els.champion.textContent = snapshot.outcome?.champion?.name || '—';

  els.boardGrid.innerHTML = '';
  for (const board of snapshot.boards || []) {
    const card = document.createElement('div');
    card.className = `td-board-card ${board.matchId ? 'busy' : 'free'}`;
    card.innerHTML = `<strong>Board ${board.number}</strong>`;
    if (!board.matchId) {
      card.insertAdjacentHTML('beforeend', '<span class="td-muted">Free</span>');
    } else {
      const match = snapshot.bracket.matches.find(m => m.id === board.matchId);
      card.insertAdjacentHTML('beforeend', `<span>M${match?.number ?? '?'} · ${escapeHtml(sourceText(match?.sourceA))} vs ${escapeHtml(sourceText(match?.sourceB))}</span>`);
    }
    els.boardGrid.append(card);
  }

  els.bracket.innerHTML = '';
  const results = resultMap();
  const readyIds = new Set(availableMatches(snapshot.bracket, results).map(m => m.id));
  const winners = renderRounds("Winner's Bracket", snapshot.bracket.winnersRounds, readyIds);
  if (winners) els.bracket.append(winners);
  const losers = renderRounds("Loser's Bracket", snapshot.bracket.losersRounds, readyIds);
  if (losers) els.bracket.append(losers);

  if (snapshot.bracket.grandFinal) {
    const section = document.createElement('section');
    section.className = 'td-section';
    const h = document.createElement('h3');
    h.className = 'td-section-title';
    h.textContent = 'Championship';
    section.append(h);
    const row = document.createElement('div');
    row.className = 'td-final-row';
    const gf = document.createElement('div');
    gf.className = 'td-round';
    gf.append(renderMatch(snapshot.bracket.grandFinal, readyIds));
    row.append(gf);
    if (snapshot.bracket.resetFinal) {
      const rf = document.createElement('div');
      rf.className = 'td-round';
      rf.append(renderMatch(snapshot.bracket.resetFinal, readyIds));
      row.append(rf);
    }
    section.append(row);
    els.bracket.append(section);
  }
}

async function refresh() {
  if (!tournamentId) {
    els.status.textContent = 'Missing tournament id';
    return;
  }
  try {
    const res = await fetch(`/api/public/tournaments/${encodeURIComponent(tournamentId)}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    snapshot = body;
    render();
  } catch (error) {
    els.status.textContent = `Unavailable: ${error.message}`;
  }
}

void refresh();
setInterval(refresh, 10000);
