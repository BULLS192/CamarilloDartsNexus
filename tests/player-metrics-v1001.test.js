import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
import {scorePlayerRobustness} from '../src/robustness.js';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin “BULL.S” Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const rating=computeNexusRating(kevin),robust=scorePlayerRobustness(kevin);
assert.equal(rating.rating,41.7,'Kevin Nexus v2 must use BS50-led recent form');
assert.equal(robust.score,36,'Robustness math remains unchanged');
assert.equal(rating.camarilloRating,0,'no Camarillo games means local Camarillo rating is zero');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v1000-rating.js'),css=read('public/v1000-rating.css'),legacyPlayer=read('public/v094-player-intel.js'),legacyBull=read('public/v077.js'),legacyRating=read('public/v0711.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(store,/rpc\/camarillo_player_metrics_index/,'one SQL RPC must provide both rating and robustness');
assert.doesNotMatch(store,/rpc\/camarillo_nexus_rating_index/,'transport must not bypass unified metrics');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(ui,/entry\?\.robustness/);assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/);assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/);assert.match(ui,/camarilloCell\.innerHTML=camarilloMarkup\(entry\)/);assert.match(ui,/window\.CDNexusPlayerMetricsV1001/);assert.doesNotMatch(ui,/subtree:true/);

const expected="['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS']";
assert.ok(ui.includes(expected),'Players table must keep Camarillo local rating distinct from Nexus');
assert.match(ui,/'CAMARILLO RATING':'Camarillo Rating'/,'local column must be explicitly named Camarillo Rating');
assert.match(ui,/const camarillo=take\('CAMARILLO RATING','CAMARILLO'\)/);assert.match(ui,/const rating=take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/);
assert.match(ui,/camarillo:headerIndex\(t,'CAMARILLO RATING','CAMARILLO'\)/,'visible Camarillo Rating header must resolve after canonicalization');
assert.match(ui,/ordered\[8\]\.dataset\.v111='camarillo-rating'/);assert.match(ui,/ordered\[9\]\.dataset\.v1100='nexus-rating'/);assert.match(ui,/ordered\[10\]\.dataset\.v1100='robustness'/);
assert.match(ui,/0 Camarillo games/,'matched players with no local play must visibly show Camarillo 0');
assert.match(ui,/Camarillo Rating uses only Camarillo-organized league, tournament and event games/);

assert.match(ui,/const robustnessGrade=score=>Number\(score\)>=85\?'S':Number\(score\)>=70\?'A':Number\(score\)>=50\?'B':Number\(score\)>=25\?'C':'D'/);
assert.match(ui,/<strong>\$\{grade\}<\/strong><small>\$\{r\.score\} \/ 100<\/small>/,'letter grade must be prominent with numeric score underneath');
assert.doesNotMatch(ui,/<small>\$\{r\.label\|\|'Thin'\}<\/small>/,'legacy word labels must not render in the canonical table');
assert.match(css,/\.robustness-badge\.robustness-grade/);assert.match(css,/font-size:24px/,'robustness letter must be visually prominent');

assert.match(ui,/windowMarkup\(b\.last50PPD,b\.last50MPR,'BullShooter Last 50'\)/);assert.match(ui,/windowMarkup\(b\.last20PPD,b\.last20MPR,'BullShooter Last 20'\)/);assert.match(ui,/windowMarkup\(b\.last10PPD,b\.last10MPR,'BullShooter Last 10'\)/);
assert.match(ui,/function renderBullshooter\(row,idx,player\)/);assert.match(ui,/pidx\.byBs\.get\(id\)/);assert.match(ui,/pidx\.byId\.get\(pid\)/);assert.match(ui,/pidx\.byName\.get\(key\)/);
assert.ok(ui.includes("match(/#\\s*(\\d{3,})/)"));assert.ok(!ui.includes("match(/#\\s*(\\d{3,})\\b/)"));

assert.doesNotMatch(html,/v0918-table\.js/);assert.match(html,/v1000-rating\.js\?v=0\.11\.3/);assert.match(html,/v1000-rating\.css\?v=0\.11\.3/);
const legacyEnsure=legacyPlayer.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);assert.ok(legacyEnsure);assert.match(legacyEnsure[1],/CDNexusPlayerMetricsV1001/);
const patchRatings=legacyRating.match(/async function patchRatings\(\)\{([\s\S]*?)\n\s*\}\n\n\s*let timer=null;/);assert.ok(patchRatings);assert.match(patchRatings[1],/CDNexusPlayerMetricsV1001/);
const patchDisplays=legacyBull.match(/async function patchDisplays\(\)\{([\s\S]*?)\n\s*\}\n\n\s*async function enhanceDiagnostics/);assert.ok(patchDisplays);assert.match(patchDisplays[1],/CDNexusPlayerMetricsV1001/);

const marker=JSON.parse(read('.v1001-player-metrics-applied'));assert.equal(marker.version,'0.11.3');assert.deepEqual(marker.owns,['bs-current','bs50-rating','bs20-rating','bs10-rating','camarillo-rating','nexus-rating','robustness-grade']);assert.deepEqual(marker.robustnessGrades,{S:'85-100',A:'70-84',B:'50-69',C:'25-49',D:'0-24'});
const tableMarker=JSON.parse(read('.v1003-player-table-applied'));assert.equal(tableMarker.version,'0.11.3');assert.deepEqual(tableMarker.schema,['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS']);assert.deepEqual(tableMarker.statCells,{bsCurrent:4,bs50:5,bs20:6,bs10:7,camarilloRating:8,nexusRating:9,robustness:10,actions:11});
assert.equal(pkg.version,'0.11.3');
console.log('V0.11.3 player metrics passed: Camarillo local rating is distinct from Nexus and Robustness renders S/A/B/C/D without changing the score math.');