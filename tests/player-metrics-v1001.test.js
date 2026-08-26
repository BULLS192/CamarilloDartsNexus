import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
import {scorePlayerRobustness} from '../src/robustness.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin “BULL.S” Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const rating=computeNexusRating(kevin),robust=scorePlayerRobustness(kevin);
assert.equal(rating.rating,41.3,'Kevin Nexus Rating must be 41.3 on native PPD + 10*MPR scale');
assert.equal(robust.score,36,'Kevin Robustness must remain R36 from 41 X01 + 69 Cricket games');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v1000-rating.js'),legacyPlayer=read('public/v094-player-intel.js'),legacyRating=read('public/v0711.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(store,/rpc\/camarillo_player_metrics_index/,'one SQL RPC must provide both rating and robustness');
assert.doesNotMatch(store,/rpc\/camarillo_nexus_rating_index/,'V0.10.1 transport must not call the rating-only RPC');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/,'existing player rating route must proxy unified metrics');
assert.match(ui,/entry\?\.robustness/,'V0.10 runtime must consume nested robustness from the same rating entry');
assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/,'V0.10 runtime must own the Robustness cell');
assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/,'V0.10 runtime must own the Nexus Rating cell');
assert.match(ui,/Nexus Rating \$\{fmt\(entry\.rating,1\)\}\/150/,'Nexus Rating display must use theoretical 150 maximum');
assert.match(ui,/window\.CDNexusPlayerMetricsV1001/,'unified runtime must expose one player-metrics owner');
assert.doesNotMatch(ui,/subtree:true/,'unified renderer may not create nested mutation feedback loops');

assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must not be loaded in V0.10.1');
assert.match(html,/v1000-rating\.js\?v=0\.10\.1/,'unified V0.10.1 runtime must load with cache busting');
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);
assert.ok(legacyEnsure,'legacy Player Intelligence robustness hook must remain available');
assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/,'legacy Player Intelligence must delegate to unified metrics');
assert.doesNotMatch(legacyEnsure[1],/innerHTML|robustness\(p\)|CDNexusRobustnessV0918/,'legacy Player Intelligence may not render Robustness itself');
assert.doesNotMatch(legacyPlayer,/s\.src='\/v0918-table\.js/,'legacy watchdog may not resurrect the obsolete robustness runtime');

const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);
assert.ok(patchRatings,'legacy rating compatibility hook must remain available');
assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/,'legacy rating script must delegate to unified metrics');
assert.doesNotMatch(patchRatings[1],/innerHTML|ratingMarkup\(|ratingsFor\(/,'legacy rating script may not repaint the Nexus Rating cell');

const marker=JSON.parse(read('.v1001-player-metrics-applied'));
assert.equal(marker.version,'0.10.1');assert.equal(marker.source,'camarillo_player_metrics_index');assert.deepEqual(marker.owns,['nexus-rating','robustness']);assert.equal(marker.legacyRobustnessRuntime,false);assert.equal(marker.legacyRatingWriter,false);
assert.equal(pkg.version,'0.10.1');
console.log('V0.10.1 unified player metrics passed: one SQL payload, one renderer, Kevin NX41.3 + R36, no legacy cell writers.');
