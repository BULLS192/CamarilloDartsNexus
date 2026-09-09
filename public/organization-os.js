const SUPABASE_URL = 'https://lgefivcocbjrjpfzwfmy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_L9GxbR8iPPRta8AResUJ1w_919i_EOf';

const $ = (q) => document.querySelector(q);
const authView = $('#authView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const authStatus = $('#authStatus');
const orgPicker = $('#orgPicker');
const orgMode = $('#orgMode');
const nav = $('#nav');
const content = $('#content');
const orgName = $('#orgName');
const orgType = $('#orgType');
const roleSummary = $('#roleSummary');
const identityMini = $('#identityMini');
const legacyLaunch = $('#legacyLaunch');
const toast = $('#toast');

const state = {
  session: null,
  identity: null,
  memberships: [],
  organizations: [],
  roles: [],
  rolePermissions: [],
  integrations: [],
  selected: null,
  memberRows: [],
  people: [],
  memberRoles: new Map(),
  modules: [],
  platforms: [],
  templates: [],
  venueLinks: [],
  venues: [],
  venuePlatforms: [],
  competitions: [],
  seasons: [],
  teams: [],
  teamMembers: [],
  registrations: [],
  matches: [],
  matchSides: [],
  standings: [],
  view: 'overview',
};

const NAV = [
  ['overview', '⌂', 'Overview', ['organization.view'], 'people'],
  ['members', '◎', 'Members', ['members.view'], 'people'],
  ['competitions', 'C', 'Competitions', ['competitions.view'], 'competitions'],
  ['leagues', 'L', 'Leagues', ['leagues.view'], 'leagues'],
  ['tournaments', 'B', 'Tournaments', ['tournaments.view'], 'tournaments'],
  ['teams', 'T', 'Teams', ['teams.view'], 'teams'],
  ['schedule', 'S', 'Schedule', ['matches.view'], 'matches'],
  ['standings', '≡', 'Standings', ['standings.view'], 'standings'],
  ['results', '✓', 'Results', ['matches.view'], 'matches'],
  ['venues', 'V', 'Venues', ['venues.view'], 'venues'],
  ['admin', '⚙', 'Administration', ['organization.manage'], null],
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3200);
}
function setAuthStatus(message, ok = false) {
  authStatus.textContent = message || '';
  authStatus.style.color = ok ? '#86efac' : '#fca5a5';
}
function fmtDate(value) {
  if (!value) return 'TBA';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'TBA' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function inFilter(ids = []) {
  return ids.length ? `in.(${ids.join(',')})` : null;
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.error || text || `${response.status}`;
    throw new Error(message);
  }
  return body;
}
async function signIn(email, password) {
  return jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}
