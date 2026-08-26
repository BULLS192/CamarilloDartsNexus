import fs from 'node:fs';
import assert from 'node:assert/strict';
import {playersFromRawState,robustnessIndex} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const rawState={players:[{id:'recovered-192985',name:'Kevin "BULL.S" Yap',bullshooter:{id:'192985',currentStatsDiagnostics:{x01Count:41,cricketCount:69},last50PPDSampleSize:41,last50MPRSampleSize:50,last20PPDSampleSize:20,last20MPRSampleSize:20,last10PPDSampleSize:10,last10MPRSampleSize:10}}]};
const players=playersFromRawState(rawState);assert.equal(players.length,1,'raw persisted player must be retained');
const index=robustnessIndex(players,{links:[]});
assert.ok(index.byBullshooterId['192985'],'BullShooter 192985 must exist in robustness API index');
assert.equal(index.byBullshooterId['192985'].components.bullshooter501,16.4,'41 X01 games must contribute 16.4/20');
assert.equal(index.byBullshooterId['192985'].components.bullshooterCricket,20,'69 Cricket games must cap at 20/20');
assert.equal(index.byBullshooterId['192985'].score,36,'Kevin must render R36 before TOC/EDC evidence');

const store=read('src/store.js'),server=read('server.js'),ui=read('public/v0918-table.js'),docker=read('Dockerfile'),pkg=JSON.parse(read('package.json'));
assert.match(store,/listRobustnessPlayersRaw\(\)[\s\S]*?rpc\/camarillo_state_read[\s\S]*?Array\.isArray\(raw\.players\)[\s\S]*?structuredClone\(raw\.players\)/,'robustness backend must consume raw Supabase state before normalization');
assert.match(server,/const players=await listRobustnessPlayersRaw\(\),links=await listTocLinks/,'robustness endpoint must use raw persisted players');
assert.match(ui,/state\.data\?\.byBullshooterId/,'table renderer must consume byBullshooterId API index');
assert.match(ui,/function bullshooterId\(row\).*row\.cells\[3\]/s,'table renderer must extract BullShooter ID from canonical BullShooter column');
assert.match(docker,/COPY src\/robustness-v0920\.js \/app\/src\/robustness\.js/,'Docker image must install V0.9.20 robustness module');
assert.match(docker,/COPY deploy\/patch-v0920-robustness-e2e\.mjs \/tmp\/patch-v0920-robustness-e2e\.mjs/,'Docker image must copy V0.9.20 patch');
assert.match(docker,/RUN node \/tmp\/patch-v0920-robustness-e2e\.mjs/,'Docker image must execute V0.9.20 patch');
assert.equal(pkg.version,'0.9.20');
console.log('V0.9.20 raw-state robustness end-to-end checks passed');
