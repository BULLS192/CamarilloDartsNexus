const SUPABASE_URL = 'https://lgefivcocbjrjpfzwfmy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_L9GxbR8iPPRta8AResUJ1w_919i_EOf';

const state = {
  lastMembershipId: null,
  leagueId: null,
  renderToken: 0,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function title(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

async function upsert(table, body, conflictColumn) {
  return request(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
}

async function patch(path, body) {
  return request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

async function currentOrgId() {
  const picker = document.querySelector('#orgPicker');
  const membershipId = picker?.value;
  if (!membershipId) return null;
  const rows = await request(`nexus_organization_memberships?id=eq.${encodeURIComponent(membershipId)}&select=organization_id&limit=1`);
  return rows?.[0]?.organization_id || null;
}

async function canManageLeague(orgId) {
  const picker = document.querySelector('#orgPicker');
  const membershipId = picker?.value;
  if (!membershipId || !orgId) return false;
  const roleRows = await request(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(membershipId)}&select=role_code`);
  const roles = roleRows.map((r) => r.role_code);
  return roles.some((role) => ['owner', 'admin', 'league_director'].includes(role));
}

function isLeaguesView() {
  const heading = document.querySelector('#content .section-head h3');
  return heading?.textContent?.trim() === 'Leagues';
}

async function loadLeagueData(orgId) {
  const leagues = await request(`nexus_competitions?organization_id=eq.${encodeURIComponent(orgId)}&competition_type=eq.league&select=id,name,status,dart_type,competition_mode,platform_key,registration_open,settings&order=created_at.desc`);
  if (!leagues.length) return { leagues, configs: [], seasons: [], divisions: [], teams: [] };
  const ids = leagues.map((l) => l.id).join(',');
  const [configs, seasons, divisions, teams] = await Promise.all([
    request(`nexus_league_configs?competition_id=in.(${ids})&select=*`),
    request(`nexus_seasons?competition_id=in.(${ids})&select=id,competition_id,name,starts_on,ends_on,registration_deadline,status,settings&order=starts_on.desc.nullslast`),
    request(`nexus_league_divisions?competition_id=in.(${ids})&select=id,competition_id,season_id,name,sort_order,status,settings&order=sort_order.asc,name.asc`),
    request(`nexus_teams?competition_id=in.(${ids})&select=id,competition_id,season_id,name,captain_person_id,status&order=name.asc`),
  ]);
  return { leagues, configs, seasons, divisions, teams };
}

function summaryCard(league, config, seasons, divisions, teams, manageable) {
  const currentSeason = seasons.find((s) => s.status === 'active') || seasons.find((s) => s.status === 'registration_open') || seasons[0];
  const teamCount = teams.filter((t) => !currentSeason || !t.season_id || t.season_id === currentSeason.id).length;
  return `<div class="card" data-league-id="${league.id}">
    <div class="section-head">
      <div><div class="eyebrow">${esc(title(league.dart_type))} · ${esc(title(league.competition_mode))}</div><h3>${esc(league.name)}</h3></div>
      <span class="pill ${['active','registration_open','published'].includes(league.status) ? 'active' : ''}">${esc(title(league.status))}</span>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,minmax(0,1fr));margin:12px 0">
      <div class="kpi"><strong>${esc(seasons.length)}</strong><span>Seasons</span></div>
      <div class="kpi"><strong>${esc(teamCount)}</strong><span>Teams</span></div>
      <div class="kpi"><strong>${esc(divisions.length)}</strong><span>Divisions</span></div>
      <div class="kpi"><strong>${esc(config ? title(config.schedule_format) : 'Not set')}</strong><span>Schedule</span></div>
    </div>
    <div class="muted">${config ? `Roster ${config.roster_min}${config.roster_max ? `–${config.roster_max}` : '+'} · ${config.starters_per_match} starters · ${config.points_win}/${config.points_draw}/${config.points_loss} pts W/D/L` : 'League rules have not been configured yet.'}</div>
    ${manageable ? `<div style="margin-top:14px"><button class="btn primary" data-manage-league="${league.id}">${config ? 'Manage league' : 'Configure league'}</button></div>` : ''}
  </div>`;
}

function builderHtml(league, config, seasons, divisions, teams) {
  const c = config || {
    roster_min: 1,
    roster_max: '',
    starters_per_match: 1,
    allow_substitutes: true,
    max_substitutes: '',
    schedule_format: 'single_round_robin',
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    standings_tiebreakers: ['points', 'leg_diff', 'legs_for', 'wins', 'id'],
  };
  const seasonOptions = [`<option value="">League-wide / no season</option>`, ...seasons.map((s) => `<option value="${s.id}">${esc(s.name)} · ${esc(title(s.status))}</option>`)].join('');
  return `<div class="card" id="leagueEditor" style="margin-top:20px">
    <div class="section-head"><div><div class="eyebrow">LEAGUE BUILDER · V1.2.1</div><h3>${esc(league.name)}</h3><p>These rules belong to this league record, not to ${esc(document.querySelector('#orgName')?.textContent || 'the organization')} code.</p></div><button class="btn ghost" id="closeLeagueBuilder">Close</button></div>

    <form id="leagueConfigForm" class="grid">
      <input type="hidden" name="competition_id" value="${league.id}">
      <label>Minimum roster<input type="number" min="1" name="roster_min" value="${esc(c.roster_min)}" required></label>
      <label>Maximum roster<input type="number" min="1" name="roster_max" value="${esc(c.roster_max ?? '')}" placeholder="No maximum"></label>
      <label>Starters per match<input type="number" min="1" name="starters_per_match" value="${esc(c.starters_per_match)}" required></label>
      <label>Maximum substitutes<input type="number" min="0" name="max_substitutes" value="${esc(c.max_substitutes ?? '')}" placeholder="No maximum"></label>
      <label>Schedule format<select name="schedule_format">
        <option value="single_round_robin" ${c.schedule_format === 'single_round_robin' ? 'selected' : ''}>Single Round Robin</option>
        <option value="double_round_robin" ${c.schedule_format === 'double_round_robin' ? 'selected' : ''}>Double Round Robin</option>
        <option value="custom" ${c.schedule_format === 'custom' ? 'selected' : ''}>Custom</option>
      </select></label>
      <label>Win points<input type="number" step="0.5" name="points_win" value="${esc(c.points_win)}"></label>
      <label>Draw points<input type="number" step="0.5" name="points_draw" value="${esc(c.points_draw)}"></label>
      <label>Loss points<input type="number" step="0.5" name="points_loss" value="${esc(c.points_loss)}"></label>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="allow_substitutes" ${c.allow_substitutes ? 'checked' : ''} style="width:auto"> Allow substitutes</label>
      <label style="grid-column:1/-1">Standings tiebreakers<input name="standings_tiebreakers" value="${esc((c.standings_tiebreakers || []).join(', '))}" placeholder="points, leg_diff, legs_for, wins, id"></label>
      <div><button class="btn primary" type="submit">Save league rules</button></div>
    </form>
    <div id="leagueConfigStatus" class="muted" style="margin-top:8px"></div>

    <div class="section-head" style="margin-top:26px"><div><h3>Seasons</h3><p>Each season can carry its own dates, registration window, teams and divisions.</p></div></div>
    ${seasons.length ? `<div class="table"><div class="row head"><span>Season</span><span>Status</span><span>Start</span><span>End</span></div>${seasons.map((s) => `<div class="row"><b>${esc(s.name)}</b><span>${esc(title(s.status))}</span><span class="muted">${esc(s.starts_on || 'TBA')}</span><span class="muted">${esc(s.ends_on || 'TBA')}</span></div>`).join('')}</div>` : '<div class="empty">No seasons yet.</div>'}
    <form id="seasonForm" class="grid" style="margin-top:14px">
      <input type="hidden" name="competition_id" value="${league.id}">
      <label>Season name<input name="name" required placeholder="Spring 2027"></label>
      <label>Starts<input type="date" name="starts_on"></label>
      <label>Ends<input type="date" name="ends_on"></label>
      <label>Status<select name="status"><option value="upcoming">Upcoming</option><option value="registration_open">Registration Open</option><option value="active">Active</option></select></label>
      <div><button class="btn primary" type="submit">Add season</button></div>
    </form>

    <div class="section-head" style="margin-top:26px"><div><h3>Divisions</h3><p>Divisions are optional and can be league-wide or season-specific.</p></div></div>
    ${divisions.length ? `<div class="table"><div class="row head"><span>Division</span><span>Season</span><span>Status</span><span>Order</span></div>${divisions.map((d) => `<div class="row"><b>${esc(d.name)}</b><span>${esc(seasons.find((s) => s.id === d.season_id)?.name || 'League-wide')}</span><span>${esc(title(d.status))}</span><span>${esc(d.sort_order)}</span></div>`).join('')}</div>` : '<div class="empty">No divisions configured.</div>'}
    <form id="divisionForm" class="grid" style="margin-top:14px">
      <input type="hidden" name="competition_id" value="${league.id}">
      <label>Division name<input name="name" required placeholder="Premier"></label>
      <label>Season<select name="season_id">${seasonOptions}</select></label>
      <label>Sort order<input type="number" name="sort_order" value="0"></label>
      <div><button class="btn primary" type="submit">Add division</button></div>
    </form>

    <div class="section-head" style="margin-top:26px"><div><h3>Schedule readiness</h3><p>The round-robin engine is already implemented and validated for odd/even team counts. Schedule publishing will be enabled once teams are assigned to this season/division.</p></div></div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="kpi"><strong>${esc(teams.length)}</strong><span>Teams</span></div>
      <div class="kpi"><strong>${esc(c.schedule_format === 'double_round_robin' ? '2×' : c.schedule_format === 'single_round_robin' ? '1×' : 'Custom')}</strong><span>Pairings</span></div>
      <div class="kpi"><strong>${teams.length >= 2 ? 'Ready' : 'Needs teams'}</strong><span>Generator</span></div>
    </div>
  </div>`;
}

async function saveConfig(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const rosterMin = Number(form.get('roster_min'));
  const rosterMax = form.get('roster_max') ? Number(form.get('roster_max')) : null;
  const starters = Number(form.get('starters_per_match'));
  const maxSubs = form.get('max_substitutes') ? Number(form.get('max_substitutes')) : null;
  if (rosterMax !== null && rosterMax < rosterMin) {
    document.querySelector('#leagueConfigStatus').textContent = 'Maximum roster cannot be lower than minimum roster.';
    return;
  }
  if (starters < 1 || (rosterMax !== null && starters > rosterMax)) {
    document.querySelector('#leagueConfigStatus').textContent = 'Starters must fit within the configured roster.';
    return;
  }
  const payload = {
    competition_id: form.get('competition_id'),
    roster_min: rosterMin,
    roster_max: rosterMax,
    starters_per_match: starters,
    allow_substitutes: form.get('allow_substitutes') === 'on',
    max_substitutes: maxSubs,
    schedule_format: form.get('schedule_format'),
    points_win: Number(form.get('points_win')),
    points_draw: Number(form.get('points_draw')),
    points_loss: Number(form.get('points_loss')),
    standings_tiebreakers: String(form.get('standings_tiebreakers') || '').split(',').map((x) => x.trim()).filter(Boolean),
  };
  const status = document.querySelector('#leagueConfigStatus');
  status.textContent = 'Saving…';
  try {
    await upsert('nexus_league_configs', payload, 'competition_id');
    status.textContent = 'League rules saved.';
    await refreshAddon(true);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function addSeason(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    competition_id: form.get('competition_id'),
    name: String(form.get('name') || '').trim(),
    status: form.get('status'),
    settings: {},
  };
  if (form.get('starts_on')) payload.starts_on = form.get('starts_on');
  if (form.get('ends_on')) payload.ends_on = form.get('ends_on');
  try {
    await insert('nexus_seasons', payload);
    await refreshAddon(true);
  } catch (error) {
    alert(error.message);
  }
}

async function addDivision(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    competition_id: form.get('competition_id'),
    name: String(form.get('name') || '').trim(),
    sort_order: Number(form.get('sort_order') || 0),
    status: 'active',
    settings: {},
  };
  if (form.get('season_id')) payload.season_id = form.get('season_id');
  try {
    await insert('nexus_league_divisions', payload);
    await refreshAddon(true);
  } catch (error) {
    alert(error.message);
  }
}

function wireBuilder(data) {
  document.querySelectorAll('[data-manage-league]').forEach((button) => button.addEventListener('click', () => {
    state.leagueId = button.dataset.manageLeague;
    renderBuilder(data);
  }));
}

function renderBuilder(data) {
  const host = document.querySelector('#nexusLeagueBuilderAddon');
  if (!host || !state.leagueId) return;
  const league = data.leagues.find((l) => l.id === state.leagueId);
  if (!league) return;
  const config = data.configs.find((c) => c.competition_id === league.id);
  const seasons = data.seasons.filter((s) => s.competition_id === league.id);
  const divisions = data.divisions.filter((d) => d.competition_id === league.id);
  const teams = data.teams.filter((t) => t.competition_id === league.id);
  host.insertAdjacentHTML('beforeend', builderHtml(league, config, seasons, divisions, teams));
  document.querySelector('#closeLeagueBuilder')?.addEventListener('click', () => { state.leagueId = null; refreshAddon(); });
  document.querySelector('#leagueConfigForm')?.addEventListener('submit', saveConfig);
  document.querySelector('#seasonForm')?.addEventListener('submit', addSeason);
  document.querySelector('#divisionForm')?.addEventListener('submit', addDivision);
  document.querySelector('#leagueEditor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshAddon(preserveEditor = false) {
  if (!isLeaguesView() || !session()?.access_token) return;
  const token = ++state.renderToken;
  const orgId = await currentOrgId();
  if (!orgId || token !== state.renderToken) return;
  const manageable = await canManageLeague(orgId);
  const data = await loadLeagueData(orgId);
  if (token !== state.renderToken || !isLeaguesView()) return;

  document.querySelector('#nexusLeagueBuilderAddon')?.remove();
  const host = document.createElement('div');
  host.id = 'nexusLeagueBuilderAddon';
  host.innerHTML = `<div class="section-head" style="margin-top:28px"><div><div class="eyebrow">UNIVERSAL LEAGUE ENGINE</div><h3>League Builder</h3><p>Configure each league once; Space City, TDT, Camarillo and future organizations all use the same engine.</p></div></div>${data.leagues.length ? `<div class="stack">${data.leagues.map((league) => summaryCard(league, data.configs.find((c) => c.competition_id === league.id), data.seasons.filter((s) => s.competition_id === league.id), data.divisions.filter((d) => d.competition_id === league.id), data.teams.filter((t) => t.competition_id === league.id), manageable)).join('')}</div>` : '<div class="empty">Create a league above to begin configuring seasons, roster rules, divisions and schedules.</div>'}`;
  document.querySelector('#content')?.appendChild(host);
  wireBuilder(data);
  if (preserveEditor && state.leagueId) renderBuilder(data);
}

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (isLeaguesView() && !document.querySelector('#nexusLeagueBuilderAddon')) refreshAddon();
  }, 80);
});

function start() {
  const content = document.querySelector('#content');
  if (!content) return;
  observer.observe(content, { childList: true, subtree: true });
  document.querySelector('#orgPicker')?.addEventListener('change', () => {
    state.leagueId = null;
    setTimeout(refreshAddon, 120);
  });
  setTimeout(refreshAddon, 120);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
