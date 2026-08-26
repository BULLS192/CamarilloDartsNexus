import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
import {scorePlayerRobustness} from '../src/robustness.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin “BULL.S” Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const rating=computeNexusRating(kevin),robust=scorePlayerRobustness(kevin);
assert.equal(rating.rating,41.3,'Kevin Nexus Rating formula must remain unchanged at 41.3');
assert.equal(robust.score,36,'Kevin Robustness formula must remain unchanged at R36');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v1000-rating.js'),legacyPlayer=read('public/v094-player-intel.js'),legacyBull=read('public/v077.js'),legacyRating=read('public/v0711.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(store,/rpc\/camarillo_player_metrics_index/,'one SQL RPC must provide both rating and robustness');
assert.doesNotMatch(store,/rpc\/camarillo_nexus_rating_index/,'transport must not bypass unified metrics');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(ui,/entry\?\.robustness/);assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/);assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/);assert.match(ui,/Nexus Rating \$\{fmt\(entry\.rating,1\)\}\/150/);assert.match(ui,/window\.CDNexusPlayerMetricsV1001/);assert.doesNotMatch(ui,/subtree:true/);

// V0.10.4 established one canonical owner for all Players-table metric cells.
const expected="['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS']";
assert.ok(ui.includes(expected),'V0.10.5 must retain the canonical 12-column Players schema');
assert.match(ui,/function canonicalize\(t\)/,'metrics owner must structurally canonicalize the live table');
assert.match(ui,/take\('BS50','BS30'\)/,'legacy BS30 must map into the canonical BS50 position');
assert.match(ui,/take\('BS20'\)/,'canonicalization must create or preserve a BS20 position');
assert.match(ui,/take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/,'legacy RATING must be reused as the Nexus Rating cell');
assert.match(ui,/function renderBullshooter\(row,idx,player\)/,'unified renderer must own BullShooter stat cells');
assert.match(ui,/playerIndexes\(\)/,'renderer must build deterministic player identity indexes');
assert.match(ui,/pidx\.byBs\.get\(id\)/,'BullShooter ID must be the first row identity match');
assert.match(ui,/pidx\.byId\.get\(pid\)/,'player ID must be the second row identity match');
assert.match(ui,/pidx\.byName\.get\(key\)/,'unique normalized name must be the final fallback');
assert.match(ui,/renderBullshooter\(row,idx,identity\.player\)/,'BS Current/50/20/10 must render from the matched player, not row order');
assert.match(ui,/Promise\.allSettled\(\[api\('\/api\/players'\),api\('\/api\/players\/nexus-rating'\)\]\)/,'BullShooter data and metrics must load independently');
assert.match(ui,/scheduleRetry\(\)/,'metrics request failures must retry without preventing BullShooter stats from rendering');
assert.match(ui,/ordered\[4\]\.dataset\.v1004='bs-current'/);assert.match(ui,/ordered\[5\]\.dataset\.v1004='bs50'/);assert.match(ui,/ordered\[6\]\.dataset\.v1004='bs20'/);assert.match(ui,/ordered\[7\]\.dataset\.v1004='bs10'/);
assert.match(ui,/ordered\[9\]\.dataset\.v1004='nexus-rating'/);assert.match(ui,/ordered\[10\]\.dataset\.v1004='robustness'/);
assert.match(ui,/row\.replaceChildren\(\.\.\.ordered\)/,'legacy rows must be structurally rebuilt');
assert.match(ui,/headRow\.replaceChildren\(\.\.\.newHeads\)/,'legacy headers must be structurally rebuilt');
assert.match(ui,/headRow\.dataset\.v077='1'/,'old V0.7 schema inserter must not add duplicate columns after repair');
const canonPos=ui.indexOf('canonicalize(t);'),ratingPos=ui.indexOf("rating:headerIndex(t,'NEXUS RATING')");
assert.ok(canonPos>=0&&ratingPos>canonPos,'canonicalization must happen before metric indexes are resolved');
assert.match(ui,/state\.observer\.observe\(body,\{childList:true\}\)/,'renderer must recover when base player rows are replaced/sorted');
assert.match(ui,/state\.observer\.observe\(head,\{childList:true\}\)/,'renderer must recover when headers are replaced');

