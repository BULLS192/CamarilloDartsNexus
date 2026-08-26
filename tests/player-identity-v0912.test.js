import fs from 'node:fs';
import assert from 'node:assert/strict';
import { playerIdentityNames, scoreCandidate } from '../src/dartstoc.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const ui=read('public/v094-player-intel.js'),identity=read('public/v0912-identity.js'),server=read('server.js'),pkg=JSON.parse(read('package.json'));

const player={name:'Jane “BULL” Smith',firstName:'Jane',lastName:'Smith',state:'TX',gender:'female',identityAliases:[{name:'Jane Jones',kind:'maiden-name',verified:true}]};
assert.deepEqual(playerIdentityNames(player),['Jane Smith','Jane Jones']);
const aliasMatch=scoreCandidate(player,{playerName:'JANE JONES',vendorState:'TX',sex:'F'});
assert.ok(aliasMatch.score>=90,`expected strong verified-alias candidate, got ${aliasMatch.score}`);
assert.match(aliasMatch.method,/alias/);

assert.match(ui,/function bsEvidenceGames\(/,'robustness must use evidence/sample counts');
assert.match(ui,/Boolean\(link&&link\.confirmed!==false\)/,'TOC robustness must require an actual confirmed link');
assert.match(ui,/last50PPDSampleSize/,'BullShooter sample-size evidence must be recognized');
assert.match(ui,/currentStatsDiagnostics\?\.x01Count/,'BullShooter diagnostic game counts must be recognized');
assert.match(ui,/identityAliases/,'player search/indexing should recognize verified aliases');
assert.match(server,/\/aliases\$\//,'player alias API route must exist');
assert.match(server,/player_identity_alias_added/,'alias changes must be audited');
assert.match(identity,/MANUAL IDENTITY LINK/);assert.match(identity,/Link to Nexus/);assert.match(identity,/maiden-name/);assert.match(identity,/rememberAlias/);
const v=String(pkg.version).split('.').map(Number);assert.ok(v[0]>0||v[1]>9||(v[1]===9&&v[2]>=12),'package version must be V0.9.12 or later');
console.log('V0.9.12 identity alias, raw linking and robustness checks passed');