async function refreshSession(refreshToken) {
  return jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
function saveSession(session) {
  state.session = session;
  localStorage.setItem('nexus_org_session', JSON.stringify(session));
}
function clearSession() {
  state.session = null;
  localStorage.removeItem('nexus_org_session');
}
async function api(path, schema = 'public') {
  if (!state.session?.access_token) throw new Error('No active session.');
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${state.session.access_token}`, Accept: 'application/json', 'Accept-Profile': schema },
  });
}
async function apiWrite(table, method, body, schema = 'public') {
  if (!state.session?.access_token) throw new Error('No active session.');
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${state.session.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Profile': schema,
      'Content-Profile': schema,
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function safeApi(path, schema = 'public') {
  try { return await api(path, schema); }
  catch (error) {
    console.warn(`NEXUS read failed: ${schema}.${path}`, error);
    return [];
  }
}

function currentMembership() { return state.selected; }
function currentOrg() { return state.selected?.organization || null; }
function currentRoleCodes() { return state.selected?.roles?.map((r) => r.role_code) || []; }
function permissionSet() {
  const roles = currentRoleCodes();
  return new Set(state.rolePermissions.filter((r) => roles.includes(r.role_code)).map((r) => r.permission_code));
}
function hasPermission(permission) { return permissionSet().has(permission); }
function canAny(required = []) { return required.length === 0 || required.some(hasPermission); }
function roleLabels() { return currentRoleCodes().map((code) => state.roles.find((r) => r.code === code)?.name || code); }
function moduleEnabled(key) {
  if (!key) return true;
  const row = state.modules.find((m) => m.module_key === key);
  return row ? row.enabled : true;
}
function canCreateType(type) { return type === 'league' ? hasPermission('leagues.create') : hasPermission('tournaments.create'); }

async function loadIdentity() {
  const uid = state.session?.user?.id;
  if (!uid) throw new Error('No Supabase user ID returned.');
  const people = await api(`nexus_people?auth_user_id=eq.${encodeURIComponent(uid)}&select=id,nexus_id,display_name,city,state,is_test&limit=1`);
  state.identity = people?.[0];
  if (!state.identity) throw new Error('This Auth account is not linked to a NEXUS identity.');

  const [memberships, organizations, roles, rolePermissions, integrations] = await Promise.all([
    api(`nexus_organization_memberships?person_id=eq.${encodeURIComponent(state.identity.id)}&status=eq.active&select=id,organization_id,person_id,status`),
    api('nexus_organizations?status=eq.active&select=id,slug,name,organization_type,description&order=name.asc'),
    api('nexus_roles?is_active=eq.true&select=code,name,rank'),
    api('nexus_role_permissions?select=role_code,permission_code'),
    safeApi('nexus_organization_integrations?status=eq.active&select=id,organization_id,integration_key,source_schema,mode,migration_stage,launch_url,capabilities,metadata'),
  ]);

  state.organizations = organizations || [];
  state.roles = roles || [];
  state.rolePermissions = rolePermissions || [];
  state.integrations = integrations || [];
  state.memberships = memberships || [];

  for (const membership of state.memberships) {
    membership.organization = state.organizations.find((o) => o.id === membership.organization_id) || { id: membership.organization_id, name: 'Unknown organization', slug: 'unknown', organization_type: 'organization' };
    membership.roles = await api(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(membership.id)}&select=role_code`);
    membership.integration = state.integrations.find((i) => i.organization_id === membership.organization_id) || null;
  }

  state.memberships.sort((a, b) => a.organization.name.localeCompare(b.organization.name));
  const savedOrgId = localStorage.getItem('nexus_last_org_id');
  state.selected = state.memberships.find((m) => m.organization_id === savedOrgId)
    || state.memberships.find((m) => m.organization.slug === 'space-city-darts')
    || state.memberships[0]
    || null;
  if (!state.selected) throw new Error('This NEXUS identity has no active organization membership.');
}