// V0.10.5 live-production regression: the BullShooter cell may concatenate its
// synced subtext immediately after #123456. A trailing word-boundary rejected those
// rows, and the old textContent name fallback could include male/female subtext.
const parseBs=text=>String(text||'').match(/#\s*(\d{3,})/)?.[1]||'';
assert.equal(parseBs('#267261Synced 8/24/2026'),'267261','live BullShooter IDs must parse even when sync subtext is concatenated');
assert.equal(parseBs('#62894 Synced 8/24/2026'),'62894');
assert.ok(ui.includes("match(/#\\s*(\\d{3,})/)"),'renderer must use the loose hash-digit BullShooter matcher');
assert.ok(!ui.includes("match(/#\\s*(\\d{3,})\\b/)"),'renderer must not require a trailing word boundary after BullShooter ID');
assert.match(ui,/const rowName=row=>/,'renderer must isolate the primary player name');
assert.match(ui,/\[data-player-name\],\.player-name,strong,b/,'primary-name selector must prefer an explicit name element');
assert.match(ui,/replace\(\/\\s\*\(\?:male\|female\)\\s\*\$\/i,''\)/,'fallback name text must strip trailing gender metadata');
assert.match(ui,/const key=norm\(rowName\(row\)\)/,'row identity must use the cleaned player name');
assert.match(ui,/nameKey:norm\(rowName\(row\)\)/,'row identity must preserve the cleaned name key for metric lookup');
assert.match(ui,/identity\.nameKey\|\|norm\(identity\.player\?\.name\|\|''\)/,'metric lookup must use the cleaned row-name key even before a player object resolves');

assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
assert.match(html,/v1000-rating\.js\?v=0\.10\.5/,'live identity-mapped runtime must be cache-busted to V0.10.5');
assert.match(html,/v1000-rating\.css\?v=0\.10\.5/,'metrics CSS must be cache-busted to V0.10.5');
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);assert.ok(legacyEnsure);assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(legacyEnsure[1],/innerHTML|robustness\(p\)|CDNexusRobustnessV0918/);assert.doesNotMatch(legacyPlayer,/s\.src='\/v0918-table\.js/);
const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);assert.ok(patchRatings);assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchRatings[1],/innerHTML|ratingMarkup\(|ratingsFor\(/);
const patchDisplays=legacyBull.match(/async function patchDisplays\(\)\{([\s\S]*?)\n\s*\}\n\n\s*async function enhanceDiagnostics/);assert.ok(patchDisplays,'legacy BullShooter repaint function must remain structurally present');assert.match(patchDisplays[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchDisplays[1],/players\[idx\]|last50PPD|last20PPD|last10PPD|innerHTML/,'legacy BullShooter renderer must not repaint rows by array position');
const marker=JSON.parse(read('.v1001-player-metrics-applied'));assert.equal(marker.version,'0.10.5');assert.equal(marker.source,'camarillo_player_metrics_index');assert.deepEqual(marker.owns,['bs-current','bs50','bs20','bs10','nexus-rating','robustness']);assert.equal(marker.bullshooterIdMatch,'hash-digits-without-trailing-boundary');assert.equal(marker.nameFallback,'primary-name-with-gender-strip');assert.equal(marker.legacyBullshooterWriter,false);assert.equal(marker.legacyRobustnessRuntime,false);assert.equal(marker.legacyRatingWriter,false);
const tableMarker=JSON.parse(read('.v1003-player-table-applied'));assert.equal(tableMarker.version,'0.10.5');assert.deepEqual(tableMarker.statCells,{bsCurrent:4,bs50:5,bs20:6,bs10:7,nexusRating:9,robustness:10,actions:11});assert.deepEqual(tableMarker.rowMatch,['bullshooter-id-loose-hash','player-id','primary-unique-name']);
assert.equal(pkg.version,'0.10.5','deployment image must identify as V0.10.5');
console.log('V0.10.5 live player metrics passed: production BullShooter IDs + primary-name fallback map NX/Robustness to the correct rows.');
