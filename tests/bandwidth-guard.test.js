import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const server=fs.readFileSync(`${root}/server.js`,'utf8');
const edc=fs.readFileSync(`${root}/src/edc.js`,'utf8');

assert.match(server,/EDC_BACKGROUND_SYNC_MS=Math\.max\(60\*60_000,Number\(process\.env\.EDC_BACKGROUND_SYNC_MS\)\|\|24\*60\*60_000\)/,'EDC background sync must default to 24 hours with a 1-hour minimum');
assert.doesNotMatch(server,/edcStartup=setTimeout\(\(\)=>void refreshEdcBackground\(\),2_000\)/,'EDC must not perform a full source download on every service startup');
assert.match(server,/loadEdcDataset\(\{force:false\}\)/,'EDC background refresh must reuse the source cache instead of forcing a download');
assert.match(edc,/CACHE_MS=Math\.max\(60\*60_000,Number\(process\.env\.EDC_CACHE_MS\)\|\|24\*60\*60_000\)/,'EDC source cache must default to 24 hours with a 1-hour minimum');

console.log('EDC bandwidth guard checks passed');