async function loadOrganization() {
  const membership = currentMembership();
  if (!membership) return;
  const orgId = membership.organization_id;

  state.memberRows = await safeApi(`nexus_organization_memberships?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.active&select=id,organization_id,person_id,status,joined_at`);
  const visiblePeople = await safeApi('nexus_people?status=eq.active&select=id,nexus_id,display_name,nickname,city,state,is_test');
  const memberIds = new Set(state.memberRows.map((r) => r.person_id));
  state.people = (visiblePeople || []).filter((p) => memberIds.has(p.id));
  state.memberRoles = new Map();
  for (const row of state.memberRows) {
    const roles = await safeApi(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(row.id)}&select=role_code,assignment_source`);
    state.memberRoles.set(row.id, roles || []);
  }

  const [modules, platforms, templates, venueLinks, competitions, teams] = await Promise.all([
    safeApi(`nexus_organization_modules?organization_id=eq.${encodeURIComponent(orgId)}&select=module_key,enabled,settings`),
    safeApi('nexus_platforms?active=eq.true&select=key,display_name,category&order=display_name.asc'),
    safeApi('nexus_competition_templates?active=eq.true&select=id,organization_id,name,competition_type,competition_mode,dart_type,platform_key,configuration&order=name.asc'),
    safeApi(`nexus_organization_venues?organization_id=eq.${encodeURIComponent(orgId)}&select=organization_id,venue_id,relationship,is_public,metadata`),
    safeApi(`nexus_competitions?organization_id=eq.${encodeURIComponent(orgId)}&select=id,organization_id,template_id,venue_id,parent_competition_id,name,description,competition_type,competition_mode,dart_type,platform_key,status,schedule_type,starts_at,ends_at,day_of_week,start_time,recurrence_rule,registration_open,is_public,settings,created_at&order=created_at.desc`),
    safeApi(`nexus_teams?organization_id=eq.${encodeURIComponent(orgId)}&select=id,organization_id,competition_id,season_id,name,captain_person_id,status,metadata&order=name.asc`),
  ]);

  state.modules = modules || [];
  state.platforms = platforms || [];
  state.templates = templates || [];
  state.venueLinks = venueLinks || [];
  state.competitions = competitions || [];
  state.teams = teams || [];

  const venueIds = state.venueLinks.map((v) => v.venue_id);
  const compIds = state.competitions.map((c) => c.id);
  const teamIds = state.teams.map((t) => t.id);
  const venueFilter = inFilter(venueIds);
  const compFilter = inFilter(compIds);
  const teamFilter = inFilter(teamIds);

  const [venues, venuePlatforms, seasons, teamMembers, registrations, matches, standings] = await Promise.all([
    venueFilter ? safeApi(`nexus_venues?id=${venueFilter}&select=id,name,address_line1,address_line2,city,state,postal_code,country_code,website_url,maps_url,status,is_public,metadata&order=name.asc`) : [],
    venueFilter ? safeApi(`nexus_venue_platforms?venue_id=${venueFilter}&select=venue_id,platform_key,board_count,metadata`) : [],
    compFilter ? safeApi(`nexus_seasons?competition_id=${compFilter}&select=id,competition_id,name,starts_on,ends_on,registration_deadline,status,settings&order=starts_on.desc`) : [],
    teamFilter ? safeApi(`nexus_team_members?team_id=${teamFilter}&select=team_id,person_id,member_role,status,joined_at`) : [],
    compFilter ? safeApi(`nexus_registrations?competition_id=${compFilter}&select=id,competition_id,season_id,person_id,team_id,registration_type,status,note,created_at`) : [],
    compFilter ? safeApi(`nexus_matches?competition_id=${compFilter}&select=id,competition_id,season_id,venue_id,board_id,round_key,round_number,match_number,scheduled_at,started_at,completed_at,status,winner_side,format,metadata&order=scheduled_at.asc.nullslast`) : [],
    compFilter ? safeApi(`nexus_standings?competition_id=${compFilter}&select=id,competition_id,season_id,entity_type,person_id,team_id,rank,played,wins,losses,draws,points,legs_for,legs_against,tiebreak_data&order=rank.asc.nullslast`) : [],
  ]);

  state.venues = venues || [];
  state.venuePlatforms = venuePlatforms || [];
  state.seasons = seasons || [];
  state.teamMembers = teamMembers || [];
  state.registrations = registrations || [];
  state.matches = matches || [];
  state.standings = standings || [];

  const matchFilter = inFilter(state.matches.map((m) => m.id));
  state.matchSides = matchFilter ? await safeApi(`nexus_match_sides?match_id=${matchFilter}&select=match_id,side_no,participant_type,person_id,team_id,seed,score,is_winner,metadata`) : [];
}

function renderShell() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  orgPicker.innerHTML = state.memberships.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.organization.name)}</option>`).join('');
  orgPicker.value = state.selected.id;

  const org = currentOrg();
  const integration = currentMembership().integration;
  orgName.textContent = org.name;
  orgType.textContent = String(org.organization_type || 'organization').replaceAll('_', ' ').toUpperCase();
  roleSummary.textContent = roleLabels().join(' · ') || 'Member';
  identityMini.innerHTML = `<div class="identity-name">${escapeHtml(state.identity.display_name)}</div><div class="identity-id">${escapeHtml(state.identity.nexus_id)}</div>`;

  if (integration) {
    orgMode.innerHTML = `<span class="pill bridge">MIGRATING</span> Stage ${integration.migration_stage} · Universal NEXUS engine`;
    legacyLaunch.href = integration.launch_url || '#';
    legacyLaunch.classList.toggle('hidden', !integration.launch_url);
  } else {
    orgMode.innerHTML = '<span class="pill active">NATIVE</span> Universal NEXUS engine';
    legacyLaunch.classList.add('hidden');
  }
  renderNav();
  renderView();
}

