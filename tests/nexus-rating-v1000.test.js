import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const kevin={bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const kr=computeNexusRating(kevin);
assert.equal(kr.rating,41.3,'Kevin production-shaped BullShooter evidence must rate 41.3');
assert.equal(kr.ratingScaleMax,150);assert.equal(kr.formulaVersion,'1.2.0');
assert.deepEqual(kr.ratingWeights,{bullshooter:40,edc:30,toc:20,camarillo:20});
assert.equal(kr.evidenceWeight,36.4);assert.equal(kr.nexusPPD,17.87);assert.equal(kr.nexusMPR,2.34);

const joshua={bullshooter:{id:'180864',last50PPD:35.62,last20PPD:35.65,last10PPD:35.89,last50MPR:4.33,last20MPR:4.42,last10MPR:4.37,currentStatsDiagnostics:{x01Count:999,cricketCount:999}},edc:{confirmed:true,ppd:37.65,mpr:4.66,games:324}};
const jx=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:37.455,mpr:4.67,ppdSource:'5Z2H44',mprSource:'5Z2H44'}});
assert.equal(jx.sourceRatings.edc,84.3);assert.equal(jx.sourceRatings.toc,84.2);
assert.ok(jx.sourceRatings.bullshooter>=79&&jx.sourceRatings.bullshooter<=80,'Joshua BullShooter established rating should be around 79');
assert.equal(jx.rating,82.2,'Joshua three-source consensus must land at 82.2');
assert.equal(jx.agreementFactors.edc,1.25,'EDC and TOC agreement within 2 points must boost EDC influence');
assert.equal(jx.agreementFactors.toc,1.25,'EDC and TOC agreement within 2 points must boost TOC influence');
assert.equal(jx.agreementFactors.bullshooter,1.1,'BullShooter within 5 points gets the smaller agreement multiplier');
assert.equal(jx.sourceWeights.edc,37.5);assert.equal(jx.sourceWeights.toc,25);

const laine={bullshooter:{id:'99755',ppd:26.6,mpr:3.07,last50PPD:28.06,last50MPR:3,last20PPD:30.9,last20MPR:3.22,last10PPD:29.63,last10MPR:3.61,currentStatsDiagnostics:{x01Count:291,cricketCount:874}},edc:{confirmed:true,ppd:26.84,mpr:3,games:570}};
const lr=computeNexusRating(laine,{tocConfirmed:true,toc:{ppd:28.582,mpr:3.458,ppdSource:'Tournament',mprSource:'Tournament*'}});
assert.equal(lr.rating,60.1);assert.equal(lr.evidenceWeight,90);assert.equal(lr.independenceFactors.toc,1);

const duplicate={bullshooter:{last50PPD:30,last20PPD:30,last10PPD:30,last50MPR:3,last20MPR:3,last10MPR:3,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},edc:{confirmed:true,ppd:31,mpr:3.1,games:80}};
const dr=computeNexusRating(duplicate,{tocConfirmed:true,toc:{ppd:30.2,mpr:3.02,ppdSource:'BullShooter',mprSource:'Arachnid BullShooter'}});
assert.equal(dr.independenceFactors.toc,.35,'explicit BullShooter-derived TOC provenance must be discounted');
assert.equal(dr.sourceBaseWeights.toc,7,'duplicate TOC weight must be 35% of the normal 20');
assert.equal(dr.agreementFactors.toc,1,'a known duplicate source must not receive an agreement bonus');

const gregorio={bullshooter:{id:'238873',ppd:26.98,mpr:3.5,last50PPD:30.01,last50MPR:3.49,last20PPD:31.29,last20MPR:3.42,last10PPD:32.24,last10MPR:3.47,currentStatsDiagnostics:{x01Count:63,cricketCount:213}},edc:{confirmed:true,ppd:32.68,mpr:4.19}};
const gr=computeNexusRating(gregorio);assert.equal(gr.rating,67.3);assert.equal(gr.sourceBaseWeights.edc,10);

const ui=read('public/v1000-rating.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/\/api\/players\/nexus-rating/);assert.match(ui,/NEXUS RATING','BS \/ CD RATING'/);assert.match(ui,/byBullshooterId/);assert.match(ui,/Nexus Rating \$\{fmt\(entry\.rating,1\)\}\/150/);assert.doesNotMatch(ui,/subtree:true/);
assert.match(store,/export async function getNexusRatingIndexSql\(\)/);assert.ok(/rpc\/camarillo_player_metrics_index/.test(store)||/rpc\/camarillo_nexus_rating_index/.test(store));
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(html,/v1000-rating\.js\?v=0\.10\.[012]/);assert.match(html,/v1000-rating\.css\?v=0\.10\.[012]/);
const [major=0,minor=0,patch=0]=String(pkg.version).split('.').map(Number);assert.ok(major>0||minor>10||(minor===10&&patch>=0));
console.log('V0.10.2 consensus Nexus Rating checks passed: Joshua 79.3/84.3/84.2 => NX82.2; duplicate TOC provenance discounted.');
