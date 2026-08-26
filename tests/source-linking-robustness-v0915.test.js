import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const server=read('server.js'),edc=read('src/edc.js'),playerUi=read('public/v094-player-intel.js'),identityUi=read('public/v0912-identity.js'),tocUi=read('public/v090.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(edc,/export function edcRecordKey\(/,'EDC records need semantic snapshot keys');
assert.match(edc,/recordKey:edcRecordKey\(r\)/,'loaded EDC records must expose recordKey');
assert.match(server,/recordKey=String\(input\.recordKey\|\|edcRecordKey\(snapshot\)\)/,'manual EDC link must retain an exact selected-record fingerprint');
assert.match(server,/setPlayerExternalSource\(p\.id,'edc',edc\)/,'manual EDC link must persist through the external-source store surface');
assert.match(server,/req\.method==='DELETE'/,'unlink routes must remain available');
assert.match(playerUi,/recordKey:record\.recordKey\|\|''/,'main EDC link must send recordKey');
assert.match(playerUi,/Unlink EDC record/,'EDC unlink action must be explicit');
assert.match(playerUi,/window\.CDNexusRobustnessV0915\?\.refresh/,'legacy player-intelligence calls must delegate to the active robustness module');
assert.match(identityUi,/recordKey:eb\.dataset\.recordKey/,'RAW EDC linking must forward recordKey');
assert.match(tocUi,/Unlink this PPD\/TOC record/,'TOC unlink must require explicit confirmation');
if(fs.existsSync(`${root}/src/robustness.js`)){const r=read('src/robustness.js');assert.match(r,/currentStatsDiagnostics\?\.x01Count/,'robustness must use BullShooter X01 evidence');assert.match(r,/currentStatsDiagnostics\?\.cricketCount/,'robustness must use BullShooter Cricket evidence')}else{const r=read('public/v0915-robustness.js');assert.match(r,/currentStatsDiagnostics\?\.x01Count/);assert.match(r,/currentStatsDiagnostics\?\.cricketCount/)}
assert.ok(/^0\.9\.(?:1[5-9]|[2-9]\d)$/.test(pkg.version),`expected V0.9.15+ package, got ${pkg.version}`);
console.log('V0.9.15+ manual EDC identity, unlink and robustness guarantees passed');
