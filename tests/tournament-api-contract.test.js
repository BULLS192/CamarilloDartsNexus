import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync(new URL('../deploy/patch-v1200-tournament-director.mjs', import.meta.url), 'utf8');
const store = fs.readFileSync(new URL('../src/tournament-store.js', import.meta.url), 'utf8');
const director = fs.readFileSync(new URL('../public/tournament-director.js', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../public/tournament-live.js', import.meta.url), 'utf8');

for (const route of [
  '/api/tournaments',
  '/api/public/tournaments/',
  '/matches/',
  '/boards/assign',
  '/boards/release',
  '/boards/auto',
]) assert.ok(patch.includes(route), `missing server route contract: ${route}`);

for (const table of ['camarillo_competitions', 'camarillo_matches']) {
  assert.ok(store.includes(table), `missing persistence table: ${table}`);
}
assert.ok(store.includes('expectedRevision'), 'optimistic concurrency contract missing');
assert.ok(director.includes('expectedRevision'), 'director must send optimistic concurrency revision');
assert.ok(director.includes('/tournament-live.html?id='), 'public/TV view link missing');
assert.ok(live.includes('/api/public/tournaments/'), 'live page must use read-only public tournament endpoint');

console.log('Tournament API/UI contract tests passed.');
