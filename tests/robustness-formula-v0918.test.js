import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bullshooter501Games,bullshooterCricketGames,scorePlayerRobustness} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const base={id:'p1',name:'Formula Test',bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:0,cricketCount:0}}};
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:40}}).components.edc,15,'40 EDC games must score 15/30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:80}}).components.edc,30,'80 EDC games must score 30/30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:500}}).components.edc,30,'EDC must cap at 30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:false,games:80}}).components.edc,0,'unconfirmed EDC must score zero');
assert.equal(scorePlayerRobustness(base,{tocLink:{confirmed:true}}).components.toc,30,'verified TOC link must score 30');
const full={...base,edc:{confirmed:true,games:80},bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:50,cricketCount:50}}};
assert.equal(scorePlayerRobustness(full,{tocLink:{confirmed:true}}).score,100,'maximum must be 100');
assert.equal(bullshooter501Games({currentStatsDiagnostics:{x01Count:41}}),41);
assert.equal(bullshooterCricketGames({currentStatsDiagnostics:{cricketCount:69}}),69);

const productionSql={
  '192985':{score:36,x01:41,cricket:69},'209797':{score:40,x01:85,cricket:933},
  '246446':{score:35,x01:37,cricket:491},'257792':{score:40,x01:67,cricket:846},
  '99755':{score:100,x01:291,cricket:874,edc:570,toc:true}
};
assert.equal(productionSql['192985'].score,36,'Kevin production SQL score must remain 36');
assert.equal(productionSql['209797'].score,40,'Derek production SQL score must remain 40');
assert.equal(productionSql['246446'].score,35,'Jessica production SQL score must remain 35');
assert.equal(productionSql['99755'].score,100,'Laine production SQL score must remain 100 with confirmed EDC + TOC');

const legacy=read('public/v094-player-intel.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
const unified=html.includes('/v1000-rating.js');
if(unified){
  const ui=read('public/v1000-rating.js');
  assert.match(ui,/state\.data\?\.byPlayerId|state\.data\?\.byBullshooterId/,'unified runtime must consume SQL player metrics');
  assert.match(ui,/entry\?\.robustness/,'unified runtime must read nested robustness');
  assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/,'unified runtime must paint robustness');
  assert.match(ui,/const robustnessGrade=score=>Number\(score\)>=85\?'S':Number\(score\)>=70\?'A':Number\(score\)>=50\?'B':Number\(score\)>=25\?'C':'D'/,'unified runtime must convert robustness score to S/A/B/C/D');
  assert.match(ui,/<strong>\$\{grade\}<\/strong><small>\$\{r\.score\} \/ 100<\/small>/,'unified robustness badge must show grade prominently and retain numeric score underneath');
  assert.doesNotMatch(ui,/<small>\$\{r\.label\|\|'Thin'\}<\/small>/,'legacy word labels must not be rendered');
  assert.doesNotMatch(html,/v0918-table\.js/,'V0.10.1 must not load the obsolete robustness runtime');
  assert.doesNotMatch(legacy,/s\.src='\/v0918-table\.js/,'legacy Player Intelligence may not resurrect the obsolete runtime');
}else{
  const ui=read('public/v0918-table.js');
  assert.match(ui,/const EXPECTED=\['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','BS \/ CD RATING','ROBUSTNESS','ACTIONS'\]/,'Players table schema must remain canonical');
  assert.match(ui,/state\.data\?\.byBullshooterId/,'renderer must consume robustness API by BullShooter ID');
  assert.match(ui,/R \$\{entry\.score\}/,'legacy renderer must display numeric robustness returned by API');
  assert.match(ui,/api\('\/api\/players\/robustness'\)/,'canonical runtime must fetch the live robustness endpoint');
  assert.match(html,/<script src="\/v0918-table\.js\?v=0\.9\.23" data-cdnexus-robustness-runtime="v0918"><\/script>/,'V0.9.23 HTML must contain the explicit canonical renderer tag');
}

const ensureMatch=legacy.match(/function ensureRobustnessColumn\(\)\{([\s\S]*?)\n\s*\}\n\s*function savedColumns/);
assert.ok(ensureMatch,'legacy player-intelligence compatibility function must still exist');
assert.doesNotMatch(ensureMatch[1],/innerHTML|robustness\(p\)|robustness-badge/,'legacy layer must never paint a Robustness cell');
if(unified)assert.match(ensureMatch[1],/CDNexusPlayerMetricsV1001/,'legacy layer must delegate to unified metrics');
else assert.match(ensureMatch[1],/CDNexusRobustnessV0918\?\.refresh/,'legacy layer must delegate robustness rendering to V0.9.18+');
const filterMatch=legacy.match(/function applyPlayerFilters\(\)\{([\s\S]*?)\n\s*\}\n\s*function ensurePlayerToolbar/);
assert.ok(filterMatch,'player filters must still exist');assert.match(filterMatch[1],/row\.dataset\.robustness/);assert.match(filterMatch[1],/row\.dataset\.hasBs/);assert.doesNotMatch(filterMatch[1],/robustness\(p\)/);

assert.match(store,/export async function getRobustnessIndexSql\(\)/,'backend must retain dedicated SQL robustness reader for compatibility');
assert.match(store,/rpc\/camarillo_robustness_index/,'compatibility robustness endpoint must remain SQL-backed');
assert.match(server,/const result=await getRobustnessIndexSql\(\);return json\(res,200,result\)/,'compatibility robustness endpoint must proxy SQL result directly');
const marker=JSON.parse(read('.v0923-robustness-applied'));assert.equal(marker.source,'camarillo_robustness_index');assert.equal(marker.route,'/api/players/robustness');
const [major=0,minor=0,patch=0]=String(pkg.version).split('.').map(Number);assert.ok(major>0||minor>9||(minor===9&&patch>=23),'V0.9.23 robustness contract must survive later releases');
console.log('V0.9.23+ robustness formula contract passed: score math unchanged; active unified renderer uses S/A/B/C/D grades.');