function renderNav() {
  const available = NAV.filter(([, , , required, moduleKey]) => canAny(required) && moduleEnabled(moduleKey));
  if (!available.some(([key]) => key === state.view)) state.view = 'overview';
  nav.innerHTML = available.map(([key, icon, label]) => `<button class="nav-btn ${state.view === key ? 'active' : ''}" data-view="${key}"><b>${icon}</b><span>${label}</span></button>`).join('');
  nav.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    renderNav();
    renderView();
  }));
}

function renderView() {
  const views = {
    overview: renderOverview,
    members: renderMembers,
    competitions: renderCompetitions,
    leagues: renderLeagues,
    tournaments: renderTournaments,
    teams: renderTeams,
    schedule: renderSchedule,
    standings: renderStandings,
    results: renderResults,
    venues: renderVenues,
    admin: renderAdmin,
  };
  (views[state.view] || renderOverview)();
}

function renderOverview() {
  const org = currentOrg();
  const integration = currentMembership().integration;
  const cards = [[state.memberRows.length, 'Members'], [state.competitions.length, 'Competitions'], [state.venues.length, 'Venues'], [state.matches.length, 'Matches']];
  content.innerHTML = `${integration ? `<div class="legacy-strip"><div><b>TDT migration bridge remains available</b><small>NEXUS is now the target engine. The legacy TDT app remains only while individual write workflows reach parity.</small></div><span class="pill bridge">STAGE ${integration.migration_stage}</span></div>` : ''}
    <section class="hero"><div class="eyebrow">${escapeHtml(org.name)} · NEXUS ORGANIZATION</div><h2>${escapeHtml(state.identity.display_name)}</h2><p>One NEXUS identity, organization-scoped roles, and one shared competition engine for leagues, tournaments, recurring events and challenges.</p></section>
    <div class="kpi-grid">${cards.map(([value, label]) => `<div class="kpi"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    <div class="section-head"><div><h3>Shared NEXUS modules</h3><p>The engine is platform-level; this organization controls only its records and configuration.</p></div></div>
    <div class="module-grid">${NAV.filter(([, , , req, moduleKey]) => canAny(req) && moduleEnabled(moduleKey)).map(([key, , label]) => `<div class="module-card"><b>${escapeHtml(label)}</b><p>${moduleDescription(key)}</p></div>`).join('')}</div>`;
}

function renderMembers() {
  const rows = state.memberRows.map((membership) => {
    const person = state.people.find((p) => p.id === membership.person_id) || {};
    const roles = (state.memberRoles.get(membership.id) || []).map((r) => state.roles.find((role) => role.code === r.role_code)?.name || r.role_code);
    return { ...person, roles };
  });
  content.innerHTML = `<div class="section-head"><div><h3>People & memberships</h3><p>One canonical NEXUS identity per person, with roles scoped to ${escapeHtml(currentOrg().name)}.</p></div><span class="pill active">${rows.length} ACTIVE</span></div>${rows.length ? `<div class="table"><div class="row head"><span>Person</span><span>NEXUS ID</span><span>Roles</span><span>Location</span></div>${rows.map((r) => `<div class="row"><b>${escapeHtml(r.display_name || 'Member')}</b><span class="muted">${escapeHtml(r.nexus_id || '—')}</span><span>${escapeHtml(r.roles.join(', ') || 'Member')}</span><span class="muted">${escapeHtml([r.city, r.state].filter(Boolean).join(', ') || '—')}</span></div>`).join('')}</div>` : '<div class="empty">No members are visible to this role.</div>'}`;
}

function competitionRows(rows) {
  if (!rows.length) return '<div class="empty">No competitions have been configured for this organization yet.</div>';
  return `<div class="table"><div class="row head"><span>Competition</span><span>Type</span><span>Format</span><span>Status</span></div>${rows.map((c) => `<div class="row"><div><b>${escapeHtml(c.name)}</b><div class="muted">${escapeHtml(venueName(c.venue_id))}</div></div><span>${escapeHtml(titleCase(c.competition_type))}</span><span class="muted">${escapeHtml(`${titleCase(c.dart_type)} · ${titleCase(c.competition_mode)}`)}</span><span><span class="pill ${['active', 'published', 'registration_open'].includes(c.status) ? 'active' : ''}">${escapeHtml(titleCase(c.status))}</span></span></div>`).join('')}</div>`;
}

function renderCompetitions() {
  const canCreate = hasPermission('leagues.create') || hasPermission('tournaments.create');
  content.innerHTML = `<div class="section-head"><div><h3>Competitions</h3><p>One engine for leagues, tournaments, weekly events, slings and special events.</p></div>${canCreate ? '<button class="btn primary" id="newCompetitionBtn">+ Create competition</button>' : ''}</div>${competitionRows(state.competitions)}<div id="competitionBuilder"></div>`;
  $('#newCompetitionBtn')?.addEventListener('click', () => renderCompetitionBuilder());
}

function renderCompetitionBuilder(forcedType = null) {
  const allowedTypes = [
    ['league', 'League'],
    ['tournament', 'Tournament'],
    ['weekly_event', 'Weekly Event'],
    ['sling', 'Sling / Challenge'],
    ['special_event', 'Special Event'],
  ].filter(([type]) => canCreateType(type) && (!forcedType || forcedType === type));
  if (!allowedTypes.length) {
    showToast('Your role cannot create this competition type.');
    return;
  }
  const venueOptions = ['<option value="">Venue TBA</option>', ...state.venues.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}${v.city ? ` · ${escapeHtml(v.city)}` : ''}</option>`)].join('');
  const platformOptions = ['<option value="">No platform / mixed</option>', ...state.platforms.map((p) => `<option value="${p.key}">${escapeHtml(p.display_name)}</option>`)].join('');
  const target = $('#competitionBuilder');
  if (!target) return;
  target.innerHTML = `<div class="card" style="margin-top:18px"><div class="section-head"><div><h3>Create NEXUS competition</h3><p>This creates an organization-scoped draft using the shared engine.</p></div></div><form id="competitionForm" class="grid">
    <label>Name<input name="name" required maxlength="120" placeholder="e.g. Tuesday Blind Draw"></label>
    <label>Type<select name="competition_type">${allowedTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
    <label>Dart type<select name="dart_type"><option value="steel">Steel Tip</option><option value="soft">Soft Tip</option><option value="mixed">Mixed</option></select></label>
    <label>Format<select name="competition_mode"><option value="singles">Singles</option><option value="doubles">Doubles</option><option value="team">Team</option><option value="mixed">Mixed</option></select></label>
    <label>Venue<select name="venue_id">${venueOptions}</select></label>
    <label>Platform<select name="platform_key">${platformOptions}</select></label>
    <label>Schedule<select name="schedule_type"><option value="flexible">Flexible / TBD</option><option value="one_time">One Time</option><option value="recurring">Recurring</option><option value="seasonal">Seasonal</option></select></label>
    <label>Day<select name="day_of_week"><option value="">TBD</option>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => `<option value="${i}">${day}</option>`).join('')}</select></label>
    <label>Start time<input type="time" name="start_time"></label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="registration_open" style="width:auto"> Registration open</label>
    <div><button class="btn primary" type="submit">Create draft</button></div>
  </form><div id="competitionFormStatus" class="muted" style="margin-top:10px"></div></div>`;
  $('#competitionForm')?.addEventListener('submit', createCompetition);
}

