import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bullshooter501Games,bullshooterCricketGames,scorePlayerRobustness,robustnessIndex,playersFromRawState} from '../src/robustness.js';
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
assert.equal(bullshooter501Games({currentStatsDiagnostics:{x01Count:41},last50PPDSampleSize:41}),41);
assert.equal(bullshooterCricketGames({currentStatsDiagnostics:{cricketCount:69},last50MPRSampleSize:50}),69);

// Production-shaped raw state copied from the live Supabase player structure.
const rawState={players:[{id:'recovered-192985',name:'Kevin "BULL.S" Yap',bullshooter:{id:'192985',currentStatsDiagnostics:{x01Count:41,cricketCount:69},last50PPDSampleSize:41,last50MPRSampleSize:50,last20PPDSampleSize:20,last20MPRSampleSize:20,last10PPDSampleSize:10,last10MPRSampleSize:10,recent01Count:10,recentCricketCount:10}}]};
const rawPlayers=playersFromRawState(rawState);assert.equal(rawPlayers.length,1,'raw player must survive without normalization');
const idx=robustnessIndex(rawPlayers,{links:[]});
assert.ok(idx.byBullshooterId['192985'],'API index must contain BullShooter 192985');
assert.equal(idx.byBullshooterId['192985'].components.bullshooter501,16.4,'41 X01 games must score 16.4/20');
assert.equal(idx.byBullshooterId['192985'].components.bullshooterCricket,20,'69 Cricket games must score 20/20');
assert.equal(idx.byBullshooterId['192985'].score,36,'live Kevin evidence must produce R36 before TOC/EDC points');
assert.equal(idx.formulaVersion,'0.9.20');

const ui=read('public/v0918-table.js'),server=read('server.js'),store=read('src/store.js'),docker=read('Dockerfile'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/const EXPECTED=\['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','BS \/ CD RATING','ROBUSTNESS','ACTIONS'\]/,'Players table schema must remain canonical');
assert.match(ui,/state\.data\?\.byBullshooterId/,'renderer must consume robustness API by BullShooter ID');
assert.match(ui,/function bullshooterId\(row\).*row\.cells\[3\]/s,'renderer must extract ID from BullShooter column');
assert.match(store,/export async function listRobustnessPlayersRaw\(\)[\s\S]*?rpc\/camarillo_state_read[\s\S]*?Array\.isArray\(raw\.players\)[\s\S]*?structuredClone\(raw\.players\)/,'backend must read raw Supabase state before normalization');
assert.match(server,/const players=await listRobustnessPlayersRaw\(\),links=await listTocLinks\(\)\.catch\(\(\)=>\[\]\),result=robustnessIndex\(players,\{links\}\)/,'robustness endpoint must build the index from raw stored players');
assert.match(server,/diagnostics:\{source:'raw-state',playerCount:players\.length,indexedBullshooterCount:Object\.keys\(result\.byBullshooterId\|\|\{\}\)\.length\}/,'endpoint must expose non-sensitive indexing diagnostics');
assert.match(docker,/COPY src\/robustness-v0918\.js \/app\/src\/robustness\.js/,'Docker must install the robustness module actually under test');
assert.match(docker,/COPY deploy\/patch-v0918-robustness-formula\.mjs \/tmp\/patch-v0918-robustness-formula\.mjs/,'Docker must copy the robustness backend patch');
assert.match(docker,/RUN node \/tmp\/patch-v0918-robustness-formula\.mjs/,'Docker must execute the robustness backend patch');
assert.match(html,/v0918-table\.js/);assert.doesNotMatch(html,/v0917-table\.js/,'only the canonical table renderer may be active');
assert.equal(pkg.version,'0.9.20');
console.log('V0.9.20 production-shaped robustness end-to-end contract passed: 192985 => R36');
