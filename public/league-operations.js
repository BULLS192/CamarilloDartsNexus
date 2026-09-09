const SUPABASE_URL = 'https://lgefivcocbjrjpfzwfmy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_L9GxbR8iPPRta8AResUJ1w_919i_EOf';

function session() {
  try { return JSON.parse(localStorage.getItem('nexus_org_session') || 'null'); }
  catch { return null; }
}

function headers(extra = {}) {
  const token = session()?.access_token;
  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: token ? `Bearer ${token}` : '',
    Accept: 'application/json',
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.error || text || `HTTP ${response.status}`);
  return data;
}

async function insert(table, body) {
  return request(table, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

async function rpc(name, body) {
  return request(`rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function title(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function rotate(items) {
  const fixed = items[0];
  const rest = items.slice(1);
  rest.unshift(rest.pop());
  return [fixed, ...rest];
}

export function generateRoundRobinPreview(teamIds, { doubleRoundRobin = false } = {}) {
  const clean = (teamIds || []).filter(Boolean);
  if (clean.length < 2) throw new Error('At least two teams are required');
  if (new Set(clean).size !== clean.length) throw new Error('Teams must be unique');
  const BYE = '__NEXUS_BYE__';
  let ring = clean.length % 2 === 0 ? [...clean] : [...clean, BYE];
  const first = [];

  for (let roundIndex = 0; roundIndex < ring.length - 1; roundIndex += 1) {
    const matches = [];
    const byes = [];
    for (let i = 0; i < ring.length / 2; i += 1) {
      const left = ring[i];
      const right = ring[ring.length - 1 - i];
      if (left === BYE || right === BYE) {
        byes.push(left === BYE ? right : left);
        continue;
      }
      const swap = i === 0 && roundIndex % 2 === 1;
      matches.push({ homeTeamId: swap ? right : left, awayTeamId: swap ? left : right });
    }
    first.push({ roundNumber: roundIndex + 1, matches, byes });
    ring = rotate(ring);
  }

  if (!doubleRoundRobin) return first;
  const offset = first.length;
  return first.concat(first.map((round, index) => ({
    roundNumber: offset + index + 1,
    matches: round.matches.map((m) => ({ homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId })),
    byes: [...round.byes],
  })));
}

async function currentOrgId() {
  const membershipId = document.querySelector('#orgPicker')?.value;
  if (!membershipId) return null;
  const rows = await request(`nexus_organization_memberships?id=eq.${encodeURIComponent(membershipId)}&select=organization_id&limit=1`);
  return rows?.[0]?.organization_id || null;
}

function activeLeagueId() {
  return document.querySelector('#leagueConfigForm input[name="competition_id"]')?.value || null;
}

async function loadOps(leagueId) {
  const [leagueRows, seasons, divisions, teams, assignments, configRows, matches] = await Promise.all([
    request(`nexus_competitions?id=eq.${encodeURIComponent(leagueId)}&select=id,name,organization_id,status`),
    request(`nexus_seasons?competition_id=eq.${encodeURIComponent(leagueId)}&select=id,name,status,starts_on,ends_on&order=created_at.asc`),
    request(`nexus_league_divisions?competition_id=eq.${encodeURIComponent(leagueId)}&select=id,season_id,name,sort_order,status&order=sort_order.asc,name.asc`),
    request(`nexus_teams?competition_id=eq.${encodeURIComponent(leagueId)}&select=id,season_id,name,status,captain_person_id&order=name.asc`),
    request(`nexus_team_divisions?select=team_id,division_id`),
    request(`nexus_league_configs?competition_id=eq.${encodeURIComponent(leagueId)}&select=schedule_format`),
    request(`nexus_matches?competition_id=eq.${encodeURIComponent(leagueId)}&select=id,season_id,round_number,status&order=round_number.asc,match_number.asc`),
  ]);
  return {
    league: leagueRows[0], seasons, divisions, teams,
    assignments: assignments.filter((a) => teams.some((t) => t.id === a.team_id)),
    config: configRows[0] || { schedule_format: 'single_round_robin' }, matches,
  };
}

function seasonOptions(seasons, includeLeagueWide = true) {
  return `${includeLeagueWide ? '<option value="">League-wide / no season</option>' : ''}${seasons.map((s) => `<option value="${s.id}">${esc(s.name)} · ${esc(title(s.status))}</option>`).join('')}`;
}

function divisionOptions(divisions) {
  return `<option value="">No division</option>${divisions.map((d) => `<option value="${d.id}" data-season-id="${esc(d.season_id || '')}">${esc(d.name)}</option>`).join('')}`;
}

function teamRows(data) {
  if (!data.teams.length) return '<div class="empty">No teams yet. Add the first team below.</div>';
  return `<div class="table"><div class="row head"><span>Team</span><span>Season</span><span>Division</span><span>Status</span></div>${data.teams.map((team) => {
    const assignment = data.assignments.find((a) => a.team_id === team.id);
    const division = data.divisions.find((d) => d.id === assignment?.division_id);
    const season = data.seasons.find((s) => s.id === team.season_id);
    return `<div class="row"><b>${esc(team.name)}</b><span>${esc(season?.name || 'League-wide')}</span><span>${esc(division?.name || '—')}</span><span>${esc(title(team.status))}</span></div>`;
  }).join('')}</div>`;
}

function scopeTeams(data, seasonId) {
  return data.teams.filter((t) => (t.season_id || '') === (seasonId || '') && t.status === 'active');
}

function renderPreview(rounds, teams) {
  const names = new Map(teams.map((t) => [t.id, t.name]));
  return rounds.map((round) => `<div class="card" style="margin-top:10px"><div class="eyebrow">ROUND ${round.roundNumber}</div>${round.matches.map((m) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)"><span>${esc(names.get(m.homeTeamId))}</span><b>vs</b><span>${esc(names.get(m.awayTeamId))}</span></div>`).join('')}${round.byes.length ? `<div class="muted" style="margin-top:8px">Bye: ${round.byes.map((id) => esc(names.get(id))).join(', ')}</div>` : ''}</div>`).join('');
}

function opsHtml(data) {
  const configured = data.seasons.length > 0;
  return `<div id="leagueOpsV122" style="margin-top:28px;border-top:1px solid rgba(255,255,255,.12);padding-top:24px">
    <div class="section-head"><div><div class="eyebrow">LEAGUE OPERATIONS · V1.2.2</div><h3>Teams & Schedule</h3><p>Build the roster of teams, assign them to a season/division, preview the pairings, then create the schedule atomically.</p></div></div>

    <h3 style="margin-top:18px">Teams</h3>
    ${teamRows(data)}
    <form id="nexusTeamForm" class="grid" style="margin-top:14px">
      <label>Team name<input name="name" required placeholder="Team name"></label>
      <label>Season<select name="season_id">${seasonOptions(data.seasons)}</select></label>
      <label>Division<select name="division_id">${divisionOptions(data.divisions)}</select></label>
      <div><button class="btn primary" type="submit">Add team</button></div>
    </form>
    <div id="teamOpsStatus" class="muted" style="margin-top:8px"></div>

    <div class="section-head" style="margin-top:28px"><div><h3>Schedule generator</h3><p>${configured ? 'Choose a season scope with at least two active teams. Existing schedules are protected from accidental replacement.' : 'Create a season above first, then add teams to that season.'}</p></div></div>
    <form id="schedulePreviewForm" class="grid">
      <label>Schedule scope<select name="season_id">${seasonOptions(data.seasons)}</select></label>
      <label>Format<select name="schedule_format">
        <option value="single_round_robin" ${data.config.schedule_format === 'single_round_robin' ? 'selected' : ''}>Single Round Robin</option>
        <option value="double_round_robin" ${data.config.schedule_format === 'double_round_robin' ? 'selected' : ''}>Double Round Robin</option>
      </select></label>
      <div><button class="btn primary" type="submit">Preview schedule</button></div>
    </form>
    <div id="scheduleOpsStatus" class="muted" style="margin-top:8px"></div>
    <div id="schedulePreview"></div>
  </div>`;
}

let currentData = null;
let previewState = null;

async function addTeam(event) {
  event.preventDefault();
  const leagueId = activeLeagueId();
  const orgId = await currentOrgId();
  if (!leagueId || !orgId) return;
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name') || '').trim();
  const seasonId = form.get('season_id') || null;
  const divisionId = form.get('division_id') || null;
  const status = document.querySelector('#teamOpsStatus');
  if (!name) return;
  if (divisionId) {
    const division = currentData?.divisions.find((d) => d.id === divisionId);
    if (division?.season_id && division.season_id !== seasonId) {
      status.textContent = 'That division belongs to a different season.';
      return;
    }
  }
  status.textContent = 'Adding team…';
  try {
    const rows = await insert('nexus_teams', {
      organization_id: orgId,
      competition_id: leagueId,
      season_id: seasonId,
      name,
      status: 'active',
      metadata: { created_via: 'league_ops_v122' },
    });
    const team = rows?.[0];
    if (team && divisionId) {
      await insert('nexus_team_divisions', { team_id: team.id, division_id: divisionId });
    }
    status.textContent = 'Team added.';
    await renderOps();
  } catch (error) {
    status.textContent = error.message;
  }
}

function previewSchedule(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const seasonId = form.get('season_id') || null;
  const format = form.get('schedule_format');
  const teams = scopeTeams(currentData, seasonId);
  const status = document.querySelector('#scheduleOpsStatus');
  const host = document.querySelector('#schedulePreview');
  previewState = null;
  if (teams.length < 2) {
    status.textContent = 'Add at least two active teams to this schedule scope.';
    host.innerHTML = '';
    return;
  }
  const existing = currentData.matches.filter((m) => (m.season_id || '') === (seasonId || '') && m.status !== 'cancelled');
  if (existing.length) {
    status.textContent = `This scope already has ${existing.length} match${existing.length === 1 ? '' : 'es'}. Existing schedules are protected.`;
    host.innerHTML = '';
    return;
  }
  try {
    const rounds = generateRoundRobinPreview(teams.map((t) => t.id), { doubleRoundRobin: format === 'double_round_robin' });
    const matchCount = rounds.reduce((sum, r) => sum + r.matches.length, 0);
    previewState = { seasonId, rounds, teams, format };
    status.textContent = `${rounds.length} rounds · ${matchCount} matches · ${teams.length} teams`;
    host.innerHTML = `${renderPreview(rounds, teams)}<div style="margin-top:16px"><button id="applyScheduleBtn" class="btn primary">Create ${matchCount} scheduled matches</button></div>`;
    document.querySelector('#applyScheduleBtn')?.addEventListener('click', applySchedule);
  } catch (error) {
    status.textContent = error.message;
    host.innerHTML = '';
  }
}

async function applySchedule() {
  if (!previewState) return;
  const leagueId = activeLeagueId();
  const button = document.querySelector('#applyScheduleBtn');
  const status = document.querySelector('#scheduleOpsStatus');
  button.disabled = true;
  status.textContent = 'Creating schedule…';
  try {
    const result = await rpc('nexus_apply_league_schedule', {
      p_competition_id: leagueId,
      p_season_id: previewState.seasonId,
      p_rounds: previewState.rounds,
    });
    status.textContent = `Schedule created: ${result?.round_count ?? previewState.rounds.length} rounds, ${result?.match_count ?? 'all'} matches.`;
    previewState = null;
    await renderOps();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

async function renderOps() {
  const editor = document.querySelector('#leagueEditor');
  const leagueId = activeLeagueId();
  if (!editor || !leagueId || !session()?.access_token) return;
  document.querySelector('#leagueOpsV122')?.remove();
  try {
    currentData = await loadOps(leagueId);
    editor.insertAdjacentHTML('beforeend', opsHtml(currentData));
    document.querySelector('#nexusTeamForm')?.addEventListener('submit', addTeam);
    document.querySelector('#schedulePreviewForm')?.addEventListener('submit', previewSchedule);
  } catch (error) {
    const node = document.createElement('div');
    node.id = 'leagueOpsV122';
    node.className = 'empty';
    node.textContent = `League operations unavailable: ${error.message}`;
    editor.appendChild(node);
  }
}

let timer = null;
const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (document.querySelector('#leagueEditor') && !document.querySelector('#leagueOpsV122')) renderOps();
  }, 80);
}) : null;

function start() {
  const content = document.querySelector('#content');
  if (!content || !observer) return;
  observer.observe(content, { childList: true, subtree: true });
  setTimeout(renderOps, 150);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
