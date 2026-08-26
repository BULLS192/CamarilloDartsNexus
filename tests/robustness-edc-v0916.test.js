import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bullshooterEvidenceGames,scorePlayerRobustness,robustnessIndex} from '../src/robustness.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={id:'recovered-192985',name:'Kevin Yap',bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,syncedAt:new Date().toISOString(),currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const derek={id:'recovered-209797',name:'Derek Thompson',bullshooter:{id:'209797',ppd:28.48,mpr:3.13,last50PPD:29.16,last20PPD:29,last10PPD:29.58,syncedAt:new Date().toISOString(),currentStatsDiagnostics:{x01Count:85,cricketCount:933}}};
assert.equal(bullshooterEvidenceGames(kevin.bullshooter),110,'live Kevin sample should resolve to 110 BullShooter games');
assert.equal(bullshooterEvidenceGames(derek.bullshooter),1018,'live Derek sample should resolve to 1018 BullShooter games');
const kr=scorePlayerRobustness(kevin),dr=scorePlayerRobustness(derek);assert.ok(kr.score>0&&kr.label!=='','BullShooter-only players must receive a real robustness score');assert.ok(dr.score>kr.score,'larger verified BullShooter samples should increase robustness');
const idx=robustnessIndex([kevin,derek]);assert.equal(idx.byBullshooterId['192985'].playerId,'recovered-192985');assert.ok(idx.byBullshooterId['209797'].score>0);

const server=read('server.js'),store=read('src/store.js'),ui=read('public/v0916-robustness.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(server,/\/api\/players\/robustness/,'server must expose one bulk robustness endpoint');
assert.match(server,/robustnessIndex\(players,\{links,tocById\}\)/,'robustness endpoint must score server-side');
assert.match(store,/export async function setPlayerExternalSource\(/,'EDC must have a dedicated persistence primitive');
const postStart=server.indexOf("m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-link$/);if(m&&req.method==='POST')"),postEnd=server.indexOf("if(m&&req.method==='DELETE')",postStart);assert.ok(postStart>=0&&postEnd>postStart);const post=server.slice(postStart,postEnd);assert.match(post,/setPlayerExternalSource\(p\.id,'edc',edc\)/);assert.doesNotMatch(post,/loadEdcDataset\(/,'manual EDC link must save the selected snapshot without re-fetching the source');
const syncStart=server.indexOf("m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/)"),syncEnd=server.indexOf('\n  }',syncStart)+4,sync=server.slice(syncStart,syncEnd);assert.match(sync,/same\.length===1/);assert.match(sync,/Multiple EDC records still use this player name/,'ambiguous duplicate-name EDC refresh must remain manual');assert.match(sync,/setPlayerExternalSource\(p\.id,'edc',edc\)/);
assert.match(ui,/\/api\/players\/robustness/);assert.match(ui,/function syncHiddenColumns\(table\)/,'renderer must reapply hidden columns after tbody replacement');assert.match(ui,/actionCell\(row\)/);assert.match(ui,/window\.CDNexusRobustnessV0915=exported/,'new renderer must satisfy old delegate calls without loading old renderer');
assert.match(html,/v0916-robustness\.js/);assert.doesNotMatch(html,/v0915-robustness\.js/,'old competing robustness renderer must not load');assert.equal(pkg.version,'0.9.16');
console.log('V0.9.16 robustness + EDC persistence checks passed');
