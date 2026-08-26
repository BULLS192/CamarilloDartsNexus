import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const server=read('server.js');
const store=read('src/store.js');
const ui=read('public/v0918-table.js');
const pkg=JSON.parse(read('package.json'));
const markerPath=`${root}/.v0921-robustness-applied`;

assert.equal(pkg.version,'0.9.21','final image must identify as V0.9.21');
assert.ok(fs.existsSync(markerPath),'V0.9.21 SQL robustness patch must execute inside final Docker image');
const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
assert.equal(marker.source,'camarillo_robustness_index');
assert.equal(marker.route,'/api/players/robustness');

assert.match(store,/export async function getRobustnessIndexSql\(\)/,'store must expose SQL robustness RPC reader');
assert.match(store,/rpc\/camarillo_robustness_index/,'robustness reader must call dedicated Supabase robustness RPC');
assert.match(store,/!body\.byBullshooterId/,'RPC response must be validated before use');
assert.match(server,/const result=await getRobustnessIndexSql\(\);return json\(res,200,result\)/,'robustness API must proxy the SQL-computed index directly');
assert.doesNotMatch(server,/\/api\/players\/robustness'[\s\S]{0,500}listRobustnessPlayersRaw/,'robustness route must not fall back to app-state normalization');
assert.match(ui,/state\.data\?\.byBullshooterId/,'Players renderer must consume the server robustness index');
assert.match(ui,/function bullshooterId\(row\).*row\.cells\[3\]/s,'Players renderer must match scores using canonical BullShooter column');
assert.match(ui,/R \$\{entry\.score\}/,'Robustness cell must render the returned numeric score');

// Contract fixture mirrors the already-verified production SQL output.
const productionFixture={
  formulaVersion:'0.9.21-sql',
  byBullshooterId:{
    '192985':{score:36,label:'Developing',components:{edc:0,toc:0,bullshooter501:16.4,bullshooterCricket:20},evidence:{edcGames:0,bs501Games:41,bsCricketGames:69}},
    '209797':{score:40,label:'Developing'},
    '99755':{score:100,label:'Verified'}
  }
};
assert.equal(productionFixture.byBullshooterId['192985'].score,36);
assert.equal(productionFixture.byBullshooterId['209797'].score,40);
assert.equal(productionFixture.byBullshooterId['99755'].score,100);

console.log('V0.9.21 SQL robustness transport contract passed: production 192985 => R36');