async function createCompetition(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const type = String(form.get('competition_type') || '');
  if (!canCreateType(type)) {
    showToast('Your role cannot create this competition type.');
    return;
  }
  const payload = {
    organization_id: currentOrg().id,
    name: String(form.get('name') || '').trim(),
    competition_type: type,
    competition_mode: form.get('competition_mode'),
    dart_type: form.get('dart_type'),
    status: 'draft',
    schedule_type: form.get('schedule_type'),
    registration_open: form.get('registration_open') === 'on',
    is_public: true,
    created_by_person_id: state.identity.id,
    settings: { allow_public_registration: false },
  };
  if (form.get('venue_id')) payload.venue_id = form.get('venue_id');
  if (form.get('platform_key')) payload.platform_key = form.get('platform_key');
  if (form.get('day_of_week') !== '') payload.day_of_week = Number(form.get('day_of_week'));
  if (form.get('start_time')) payload.start_time = form.get('start_time');

  const status = $('#competitionFormStatus');
  if (status) status.textContent = 'Creating…';
  try {
    await apiWrite('nexus_competitions', 'POST', payload);
    await loadOrganization();
    if (state.view === 'leagues') renderLeagues();
    else if (state.view === 'tournaments') renderTournaments();
    else renderCompetitions();
    showToast(`${payload.name} created as a draft.`);
  } catch (error) {
    if (status) status.textContent = error.message || 'Unable to create competition.';
  }
}

