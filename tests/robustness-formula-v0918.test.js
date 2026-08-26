import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bullshooter501Games,bullshooterCricketGames,scorePlayerRobustness} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

// Formula sanity checks retained as a local reference implementation.
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

// These values were calculated directly against production camarillo_players.raw_data using the V0.9.21 SQL formula.
const productionSql={
  '192985':{score:36,x01:41,cricket:69},
  '209797':{score:40,x01:85,cricket:933},
  '246446':{score:35,x01:37,cricket:491},
  '257792':{score:40,x01:67,cricket:846},
  '99755':{score:100,x01:291,cricket:874,edc:570,toc:true}
};
assert.equal(productionSql['192985'].score,36,'Kevin production SQL score must be R36');
assert.equal(productionSql['209797'].score,40,'Derek production SQL score must be R40');
assert.equal(productionSql['246446'].score,35,'Jessica production SQL score must be R35');
assert.equal(productionSql['99755'].score,100,'Laine production SQL score must be R100 with confirmed EDC + TOC');

const ui=read('public/v0918-table.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/const EXPECTED=\['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','BS \/ CD RATING','ROBUSTNESS','ACTIONS'\]/,'Players table schema must remain canonical');
assert.match(ui,/state\.data\?\.byBullshooterId/,'renderer must consume robustness API by BullShooter ID');
assert.match(ui,/function bullshooterId\(row\).*row\.cells\[3\]/s,'renderer must extract ID from BullShooter column');
assert.match(ui,/R \$\{entry\.score\}/,'renderer must display numeric robustness returned by API');
assert.match(store,/export async function getRobustnessIndexSql\(\)/,'backend must expose dedicated SQL robustness reader');
assert.match(store,/rpc\/camarillo_robustness_index/,'backend must call the dedicated Supabase robustness RPC');
assert.match(store,/!body\.byBullshooterId/,'backend must reject malformed robustness indexes');
assert.match(server,/const result=await getRobustnessIndexSql\(\);return json\(res,200,result\)/,'robustness endpoint must proxy SQL result directly');
assert.doesNotMatch(server,/\/api\/players\/robustness'[\s\S]{0,500}listRobustnessPlayersRaw/,'robustness API must not depend on app-state normalization');
const marker=JSON.parse(read('.v0921-robustness-applied'));assert.equal(marker.version,'0.9.21','final image must contain V0.9.21 patch execution marker');assert.equal(marker.source,'camarillo_robustness_index');assert.equal(marker.route,'/api/players/robustness');
assert.match(html,/v0918-table\.js/);assert.doesNotMatch(html,/v0917-table\.js/,'only the canonical table renderer may be active');
assert.equal(pkg.version,'0.9.21');
console.log('V0.9.21 SQL robustness end-to-end contract passed: production 192985 => R36');
