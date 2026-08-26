import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const kr=computeNexusRating(kevin);
assert.equal(kr.rating,41.3,'Kevin production-shaped BullShooter evidence must rate 41.3 on PPD + 10*MPR');
assert.equal(kr.ratingScaleMax,150,'Nexus Rating theoretical doubles ceiling must be 150');
assert.equal(kr.evidenceWeight,36.4,'Kevin must carry 36.4 evidence weight from 41 X01 + 69 Cricket games');
assert.equal(kr.nexusPPD,17.87);assert.equal(kr.nexusMPR,2.34);

const laine={bullshooter:{id:'99755',ppd:26.6,mpr:3.07,last50PPD:28.06,last50MPR:3,last20PPD:30.9,last20MPR:3.22,last10PPD:29.63,last10MPR:3.61,currentStatsDiagnostics:{x01Count:291,cricketCount:874}},edc:{confirmed:true,ppd:26.84,mpr:3,games:570}};
const lr=computeNexusRating(laine,{tocConfirmed:true,toc:{ppd:28.582,mpr:3.458}});
assert.equal(lr.rating,60.4,'Laine multi-source production-shaped rating must be 60.4');
assert.equal(lr.evidenceWeight,100,'Laine must have full external evidence weight: BS40 + EDC30 + TOC30');
assert.deepEqual(lr.sourceWeights,{bullshooter:40,edc:30,toc:30,camarillo:0});

const joiely={bullshooter:{id:'172950',mpr:4.13,last50PPD:33.49,last50MPR:4,last20PPD:32.44,last20MPR:3.75,last10PPD:34.64,last10MPR:4.01,currentStatsDiagnostics:{x01Count:194,cricketCount:184}}};
const jr=computeNexusRating(joiely,{tocConfirmed:true,toc:{ppd:42.05,mpr:4.205}});
assert.equal(jr.rating,77.6,'Joiely BS + verified TOC production-shaped rating must be 77.6');
assert.equal(jr.evidenceWeight,70);

const gregorio={bullshooter:{id:'238873',ppd:26.98,mpr:3.5,last50PPD:30.01,last50MPR:3.49,last20PPD:31.29,last20MPR:3.42,last10PPD:32.24,last10MPR:3.47,currentStatsDiagnostics:{x01Count:63,cricketCount:213}},edc:{confirmed:true,ppd:32.68,mpr:4.19}};
const gr=computeNexusRating(gregorio);
assert.equal(gr.rating,67.3,'confirmed EDC with unknown games receives only provisional 10 total weight');
assert.equal(gr.sourceWeights.edc,10);

const ui=read('public/v1000-rating.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/\/api\/players\/nexus-rating/,'rating runtime must fetch the dedicated endpoint');
assert.match(ui,/NEXUS RATING','BS \/ CD RATING'/,'runtime must upgrade the existing BS/CD Rating column rather than insert another table column');
assert.match(ui,/byBullshooterId/,'runtime must map ratings by BullShooter ID');
assert.match(ui,/Nexus Rating \$\{fmt\(entry\.rating,1\)\}\/150/,'runtime must display the native 150-point rating scale');
assert.doesNotMatch(ui,/subtree:true/,'rating observer must not watch nested mutations');
assert.match(store,/export async function getNexusRatingIndexSql\(\)/,'store must expose SQL Nexus Rating reader');
assert.ok(/rpc\/camarillo_nexus_rating_index/.test(store)||/rpc\/camarillo_player_metrics_index/.test(store),'transport must use the rating RPC or the V0.10.1 unified metrics RPC');
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/,'server must expose Nexus Rating endpoint');
assert.match(html,/v1000-rating\.js\?v=0\.10\.[01]/,'final page must load the V0.10 rating runtime with cache busting');
assert.match(html,/v1000-rating\.css\?v=0\.10\.[01]/,'final page must load V0.10 rating styling');
const marker=JSON.parse(read('.v1000-rating-applied'));assert.equal(marker.version,'0.10.0');assert.equal(marker.route,'/api/players/nexus-rating');
const [major=0,minor=0,patch=0]=String(pkg.version).split('.').map(Number);assert.ok(major>0||minor>10||(minor===10&&patch>=0),'package must be V0.10.0 or later');
console.log('V0.10.0+ Nexus Rating contract passed: native PPD + 10*MPR scale; Kevin 41.3, Laine 60.4, Joiely 77.6.');
