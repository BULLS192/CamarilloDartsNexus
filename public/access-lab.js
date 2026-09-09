const SUPABASE_URL = 'https://lgefivcocbjrjpfzwfmy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_L9GxbR8iPPRta8AResUJ1w_919i_EOf';

const loginForm = document.querySelector('#loginForm');
const logoutBtn = document.querySelector('#logoutBtn');
const statusEl = document.querySelector('#status');
const orgPickerWrap = document.querySelector('#orgPickerWrap');
const orgPicker = document.querySelector('#orgPicker');
const emptyState = document.querySelector('#emptyState');
const dashboard = document.querySelector('#dashboard');
const displayNameEl = document.querySelector('#displayName');
const nexusIdEl = document.querySelector('#nexusId');
const organizationNameEl = document.querySelector('#organizationName');
const orgTypeEl = document.querySelector('#orgType');
const rolesEl = document.querySelector('#roles');
const modulesEl = document.querySelector('#modules');
const permissionsEl = document.querySelector('#permissions');

let session = null;
let identity = null;
let memberships = [];
let organizations = [];
let roleRows = [];
let rolePermissions = [];

const MODULES = [
  { name: 'Organization Home', permission: 'organization.view', description: 'Overview, announcements, schedule and organization navigation.' },
  { name: 'Members', permission: 'members.view', description: 'Organization directory and member/player lookup.' },
  { name: 'Manage Members', permission: 'members.manage', description: 'Invites, membership status and organization access.' },
  { name: 'Leagues', permission: 'leagues.view', description: 'Schedules, divisions, standings and league information.' },
  { name: 'League Control', permission: 'leagues.manage', description: 'Create schedules, manage results and administer a league.' },
  { name: 'Tournaments', permission: 'tournaments.view', description: 'Events, brackets, boards and tournament information.' },
  { name: 'Tournament Control', permission: 'tournaments.manage', description: 'Check-in, seeding, brackets, board calls and results.' },
  { name: 'Teams', permission: 'teams.view', description: 'Rosters, team schedules and lineup information.' },
  { name: 'Team Management', permission: 'teams.manage', description: 'Captain tools for roster and lineup management.' },
  { name: 'Submit Scores', permission: 'scores.submit', description: 'Enter eligible match and game results.' },
  { name: 'Confirm Scores', permission: 'scores.confirm', description: 'Approve or resolve submitted match results.' },
  { name: 'My Stats', permission: 'stats.view_self', description: 'Personal results, form, ratings and history.' },
  { name: 'Organization Analytics', permission: 'stats.view_org', description: 'League, tournament and organization-wide reporting.' },
  { name: 'Organization Settings', permission: 'organization.manage', description: 'Branding, settings and organization configuration.' },
  { name: 'Roles & Permissions', permission: 'roles.assign', description: 'Assign or remove roles for organization members.' },
];

function setStatus(message, ok = false) {
  statusEl.textContent = message || '';
  statusEl.style.color = ok ? '#86efac' : '#fca5a5';
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

async function data(path) {
  if (!session?.access_token) throw new Error('No active session.');
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
  });
}

async function loadIdentity() {
  const userId = session?.user?.id;
  if (!userId) throw new Error('Signed in, but no Supabase user ID was returned.');

  const people = await data(`nexus_people?auth_user_id=eq.${encodeURIComponent(userId)}&select=id,nexus_id,display_name,is_test,force_password_change&limit=1`);
  identity = people?.[0];
  if (!identity) throw new Error('This login exists in Auth but is not linked to a NEXUS person yet.');

  memberships = await data(`nexus_organization_memberships?person_id=eq.${encodeURIComponent(identity.id)}&status=eq.active&select=id,organization_id,status`);
  organizations = await data('nexus_organizations?status=eq.active&select=id,slug,name,organization_type&order=name.asc');
  roleRows = await data('nexus_roles?is_active=eq.true&select=code,name,rank');
  rolePermissions = await data('nexus_role_permissions?select=role_code,permission_code');

  for (const membership of memberships) {
    membership.organization = organizations.find((org) => org.id === membership.organization_id) || { id: membership.organization_id, name: 'Unknown organization' };
    membership.roles = await data(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(membership.id)}&select=role_code`);
  }
}

function renderOrgPicker() {
  orgPicker.innerHTML = memberships.map((membership) => `<option value="${membership.id}">${membership.organization.name}</option>`).join('');
  orgPickerWrap.classList.toggle('hidden', memberships.length <= 1);
}

function renderMembership(membership) {
  const roleCodes = membership.roles.map((row) => row.role_code);
  const permissionSet = new Set(
    rolePermissions
      .filter((row) => roleCodes.includes(row.role_code))
      .map((row) => row.permission_code),
  );

  displayNameEl.textContent = identity.display_name;
  nexusIdEl.textContent = identity.nexus_id;
  organizationNameEl.textContent = membership.organization.name;
  orgTypeEl.textContent = String(membership.organization.organization_type || 'organization').replaceAll('_', ' ');

  const sortedRoles = roleCodes
    .map((code) => roleRows.find((row) => row.code === code) || { code, name: code, rank: 0 })
    .sort((a, b) => b.rank - a.rank);

  rolesEl.innerHTML = sortedRoles.map((role) => `<span class="role">${role.name}</span>`).join('');
  modulesEl.innerHTML = MODULES.map((module) => {
    const allowed = permissionSet.has(module.permission);
    return `<div class="module ${allowed ? '' : 'locked'}"><b>${allowed ? '✓' : '—'} ${module.name}</b><small>${module.description}</small></div>`;
  }).join('');

  permissionsEl.innerHTML = [...permissionSet].sort().map((permission) => `<span class="perm">${permission}</span>`).join('');
  emptyState.classList.add('hidden');
  dashboard.classList.remove('hidden');
}

function resetUi() {
  session = null;
  identity = null;
  memberships = [];
  organizations = [];
  roleRows = [];
  rolePermissions = [];
  dashboard.classList.add('hidden');
  emptyState.classList.remove('hidden');
  orgPickerWrap.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  setStatus('');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Signing in…', true);
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;

  try {
    session = await signIn(email, password);
    await loadIdentity();
    if (!memberships.length) throw new Error('This NEXUS person has no active organization membership.');
    renderOrgPicker();
    renderMembership(memberships[0]);
    logoutBtn.classList.remove('hidden');
    setStatus(`Signed in as ${identity.display_name}.`, true);
  } catch (error) {
    resetUi();
    setStatus(error.message || 'Unable to sign in.');
  }
});

orgPicker.addEventListener('change', () => {
  const membership = memberships.find((row) => row.id === orgPicker.value);
  if (membership) renderMembership(membership);
});

logoutBtn.addEventListener('click', resetUi);
