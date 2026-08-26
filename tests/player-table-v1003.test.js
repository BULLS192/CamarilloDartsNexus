import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/public/v1000-rating.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const ui=read('public/v1000-rating.js');
const html=read('public/index.html');
const pkg=JSON.parse(read('package.json'));

const expected="['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS']";
assert.ok(ui.includes(expected),'V0.10.3 must own the canonical 12-column Players schema');
assert.match(ui,/function canonicalize\(t\)/,'metrics owner must structurally canonicalize the live table');
assert.match(ui,/take\('BS50','BS30'\)/,'legacy BS30 must map into the canonical BS50 position');
assert.match(ui,/take\('BS20'\)/,'canonicalization must create or preserve a BS20 position');
assert.match(ui,/take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/,'legacy RATING must be reused as the Nexus Rating cell');
assert.match(ui,/ordered\[9\]\.dataset\.v1003='nexus-rating'/,'Nexus Rating must be cell 9 after canonicalization');
assert.match(ui,/ordered\[10\]\.dataset\.v1003='robustness'/,'Robustness must be cell 10 after canonicalization');
assert.match(ui,/row\.replaceChildren\(\.\.\.ordered\)/,'legacy rows must be structurally rebuilt, not cosmetically relabeled');
assert.match(ui,/headRow\.replaceChildren\(\.\.\.newHeads\)/,'legacy headers must be structurally rebuilt');
assert.match(ui,/headRow\.dataset\.v077='1'/,'legacy V0.7 schema inserter must be prevented from adding duplicate columns');

const canonPos=ui.indexOf('canonicalize(t);');
const ratingPos=ui.indexOf("const ratingIdx=headerIndex(t,'NEXUS RATING')");
assert.ok(canonPos>=0&&ratingPos>canonPos,'table must be canonicalized before metric column indexes are resolved');
assert.doesNotMatch(ui,/const ratingIdx=headerIndex\(t,'NEXUS RATING','BS \/ CD RATING'\)/,'V0.10.3 may not depend on a pre-existing modern rating header');
assert.doesNotMatch(ui,/subtree:true/,'unified metrics renderer must not observe nested cell mutations');
assert.match(ui,/state\.observer\.observe\(body,\{childList:true\}\)/,'renderer must recover when the base app replaces player rows');
assert.match(ui,/state\.observer\.observe\(head,\{childList:true\}\)/,'renderer must recover when a legacy script replaces table headers');

assert.match(html,/v1000-rating\.js\?v=0\.10\.3/,'page must cache-bust the repaired metrics runtime');
assert.match(html,/v1000-rating\.css\?v=0\.10\.3/,'page must cache-bust V0.10.3 metrics styling');
assert.equal(pkg.version,'0.10.3','deployment image must identify as V0.10.3');

console.log('V0.10.3 Players table repair passed: legacy BS30/BS10/RATING schema is rebuilt to BS50/BS20/BS10/Nexus Rating/Robustness before metrics render.');
