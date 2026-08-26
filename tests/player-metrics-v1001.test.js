import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
import {scorePlayerRobustness} from '../src/robustness.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin “BULL.S” Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const rating=computeNexusRating(kevin),robust=scorePlayerRobustness(kevin);
assert.equal(rating.rating,41.3,'Kevin Nexus Rating must remain 41.3');
assert.equal(robust.score,36,'Kevin Robustness must remain R36');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v1000-rating.js'),legacyPlayer=read('public/v094-player-intel.js'),legacyRating=read('public/v0711.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(store,/rpc\/camarillo_player_metrics_index/,'one SQL RPC must provide both rating and robustness');
assert.doesNotMatch(store,/rpc\/camarillo_nexus_rating_index/,'transport must not bypass unified metrics');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(ui,/entry\?\.robustness/);assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/);assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/);assert.match(ui,/Nexus Rating \$\{fmt\(entry\.rating,1\)\}\/150/);assert.match(ui,/window\.CDNexusPlayerMetricsV1001/);assert.doesNotMatch(ui,/subtree:true/);

// V0.10.3 regression: the live V0.10.2 screenshot still had the legacy 10-column schema
// PLAYER | CONTACT | HOME | BULLSHOOTER | BS CURRENT | BS30 | BS10 | CAMARILLO | RATING | ACTIONS.
// The single V0.10 metrics owner must repair that structure before it resolves metric indexes.
const expected="['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS']";
assert.ok(ui.includes(expected),'V0.10.3 must own the canonical 12-column Players schema');
assert.match(ui,/function canonicalize\(t\)/,'metrics owner must structurally canonicalize the live table');
assert.match(ui,/take\('BS50','BS30'\)/,'legacy BS30 must map into the canonical BS50 position');
assert.match(ui,/take\('BS20'\)/,'canonicalization must create or preserve a BS20 position');
assert.match(ui,/take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/,'legacy RATING must be reused as the Nexus Rating cell');
assert.match(ui,/ordered\[9\]\.dataset\.v1003='nexus-rating'/,'Nexus Rating must be cell 9 after canonicalization');
assert.match(ui,/ordered\[10\]\.dataset\.v1003='robustness'/,'Robustness must be cell 10 after canonicalization');
assert.match(ui,/row\.replaceChildren\(\.\.\.ordered\)/,'legacy rows must be structurally rebuilt');
assert.match(ui,/headRow\.replaceChildren\(\.\.\.newHeads\)/,'legacy headers must be structurally rebuilt');
assert.match(ui,/headRow\.dataset\.v077='1'/,'old V0.7 schema inserter must not add duplicate columns after repair');
const canonPos=ui.indexOf('canonicalize(t);'),ratingPos=ui.indexOf("const ratingIdx=headerIndex(t,'NEXUS RATING')");
assert.ok(canonPos>=0&&ratingPos>canonPos,'canonicalization must happen before metric indexes are resolved');
assert.match(ui,/state\.observer\.observe\(body,\{childList:true\}\)/,'renderer must recover when base player rows are replaced');
assert.match(ui,/state\.observer\.observe\(head,\{childList:true\}\)/,'renderer must recover when headers are replaced');

assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
assert.match(html,/v1000-rating\.js\?v=0\.10\.3/,'repaired unified runtime must be cache-busted to V0.10.3');
assert.match(html,/v1000-rating\.css\?v=0\.10\.3/,'repaired metrics CSS must be cache-busted to V0.10.3');
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);assert.ok(legacyEnsure);assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(legacyEnsure[1],/innerHTML|robustness\(p\)|CDNexusRobustnessV0918/);assert.doesNotMatch(legacyPlayer,/s\.src='\/v0918-table\.js/);
const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);assert.ok(patchRatings);assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchRatings[1],/innerHTML|ratingMarkup\(|ratingsFor\(/);
const marker=JSON.parse(read('.v1001-player-metrics-applied'));assert.equal(marker.source,'camarillo_player_metrics_index');assert.deepEqual(marker.owns,['nexus-rating','robustness']);assert.equal(marker.legacyRobustnessRuntime,false);assert.equal(marker.legacyRatingWriter,false);
const tableMarker=JSON.parse(read('.v1003-player-table-applied'));assert.equal(tableMarker.version,'0.10.3');assert.deepEqual(tableMarker.metricCells,{nexusRating:9,robustness:10,actions:11});
assert.equal(pkg.version,'0.10.3','deployment image must identify as V0.10.3');
console.log('V0.10.3 unified player metrics passed: legacy BS30/BS10/RATING table is rebuilt to BS50/BS20/BS10/Nexus Rating/Robustness; Kevin NX41.3 + R36.');
