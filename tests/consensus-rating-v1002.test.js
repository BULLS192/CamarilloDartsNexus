import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating} from '../src/nexus-rating-v1000.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const joshua={bullshooter:{id:'180864',last50PPD:35.62,last20PPD:35.65,last10PPD:35.89,last50MPR:4.33,last20MPR:4.42,last10MPR:4.37,currentStatsDiagnostics:{x01Count:500,cricketCount:500}},edc:{confirmed:true,ppd:37.65,mpr:4.66,games:324}};
const j=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:37.455,mpr:4.67,ppdSource:'5Z2H44',mprSource:'5Z2H44'}});
assert.equal(j.rating,81.9,'production-shaped Joshua v2 consensus must be NX81.9');
assert.deepEqual(j.sourceRatings,{bullshooter:79.2,edc:84.3,toc:84.2,camarillo:0});
assert.deepEqual(j.sourceBaseWeights,{bullshooter:40,edc:30,toc:15,camarillo:0});
assert.deepEqual(j.sourceWeights,{bullshooter:40,edc:30,toc:15,camarillo:0});
assert.deepEqual(j.agreementFactors,{bullshooter:1,edc:1,toc:1,camarillo:1});
assert.equal(j.independentSourceCount,3);assert.equal(j.formulaVersion,'2.0.0');assert.equal(j.ratingScaleMax,150);
assert.deepEqual(j.bullshooterWindowRatings,{current:null,bs50:78.9,bs20:79.9,bs10:79.6});

const outlier={bullshooter:{last50PPD:30,last20PPD:30,last10PPD:30,last50MPR:3,last20MPR:3,last10MPR:3,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},edc:{confirmed:true,ppd:30.5,mpr:3.05,games:80},camarillo:{last30PPD:50,last30MPR:6,games01:30,gamesCricket:30}};
const o=computeNexusRating(outlier,{tocConfirmed:true,toc:{ppd:30.3,mpr:3.02,ppdSource:'Tournament',mprSource:'Tournament'}});
assert.equal(o.outlierFactors.camarillo,.5,'a source more than 12 rating points from a 3+ source consensus must be strongly discounted');
assert.equal(o.sourceRatings.camarillo,110);assert.equal(o.sourceBaseWeights.camarillo,50);assert.equal(o.sourceWeights.camarillo,25);
assert.ok(o.rating<73,'one extreme local source must be limited by three agreeing independent sources');

const dup=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:35.7,mpr:4.36,ppdSource:'BullShooter',mprSource:'Arachnid'}});
assert.equal(dup.independenceFactors.toc,.35);assert.equal(dup.sourceBaseWeights.toc,5.3);assert.equal(dup.agreementFactors.toc,1);

const pkg=JSON.parse(read('package.json')),html=read('public/index.html'),server=read('server.js'),store=read('src/store.js');
assert.equal(pkg.version,'0.11.3','package must identify the repaired Nexus v2 release');
assert.match(html,/v1000-rating\.js\?v=0\.11\.2/);assert.match(html,/v1000-rating\.css\?v=0\.11\.2/);
assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
assert.match(store,/rpc\/camarillo_player_metrics_index/,'Nexus v2 must still use the unified rating+robustness payload');
assert.match(server,/\/api\/players\/nexus-rating/,'Nexus Rating endpoint must remain available');
const marker=JSON.parse(read('.v1002-consensus-rating-applied'));assert.equal(marker.version,'0.11.3');assert.equal(marker.ratingFormulaVersion,'2.0.0');assert.equal(marker.agreementBonus,false);assert.deepEqual(marker.windowWeights,{bs50:.7,bs20:.2,bs10:.1});assert.deepEqual(marker.sourcePriorities,{bullshooter:40,edc:30,toc:20,camarillo:50});assert.equal(marker.camarilloZeroUntilGames,true);assert.equal(marker.duplicateTocFactor,.35);
console.log('V0.11.3 consensus deployment contract passed: evidence affects source influence, agreement does not inflate skill, and Camarillo begins at zero.');