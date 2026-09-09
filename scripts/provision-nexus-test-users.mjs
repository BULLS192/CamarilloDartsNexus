import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSONAS_PATH = path.join(ROOT, 'config', 'nexus-test-personas.json');
const OUTPUT_DIR = path.join(ROOT, 'tmp');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'nexus-test-credentials.json');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const RESET_EXISTING = String(process.env.RESET_EXISTING_TEST_PASSWORDS || '') === '1';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Use a server-only service-role key. Never place it in frontend code or commit it.');
  process.exit(1);
}

const commonHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function request(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: { ...commonHeaders, ...(options.headers || {}) },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function unwrapUser(payload) {
  return payload?.user || payload;
}

function tempPassword() {
  const body = crypto.randomBytes(12).toString('base64url');
  return `Nx!${body}9a`;
}

async function listUsers() {
  const payload = await request('/auth/v1/admin/users?page=1&per_page=1000');
  return payload?.users || [];
}

async function createUser(persona, password) {
  const payload = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: persona.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: persona.displayName },
      app_metadata: { nexus_test_persona: true },
    }),
  });
  return unwrapUser(payload);
}

async function updatePassword(userId, password) {
  const payload = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
  return unwrapUser(payload);
}

async function getOne(table, filters, select = '*') {
  const params = new URLSearchParams({ select, limit: '1' });
  for (const [key, value] of Object.entries(filters)) params.set(key, `eq.${value}`);
  const rows = await request(`/rest/v1/${table}?${params.toString()}`);
  return rows?.[0] || null;
}

async function insert(table, row, select = '*') {
  const rows = await request(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!Array.isArray(rows) || !rows[0]) throw new Error(`Insert into ${table} returned no row.`);
  if (select === '*') return rows[0];
  return Object.fromEntries(select.split(',').map((key) => [key, rows[0][key]]));
}

async function ensurePerson(authUser, persona) {
  if (!authUser?.id) throw new Error(`Supabase Auth did not return a user ID for ${persona.email}.`);
  let person = await getOne('nexus_people', { auth_user_id: authUser.id });
  if (person) return person;
  person = await insert('nexus_people', {
    auth_user_id: authUser.id,
    display_name: persona.displayName,
    is_test: true,
    force_password_change: false,
    metadata: { persona_key: persona.key },
  });
  return person;
}

async function ensureMembership(person, persona) {
  const organization = await getOne('nexus_organizations', { slug: persona.organizationSlug });
  if (!organization) throw new Error(`Organization not found: ${persona.organizationSlug}`);

  let membership = await getOne('nexus_organization_memberships', {
    organization_id: organization.id,
    person_id: person.id,
  });
  if (!membership) {
    membership = await insert('nexus_organization_memberships', {
      organization_id: organization.id,
      person_id: person.id,
      status: 'active',
      joined_at: new Date().toISOString(),
    });
  }

  for (const roleCode of persona.roles) {
    const existing = await getOne('nexus_membership_roles', {
      membership_id: membership.id,
      role_code: roleCode,
    });
    if (!existing) await insert('nexus_membership_roles', { membership_id: membership.id, role_code: roleCode });
  }

  return { organization, membership };
}

const personas = JSON.parse(await fs.readFile(PERSONAS_PATH, 'utf8'));
const authUsers = await listUsers();
const credentials = [];

for (const persona of personas) {
  let user = authUsers.find((candidate) => String(candidate.email || '').toLowerCase() === persona.email.toLowerCase());
  let password = null;
  let passwordStatus = 'unchanged';

  if (!user) {
    password = tempPassword();
    user = await createUser(persona, password);
    passwordStatus = 'created';
  } else if (RESET_EXISTING) {
    password = tempPassword();
    user = await updatePassword(user.id, password);
    passwordStatus = 'reset';
  }

  const person = await ensurePerson(user, persona);
  const { organization } = await ensureMembership(person, persona);

  credentials.push({
    persona: persona.key,
    displayName: persona.displayName,
    organization: organization.name,
    roles: persona.roles,
    email: persona.email,
    password: password || '(existing password unchanged)',
    passwordStatus,
    nexusId: person.nexus_id,
  });

  console.log(`Provisioned ${persona.key}: ${persona.email} -> ${organization.name} [${persona.roles.join(', ')}]`);
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
console.log(`\nCredentials written locally to ${OUTPUT_PATH}`);
console.log('This file is ignored by Git and must never be committed or shared publicly.');