function renderLeagues() {
  const rows = state.competitions.filter((c) => c.competition_type === 'league');
  content.innerHTML = `<div class="section-head"><div><h3>Leagues</h3><p>League records use the same NEXUS engine as every other organization.</p></div>${hasPermission('leagues.create') ? '<button class="btn primary" id="newLeagueBtn">+ New league</button>' : ''}</div>${competitionRows(rows)}<div id="competitionBuilder"></div>`;
  $('#newLeagueBtn')?.addEventListener('click', () => renderCompetitionBuilder('league'));
}

function renderTournaments() {
  const rows = state.competitions.filter((c) => c.competition_type !== 'league');
  content.innerHTML = `<div class="section-head"><div><h3>Tournaments & events</h3><p>Tournaments, weekly events, slings and special events all use the shared competition engine. Bracket Engine V2 plugs into these records next.</p></div>${hasPermission('tournaments.create') ? '<button class="btn primary" id="newTournamentBtn">+ New event</button>' : ''}</div>${competitionRows(rows)}<div id="competitionBuilder"></div>`;
  $('#newTournamentBtn')?.addEventListener('click', () => renderCompetitionBuilder());
}

function renderTeams() {
  content.innerHTML = `<div class="section-head"><div><h3>Teams</h3><p>Organization-scoped teams and captains backed by the universal NEXUS roster model.</p></div></div>${state.teams.length ? `<div class="table"><div class="row head"><span>Team</span><span>Competition</span><span>Captain</span><span>Status</span></div>${state.teams.map((team) => `<div class="row"><b>${escapeHtml(team.name)}</b><span>${escapeHtml(competitionName(team.competition_id))}</span><span class="muted">${escapeHtml(personName(team.captain_person_id))}</span><span class="pill ${team.status === 'active' ? 'active' : ''}">${escapeHtml(titleCase(team.status))}</span></div>`).join('')}</div>` : '<div class="empty">No teams have been created yet.</div>'}`;
}

