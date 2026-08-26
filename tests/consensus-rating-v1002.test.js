import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const joshua={bullshooter:{id:'180864',last50PPD:35.62,last20PPD:35.65,last10PPD:35.89,last50MPR:4.33,last20MPR:4.42,last10MPR:4.37,currentStatsDiagnostics:{x01Count:500,cricketCount:500}},edc:{confirmed:true,ppd:37.65,mpr:4.66,games:324}};
const j=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:37.455,mpr:4.67,ppdSource:'5Z2H44',mprSource:'5Z2H44'}});
assert.equal(j.rating,82.2,'production-shaped Joshua consensus must be NX82.2');
assert.deepEqual(j.sourceRatings,{bullshooter:79.3,edc:84.3,toc:84.2,camarillo:null});
assert.deepEqual(j.sourceBaseWeights,{bullshooter:40,edc:30,toc:20,camarillo:0});
assert.deepEqual(j.sourceWeights,{bullshooter:44,edc:37.5,toc:25,camarillo:0});
assert.deepEqual(j.agreementFactors,{bullshooter:1.1,edc:1.25,toc:1.25,camarillo:1});
assert.equal(j.independentSourceCount,3);assert.equal(j.formulaVersion,'1.2.0');assert.equal(j.ratingScaleMax,150);

const outlier={bullshooter:{last50PPD:30,last20PPD:30,last10PPD:30,last50MPR:3,last20MPR:3,last10MPR:3,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},edc:{confirmed:true,ppd:30.5,mpr:3.05,games:80},camarillo:{last30PPD:50,last30MPR:6,games01:30,gamesCricket:30}};
const o=computeNexusRating(outlier,{tocConfirmed:true,toc:{ppd:30.3,mpr:3.02,ppdSource:'Tournament',mprSource:'Tournament'}});
assert.equal(o.outlierFactors.camarillo,.6,'a source more than 12 rating points from a 3+ source consensus must be strongly discounted');
assert.ok(o.rating<70,'one extreme local source must not dominate three agreeing external sources');

const dup=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:35.7,mpr:4.36,ppdSource:'BullShooter',mprSource:'Arachnid'}});
assert.equal(dup.independenceFactors.toc,.35);assert.equal(dup.sourceBaseWeights.toc,7);assert.equal(dup.agreementFactors.toc,1);

const pkg=JSON.parse(read('package.json')),html=read('public/index.html'),server=read('server.js'),store=read('src/store.js');
assert.equal(pkg.version,'0.10.2');
assert.match(html,/v1000-rating\.js\?v=0\.10\.2/);assert.match(html,/v1000-rating\.css\?v=0\.10\.2/);
assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
assert.match(store,/rpc\/camarillo_player_metrics_index/,'consensus rating must still use the unified rating+robustness payload');
assert.match(server,/\/api\/players\/nexus-rating/,'Nexus Rating endpoint must remain available');
const marker=JSON.parse(read('.v1002-consensus-rating-applied'));assert.equal(marker.version,'0.10.2');assert.equal(marker.ratingFormulaVersion,'1.2.0');assert.equal(marker.scaleMax,150);assert.equal(marker.duplicateTocFactor,.35);
console.log('V0.10.2 consensus rating deployment contract passed: Joshua BS79.3 + EDC84.3 + TOC84.2 => NX82.2; duplicate/outlier controls active.');
