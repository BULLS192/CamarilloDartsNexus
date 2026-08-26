import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizeRobustnessPlayer,playerBullshooterId,scorePlayerRobustness,robustnessIndex} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin "BULL.S" Yap',bullshooter:{id:'192985',currentStatsDiagnostics:{x01Count:41,cricketCount:69},last50PPDSampleSize:41,last50MPRSampleSize:50}};
const derek={id:'recovered-209797',name:'Derek "D-REK" Thompson',bullshooter:{id:'209797',currentStatsDiagnostics:{x01Count:85,cricketCount:933},last50PPDSampleSize:50}};
const doc={id:'recovered-52899',name:'Kevin "DOC" Rodgers',bullshooter:{id:'52899',currentStatsDiagnostics:{x01Count:4,cricketCount:10773},last50PPDSampleSize:14,last50MPRSampleSize:50}};

assert.equal(scorePlayerRobustness(kevin).score,36,'Kevin live BullShooter counts 41/69 should score 36');
assert.equal(scorePlayerRobustness(derek).score,40,'Derek live BullShooter counts 85/933 should cap at 40');
assert.equal(scorePlayerRobustness(doc).score,22,'DOC must use authoritative x01Count=4 rather than inflate to the 14-row recent sample');
assert.equal(scorePlayerRobustness({...kevin,edc:{confirmed:true,games:40}}).score,51,'40 EDC games add 15 points');
assert.equal(scorePlayerRobustness(kevin,{tocLink:{confirmed:true}}).score,66,'verified TOC adds exactly 30 points');

const mirror={player_id:'recovered-192985',display_name:'Kevin "BULL.S" Yap',bullshooter_id:'192985',raw_data:kevin};
assert.equal(playerBullshooterId(mirror),'192985','normalized mirror must resolve BullShooter ID');
assert.equal(normalizeRobustnessPlayer(mirror).bullshooter.currentStatsDiagnostics.x01Count,41,'normalized mirror must unwrap raw_data stats');
const idx=robustnessIndex([mirror,derek,doc],{links:[]});
assert.equal(idx.byBullshooterId['192985'].score,36);
assert.equal(idx.byBullshooterId['209797'].score,40);
assert.equal(idx.byBullshooterId['52899'].score,22);
assert.equal(idx.count,3);
assert.equal(idx.dataContractVersion,'0.9.19');

const store=read('src/store.js'),server=read('server.js'),pkg=JSON.parse(read('package.json'));
assert.match(store,/export async function listPlayersForRobustness\(\)\{const db=await readDb\(\);return Array\.isArray\(db\?\.players\)\?db\.players:\[\]\}/,'robustness must read authoritative db.players');
assert.match(server,/const players=await listPlayersForRobustness\(\),links=await listTocLinks/,'robustness endpoint must use authoritative state players');
assert.doesNotMatch(server,/\/api\/players\/robustness[\s\S]{0,180}listPlayers\(\)/,'robustness endpoint may not use generic listPlayers projection');
assert.equal(pkg.version,'0.9.19');
console.log('V0.9.19 authoritative-state robustness checks passed');