function renderSchedule() {
  content.innerHTML = `<div class="section-head"><div><h3>Schedule</h3><p>League and tournament matches converge into the same match engine.</p></div></div>${state.matches.length ? `<div class="stack">${state.matches.slice(0, 60).map((match) => { const sides = sidesFor(match.id); return `<div class="card"><div class="row" style="grid-template-columns:1.4fr .8fr .8fr .7fr;padding:0;border:0"><b>${escapeHtml(sideName(sides[0]))} vs ${escapeHtml(sideName(sides[1]))}</b><span>${escapeHtml(fmtDate(match.scheduled_at))}</span><span class="muted">${escapeHtml(venueName(match.venue_id))}</span><span class="pill ${match.status === 'final' ? 'active' : ''}">${escapeHtml(titleCase(match.status))}</span></div></div>`; }).join('')}</div>` : '<div class="empty">No matches have been generated yet.</div>'}`;
}

function renderStandings() {
  const rows = [...state.standings].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || Number(b.points || 0) - Number(a.points || 0));
  content.innerHTML = `<div class="section-head"><div><h3>Standings</h3><p>Shared standings records for person- and team-based competitions.</p></div></div>${rows.length ? `<div class="table"><div class="row head"><span>Entry</span><span>Played</span><span>Record</span><span>Points</span></div>${rows.map((row) => `<div class="row"><b>${escapeHtml(row.entity_type === 'team' ? teamName(row.team_id) : personName(row.person_id))}</b><span>${escapeHtml(row.played)}</span><span class="muted">${escapeHtml(`${row.wins || 0}-${row.losses || 0}-${row.draws || 0}`)}</span><b>${escapeHtml(row.points)}</b></div>`).join('')}</div>` : '<div class="empty">No standings have been calculated yet.</div>'}`;
}

function renderResults() {
  const finals = state.matches.filter((match) => match.status === 'final');
  content.innerHTML = `<div class="section-head"><div><h3>Results</h3><p>Finalized results from the universal match engine.</p></div></div>${finals.length ? `<div class="stack">${finals.slice(-40).reverse().map((match) => { const sides = sidesFor(match.id); return `<div class="card"><b>${escapeHtml(sideName(sides[0]))} ${escapeHtml(sides[0]?.score ?? '—')} – ${escapeHtml(sides[1]?.score ?? '—')} ${escapeHtml(sideName(sides[1]))}</b><div class="muted">${escapeHtml(competitionName(match.competition_id))} · ${escapeHtml(fmtDate(match.completed_at || match.scheduled_at))}</div></div>`; }).join('')}</div>` : '<div class="empty">No finalized results yet.</div>'}`;
}

function renderVenues() {
  content.innerHTML = `<div class="section-head"><div><h3>Venues</h3><p>Global NEXUS venue records linked to ${escapeHtml(currentOrg().name)}. A venue can serve multiple organizations without duplication.</p></div><span class="pill active">${state.venues.length} LINKED</span></div>${state.venues.length ? `<div class="table"><div class="row head"><span>Venue</span><span>Location</span><span>Dart systems</span><span>Relationship</span></div>${state.venues.map((venue) => { const link = state.venueLinks.find((x) => x.venue_id === venue.id); const platforms = state.venuePlatforms.filter((x) => x.venue_id === venue.id).map((x) => platformName(x.platform_key)); return `<div class="row"><div><b>${escapeHtml(venue.name)}</b><div class="muted">${escapeHtml(venue.address_line1 || '')}</div></div><span>${escapeHtml([venue.city, venue.state].filter(Boolean).join(', ') || '—')}</span><span class="muted">${escapeHtml(platforms.join(', ') || 'Unspecified')}</span><span>${escapeHtml(titleCase(link?.relationship || 'listed'))}</span></div>`; }).join('')}</div>` : '<div class="empty">No venues are linked to this organization yet. Venue creation/linking controls are the next Organization OS module.</div>'}`;
}

