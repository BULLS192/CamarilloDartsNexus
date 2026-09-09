import assert from 'node:assert/strict';
import {
  NEXUS_ROLES,
  NEXUS_PERMISSIONS,
  ROLE_DEFINITIONS,
  effectivePermissions,
  hasPermission,
  highestRole,
  normalizeRoles,
} from '../src/rbac.js';

const R = NEXUS_ROLES;
const P = NEXUS_PERMISSIONS;

assert.deepEqual(normalizeRoles([R.PLAYER, R.PLAYER, 'bogus']), [R.PLAYER]);
assert.equal(highestRole([R.PLAYER, R.CAPTAIN]).code, R.CAPTAIN);
assert.equal(hasPermission([R.OWNER], P.OWNERSHIP_TRANSFER), true);
assert.equal(hasPermission([R.ADMIN], P.OWNERSHIP_TRANSFER), false);
assert.equal(hasPermission([R.ADMIN], P.ORGANIZATION_MANAGE), true);
assert.equal(hasPermission([R.ADMIN], P.VENUES_MANAGE), true);

assert.equal(hasPermission([R.LEAGUE_DIRECTOR], P.LEAGUES_MANAGE), true);
assert.equal(hasPermission([R.LEAGUE_DIRECTOR], P.TOURNAMENTS_MANAGE), false);
assert.equal(hasPermission([R.LEAGUE_DIRECTOR], P.COMPETITIONS_VIEW), true);
assert.equal(hasPermission([R.LEAGUE_DIRECTOR], P.REGISTRATIONS_MANAGE), true);
assert.equal(hasPermission([R.LEAGUE_DIRECTOR], P.VENUES_MANAGE), false);

assert.equal(hasPermission([R.TOURNAMENT_DIRECTOR], P.TOURNAMENTS_MANAGE), true);
assert.equal(hasPermission([R.TOURNAMENT_DIRECTOR], P.LEAGUES_MANAGE), false);
assert.equal(hasPermission([R.TOURNAMENT_DIRECTOR], P.COMPETITIONS_VIEW), true);
assert.equal(hasPermission([R.TOURNAMENT_DIRECTOR], P.MATCHES_VIEW), true);

assert.equal(hasPermission([R.CAPTAIN], P.TEAMS_MANAGE), true);
assert.equal(hasPermission([R.CAPTAIN], P.ROLES_ASSIGN), false);
assert.equal(hasPermission([R.CAPTAIN], P.REGISTRATIONS_VIEW_SELF), true);
assert.equal(hasPermission([R.CAPTAIN], P.REGISTRATIONS_MANAGE), false);

assert.equal(hasPermission([R.PLAYER], P.SCORES_SUBMIT), true);
assert.equal(hasPermission([R.PLAYER], P.SCORES_CONFIRM), false);
assert.equal(hasPermission([R.PLAYER], P.VENUES_VIEW), true);
assert.equal(hasPermission([R.PLAYER], P.STANDINGS_VIEW), true);

assert.equal(hasPermission([R.MEMBER], P.SCORES_SUBMIT), false);
assert.equal(hasPermission([R.MEMBER], P.ORGANIZATION_VIEW), true);
assert.equal(hasPermission([R.MEMBER], P.COMPETITIONS_VIEW), true);
assert.equal(hasPermission([R.MEMBER], P.REGISTRATIONS_VIEW_SELF), false);

const combined = effectivePermissions([R.LEAGUE_DIRECTOR, R.TOURNAMENT_DIRECTOR]);
assert.equal(combined.includes(P.LEAGUES_MANAGE), true);
assert.equal(combined.includes(P.TOURNAMENTS_MANAGE), true);
assert.equal(combined.includes(P.REGISTRATIONS_MANAGE), true);
assert.equal(combined.includes(P.ROLES_ASSIGN), false);

for (const [code, definition] of Object.entries(ROLE_DEFINITIONS)) {
  assert.ok(definition.label, `${code} must have a label`);
  assert.ok(Number.isFinite(definition.rank), `${code} must have a rank`);
  assert.ok(Array.isArray(definition.permissions), `${code} must have permissions`);
}

console.log('NEXUS RBAC V1.2 tests passed.');
