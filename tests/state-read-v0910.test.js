import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/src/store.js')?'/app':process.cwd();
const store=fs.readFileSync(`${root}/src/store.js`,'utf8');
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));

assert.match(store,/rpc\/camarillo_state_read/,'remote state reads must use the authorized RPC');
assert.doesNotMatch(store,/camarillo_app_state\?id=eq\.main&select=state/,'remote state reads must not rely on an RLS-filtered row array');
assert.match(store,/REMOTE_STATE_CACHE_MS/,'remote state reads should have a short in-process cache');
assert.match(store,/remoteStateReadPromise/,'concurrent remote state reads should share one in-flight request');
assert.match(store,/structuredClone/,'cached state must be cloned before being handed to callers');
assert.match(store,/remoteStateCache=cloneRemoteState\(state\);remoteStateCacheAt=Date\.now\(\)/,'successful writes must refresh the state cache immediately');

const version=String(pkg.version||'0.0.0').split('.').map(Number);
assert.ok(version[0]>0||version[1]>9||(version[1]===9&&version[2]>=10),'package version must be V0.9.10 or later');
console.log('V0.9.10+ state-read RPC/cache regression checks passed');
