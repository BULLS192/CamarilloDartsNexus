import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bullshooter501Games,bullshooterCricketGames,scorePlayerRobustness,robustnessIndex} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const base={id:'p1',name:'Formula Test',bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:0,cricketCount:0}}};
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:40}}).components.edc,15,'40 EDC games must score 15/30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:80}}).components.edc,30,'80 EDC games must score the full 30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:true,games:500}}).components.edc,30,'EDC points must cap at 30');
assert.equal(scorePlayerRobustness({...base,edc:{confirmed:false,games:80}}).components.edc,0,'unconfirmed EDC may not add robustness');
assert.equal(scorePlayerRobustness(base,{tocLink:{confirmed:true}}).components.toc,30,'confirmed PPD/TOC link must score 30');

const halfBs={...base,bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:25,cricketCount:25}}};
const half=scorePlayerRobustness(halfBs);assert.equal(half.components.bullshooter501,10);assert.equal(half.components.bullshooterCricket,10);assert.equal(half.score,20);
const full={...base,edc:{confirmed:true,games:80},bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:50,cricketCount:50}}};
const fullScore=scorePlayerRobustness(full,{tocLink:{confirmed:true}});assert.equal(fullScore.score,100,'30 + 30 + 20 + 20 must equal 100');
const over={...full,bullshooter:{id:'123456',currentStatsDiagnostics:{x01Count:500,cricketCount:500}},edc:{confirmed:true,games:999}};assert.equal(scorePlayerRobustness(over,{tocLink:{confirmed:true}}).score,100,'robustness must never exceed 100');
assert.equal(bullshooter501Games({currentStatsDiagnostics:{x01Count:41},last50PPDSampleSize:50}),50,'known 501 sample evidence should use the strongest known count');
assert.equal(bullshooterCricketGames({currentStatsDiagnostics:{cricketCount:49},last50MPRSampleSize:50}),50,'known Cricket sample evidence should use the strongest known count');
const idx=robustnessIndex([full],{links:[{playerId:'p1',confirmed:true}]});assert.equal(idx.byBullshooterId['123456'].score,100);assert.equal(idx.formulaVersion,'0.9.18');
const kevin={id:'recovered-192985',bullshooter:{id:'192985',currentStatsDiagnostics:{x01Count:41,cricketCount:69},last50PPDSampleSize:41,last50MPRSampleSize:50}};
const kr=scorePlayerRobustness(kevin);assert.equal(kr.score,36,'Kevin production evidence must score R36 before external-link points');

const ui=read('public/v0918-table.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/const EXPECTED=\['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','BS \/ CD RATING','ROBUSTNESS','ACTIONS'\]/,'Players table must have one canonical schema');
assert.match(ui,/row\.replaceChildren\(\.\.\.ordered\)/,'each player row must be normalized to the canonical schema');
assert.match(ui,/EDC \$\{c\.edc\?\?0\}\/30/,'robustness tooltip must expose the fixed EDC component');
assert.match(ui,/BullShooter 501 \$\{c\.bullshooter501\?\?0\}\/20/);
assert.match(ui,/BullShooter Cricket \$\{c\.bullshooterCricket\?\?0\}\/20/);
assert.match(store,/export async function listRobustnessPlayers\(\)\{[\s\S]*?const db=await readDb\(\);[\s\S]*?db\.players/,'robustness must read full persisted player state');
assert.match(server,/const players=await listRobustnessPlayers\(\),links=await listTocLinks/,'robustness endpoint must use full stored records, not the generic player list');
assert.match(server,/robustnessIndex\(players,\{links\}\)/,'robustness endpoint should not fetch TOC detail rows merely to calculate robustness');
assert.match(html,/v0918-table\.js/);assert.doesNotMatch(html,/v0917-table\.js/,'V0.9.17 table renderer must not compete with V0.9.18+');
assert.equal(pkg.version,'0.9.19');
console.log('V0.9.19 fixed robustness formula + full-state backend checks passed');