function renderAdmin() {
  const integration = currentMembership().integration;
  content.innerHTML = `<div class="section-head"><div><h3>Organization administration</h3><p>NEXUS platform capabilities are shared; these settings belong only to ${escapeHtml(currentOrg().name)}.</p></div></div><div class="grid"><div class="card"><div class="eyebrow">YOUR ACCESS</div><h3>${escapeHtml(roleLabels().join(' · '))}</h3><p class="muted">${escapeHtml([...permissionSet()].sort().join(' · '))}</p></div><div class="card"><div class="eyebrow">ENGINE MODE</div><h3>Universal NEXUS</h3><p class="muted">${integration ? `TDT migration Stage ${integration.migration_stage}; legacy app remains available during write-parity migration.` : 'No organization-specific engine is required.'}</p></div></div></div><div class="section-head"><div><h3>Enabled modules</h3><p>Module configuration is organization-level; implementation remains NEXUS-level.</p></div></div><div class="module-grid">${state.modules.map((m) => `<div class="module-card"><b>${escapeHtml(titleCase(m.module_key))}</b><p>${m.enabled ? 'Enabled for this organization.' : 'Disabled for this organization.'}</p></div>`).join('')}</div>`;
}

function moduleDescription(key) {
  return ({
    overview: 'Organization snapshot, roles and activity.',
    members: 'Canonical NEXUS identities and organization memberships.',
    competitions: 'One engine for every league, tournament, weekly event and challenge.',
    leagues: 'League configuration, seasons, registration and director controls.',
    tournaments: 'Tournament and recurring-event configuration; Bracket Engine V2 connects here.',
    teams: 'Rosters, captains, lineups and team operations.',
    schedule: 'Universal match scheduling with venue and board assignment.',
    standings: 'Standings derived from finalized competition results.',
    results: 'Finalized match results and future score-confirmation workflow.',
    venues: 'Global venue directory, dart platforms and board inventory.',
    admin: 'Organization module configuration, roles and migration status.',
  })[key] || '';
}
function competitionName(id) { return state.competitions.find((x) => x.id === id)?.name || 'Competition'; }
function teamName(id) { return state.teams.find((x) => x.id === id)?.name || 'Team'; }
function personName(id) { return state.people.find((x) => x.id === id)?.display_name || 'Player'; }
function venueName(id) { return id ? state.venues.find((x) => x.id === id)?.name || 'Venue' : 'Venue TBA'; }
function platformName(key) { return state.platforms.find((x) => x.key === key)?.display_name || titleCase(key); }
function sidesFor(matchId) { return state.matchSides.filter((x) => x.match_id === matchId).sort((a, b) => a.side_no - b.side_no); }
function sideName(side) {
  if (!side) return 'TBD';
  if (side.participant_type === 'team') return teamName(side.team_id);
  if (side.participant_type === 'person') return personName(side.person_id);
  if (side.participant_type === 'bye') return 'BYE';
  return 'TBD';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAuthStatus('Signing in…', true);
  try {
    const session = await signIn($('#email').value.trim(), $('#password').value);
    saveSession(session);
    await loadIdentity();
    await loadOrganization();
    renderShell();
    setAuthStatus('');
  } catch (error) {
    clearSession();
    setAuthStatus(error.message || 'Unable to sign in.');
  }
});

orgPicker.addEventListener('change', async () => {
  const next = state.memberships.find((m) => m.id === orgPicker.value);
  if (!next) return;
  state.selected = next;
  localStorage.setItem('nexus_last_org_id', next.organization_id);
  state.view = 'overview';
  content.innerHTML = '<div class="empty">Loading organization…</div>';
  await loadOrganization();
  renderShell();
  showToast(`Switched to ${next.organization.name}`);
});

$('#logoutBtn').addEventListener('click', async () => {
  try {
    if (state.session?.access_token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${state.session.access_token}` } });
  } catch {}
  clearSession();
  location.reload();
});

(async function restore() {
  const raw = localStorage.getItem('nexus_org_session');
  if (!raw) return;
  try {
    let session = JSON.parse(raw);
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000 && session.refresh_token) session = await refreshSession(session.refresh_token);
    saveSession(session);
    await loadIdentity();
    await loadOrganization();
    renderShell();
  } catch (error) {
    console.warn(error);
    clearSession();
  }
})();
