import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
import {scorePlayerRobustness} from '../src/robustness.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin “BULL.S” Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const rating=computeNexusRating(kevin),robust=scorePlayerRobustness(kevin);
assert.equal(rating.rating,41.7,'Kevin Nexus v2 must use BS50-led recent form');
assert.equal(robust.score,36,'Robustness remains a separate R36 confidence score');
assert.equal(rating.camarilloRating,0,'no Camarillo games means Camarillo source rating is zero');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v1000-rating.js'),css=read('public/v1000-rating.css'),legacyPlayer=read('public/v094-player-intel.js'),legacyBull=read('public/v077.js'),legacyRating=read('public/v0711.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(store,/rpc\/camarillo_player_metrics_index/,'one SQL RPC must provide both rating and robustness');
assert.doesNotMatch(store,/rpc\/camarillo_nexus_rating_index/,'transport must not bypass unified metrics');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(ui,/entry\?\.robustness/);assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/);assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/);assert.match(ui,/window\.CDNexusPlayerMetricsV1001/);assert.doesNotMatch(ui,/subtree:true/);

const expected="['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS']";
assert.ok(ui.includes(expected),'V0.11.0 must use the compact 11-column Players schema');
assert.ok(!expected.includes('CAMARILLO'),'Nexus Rating replaces the redundant Camarillo display column');
assert.match(ui,/function canonicalize\(t\)/,'metrics owner must structurally canonicalize the live table');
assert.match(ui,/take\('BS50','BS30'\)/,'legacy BS30 must map into canonical BS50');
assert.match(ui,/take\('NEXUS RATING','CAMARILLO','BS \/ CD RATING','RATING'\)/,'existing Nexus/Camarillo/legacy rating cells must collapse into one Nexus cell');
assert.match(ui,/ordered\[4\]\.dataset\.v1100='bs-current'/);assert.match(ui,/ordered\[5\]\.dataset\.v1100='bs50'/);assert.match(ui,/ordered\[6\]\.dataset\.v1100='bs20'/);assert.match(ui,/ordered\[7\]\.dataset\.v1100='bs10'/);assert.match(ui,/ordered\[8\]\.dataset\.v1100='nexus-rating'/);assert.match(ui,/ordered\[9\]\.dataset\.v1100='robustness'/);
assert.match(ui,/windowMarkup\(b\.last50PPD,b\.last50MPR,'BullShooter Last 50'\)/);assert.match(ui,/windowMarkup\(b\.last20PPD,b\.last20MPR,'BullShooter Last 20'\)/);assert.match(ui,/windowMarkup\(b\.last10PPD,b\.last10MPR,'BullShooter Last 10'\)/);
assert.match(ui,/class=\"skill-rating-block\"/,'BS windows must render a dedicated rating card');assert.match(ui,/<strong>\$\{fmt\(rating,1\)\}<\/strong><small>\$\{fmt\(ppd,2\)\} PPD · \$\{fmt\(mpr,2\)\} MPR/,'rating must be large above PPD/MPR');
assert.match(css,/\.skill-rating-block strong/);assert.match(css,/font-size:18px/,'BS rating must be visually prominent');assert.match(css,/\.nexus-rating-block \.nx-main strong\{font-size:20px\}/,'Nexus remains the strongest metric hierarchy');

assert.match(ui,/function renderBullshooter\(row,idx,player\)/,'unified renderer owns BullShooter stat cells');
assert.match(ui,/playerIndexes\(\)/,'renderer builds deterministic player identity indexes');
assert.match(ui,/pidx\.byBs\.get\(id\)/,'BullShooter ID is first row identity match');
assert.match(ui,/pidx\.byId\.get\(pid\)/,'player ID is second row identity match');
assert.match(ui,/pidx\.byName\.get\(key\)/,'unique normalized name is final fallback');
assert.match(ui,/Promise\.allSettled\(\[api\('\/api\/players'\),api\('\/api\/players\/nexus-rating'\)\]\)/,'BullShooter data and metrics load independently');
assert.match(ui,/scheduleRetry\(\)/,'metrics failures retry without blanking BS windows');
assert.match(ui,/row\.replaceChildren\(\.\.\.ordered\)/);assert.match(ui,/headRow\.replaceChildren\(\.\.\.newHeads\)/);assert.match(ui,/headRow\.dataset\.v077='1'/);
const canonPos=ui.indexOf('canonicalize(t);'),ratingPos=ui.indexOf("rating:headerIndex(t,'NEXUS RATING')");assert.ok(canonPos>=0&&ratingPos>canonPos);
assert.match(ui,/state\.observer\.observe\(body,\{childList:true\}\)/);assert.match(ui,/state\.observer\.observe\(head,\{childList:true\}\)/);

const parseBs=text=>String(text||'').match(/#\s*(\d{3,})/)?.[1]||'';
assert.equal(parseBs('#267261Synced 8/24/2026'),'267261');assert.equal(parseBs('#62894 Synced 8/24/2026'),'62894');
assert.ok(ui.includes("match(/#\\s*(\\d{3,})/)"));assert.ok(!ui.includes("match(/#\\s*(\\d{3,})\\b/)"));
assert.match(ui,/const rowName=row=>/);assert.match(ui,/\[data-player-name\],\.player-name,strong,b/);assert.match(ui,/const key=norm\(rowName\(row\)\)/);assert.match(ui,/nameKey:norm\(rowName\(row\)\)/);

assert.doesNotMatch(html,/v0918-table\.js/);assert.match(html,/v1000-rating\.js\?v=0\.11\.0/);assert.match(html,/v1000-rating\.css\?v=0\.11\.0/);
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);assert.ok(legacyEnsure);assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(legacyEnsure[1],/innerHTML|robustness\(p\)|CDNexusRobustnessV0918/);
const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);assert.ok(patchRatings);assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchRatings[1],/innerHTML|ratingMarkup\(|ratingsFor\(/);
const patchDisplays=legacyBull.match(/async function patchDisplays\(\)\{([\s\S]*?)\n\s*\}\n\n\s*async function enhanceDiagnostics/);assert.ok(patchDisplays);assert.match(patchDisplays[1],/CDNexusPlayerMetricsV1001/);assert.doesNotMatch(patchDisplays[1],/players\[idx\]|last50PPD|last20PPD|last10PPD|innerHTML/);
const marker=JSON.parse(read('.v1001-player-metrics-applied'));assert.equal(marker.version,'0.11.0');assert.deepEqual(marker.owns,['bs-current','bs50-rating','bs20-rating','bs10-rating','nexus-rating','robustness']);assert.equal(marker.bullshooterIdMatch,'hash-digits-without-trailing-boundary');assert.equal(marker.legacyBullshooterWriter,false);
const tableMarker=JSON.parse(read('.v1003-player-table-applied'));assert.equal(tableMarker.version,'0.11.0');assert.deepEqual(tableMarker.schema,['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','NEXUS RATING','ROBUSTNESS','ACTIONS']);assert.deepEqual(tableMarker.removed,['CAMARILLO']);assert.deepEqual(tableMarker.statCells,{bsCurrent:4,bs50:5,bs20:6,bs10:7,nexusRating:8,robustness:9,actions:10});
assert.equal(pkg.version,'0.11.0');
console.log('V0.11.0 player metrics passed: rated BS50/20/10, Nexus replaces Camarillo, robustness remains separate, live identity mapping retained.');
