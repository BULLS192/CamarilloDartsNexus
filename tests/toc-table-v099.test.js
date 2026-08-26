import fs from 'node:fs';
import assert from 'node:assert/strict';
import { canonicalPlayerName, scoreCandidate } from '../src/dartstoc.js';

const root=fs.existsSync('/app/public/v094-player-intel.js')?'/app':process.cwd();
const ui=fs.readFileSync(`${root}/public/v094-player-intel.js`,'utf8');
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));

const player={name:'Laine “THE BLUEBONNET” Lyzak',firstName:'Laine',lastName:'Lyzak',state:'TX',gender:'female'};
const toc={playerName:'LAINE LYZAK',vendorState:'TX',sex:'F'};
assert.equal(canonicalPlayerName(player),'Laine Lyzak');
const scored=scoreCandidate(player,toc);
assert.ok(scored.score>=97,`expected strong canonical TOC match, got ${scored.score}`);
assert.match(scored.method,/exact-name/);

const fallback={name:'Laine “THE BLUEBONNET” Lyzak'};
assert.equal(canonicalPlayerName(fallback),'Laine Lyzak');

const version=String(pkg.version||'0.0.0').split('.').map(Number);
assert.ok(version[0]>0||version[1]>9||(version[1]===9&&version[2]>=9),'package version must be V0.9.9 or later');
assert.match(ui,/cdNexusPlayerColumnsV099/,'V0.9.9 must reset stale column-layout preferences');
assert.match(ui,/row\.insertBefore\(cell,actionCell\)/,'Robustness cell must be inserted directly before the actual action cell');
assert.match(ui,/\^\(edit\|sync\)\$/i,'Action cell must be identified by Edit\/Sync buttons, not a shifted numeric index');
assert.match(ui,/robustHeader.*insertBefore\(robustHeader,actionsHeader\)/s,'Robustness header must sit directly before Actions');

console.log('V0.9.9+ TOC canonical matching and Robustness/Actions layout checks passed');
