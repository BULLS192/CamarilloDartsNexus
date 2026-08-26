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
assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
assert.match(html,/v1000-rating\.js\?v=0\.10\.[12]/,'unified V0.10.1+ runtime must remain cache-busted');
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);assert.ok(legacyEnsure);assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(legacyEnsure[1],/innerHTML|robustness\(p\)|CDNexusRobustnessV0918/);assert.doesNotMatch(legacyPlayer,/s\.src='\/v0918-table\.js/);
const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);assert.ok(patchRatings);assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchRatings[1],/innerHTML|ratingMarkup\(|ratingsFor\(/);
const marker=JSON.parse(read('.v1001-player-metrics-applied'));assert.equal(marker.source,'camarillo_player_metrics_index');assert.deepEqual(marker.owns,['nexus-rating','robustness']);assert.equal(marker.legacyRobustnessRuntime,false);assert.equal(marker.legacyRatingWriter,false);
const [major=0,minor=0,patch=0]=String(pkg.version).split('.').map(Number);assert.ok(major>0||minor>10||(minor===10&&patch>=1),'package must be V0.10.1 or later');
console.log('V0.10.1+ unified player metrics passed: one SQL payload, one renderer, Kevin NX41.3 + R36, no legacy cell writers.');
