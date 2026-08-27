import fs from 'node:fs';
import assert from 'node:assert/strict';
import {computeNexusRating,combinedRating,bullshooterWindowRatings,bullshooterForm} from '../src/nexus-rating-v1000.js';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

assert.equal(combinedRating(20,2),40,'all visible ratings use PPD + 10*MPR');
const kevin={bullshooter:{id:'192985',ppd:17.92,mpr:2.28,last50PPD:17.63,last50MPR:2.47,last20PPD:17.43,last20MPR:2.29,last10PPD:19.15,last10MPR:2.11,currentStatsDiagnostics:{x01Count:41,cricketCount:69}}};
const kw=bullshooterWindowRatings(kevin.bullshooter);
assert.deepEqual(kw,{current:40.7,bs50:42.3,bs20:40.3,bs10:40.3});
const kf=bullshooterForm(kevin.bullshooter);
assert.equal(Math.round(kf.rating*10)/10,41.7,'BS form must favor the stable BS50 window');
const kr=computeNexusRating(kevin);
assert.equal(kr.rating,41.7,'single-source Nexus must equal the BullShooter form estimate, not shrink by robustness');
assert.equal(kr.formulaVersion,'2.0.0');assert.equal(kr.ratingScaleMax,150);
assert.deepEqual(kr.ratingWeights,{bullshooter:40,edc:30,toc:20,camarillo:50});
assert.equal(kr.evidenceWeight,36.2);assert.equal(kr.nexusPPD,17.74);assert.equal(kr.nexusMPR,2.4);
assert.equal(kr.camarilloRating,0,'Camarillo must be zero until Camarillo games exist');
assert.equal(kr.sourceRatings.camarillo,0);assert.equal(kr.sourceWeights.camarillo,0);assert.equal(kr.flags.cd,false);

const joshua={bullshooter:{id:'180864',last50PPD:35.62,last20PPD:35.65,last10PPD:35.89,last50MPR:4.33,last20MPR:4.42,last10MPR:4.37,currentStatsDiagnostics:{x01Count:999,cricketCount:999}},edc:{confirmed:true,ppd:37.65,mpr:4.66,games:324}};
const jx=computeNexusRating(joshua,{tocConfirmed:true,toc:{ppd:37.455,mpr:4.67,ppdSource:'5Z2H44',mprSource:'5Z2H44'}});
assert.equal(jx.sourceRatings.bullshooter,79.2);assert.equal(jx.sourceRatings.edc,84.3);assert.equal(jx.sourceRatings.toc,84.2);
assert.equal(jx.rating,81.9,'Nexus v2 must blend skill by evidence without agreement inflation');
assert.deepEqual(jx.agreementFactors,{bullshooter:1,edc:1,toc:1,camarillo:1},'agreement must not directly raise skill');
assert.equal(jx.sourceWeights.bullshooter,40);assert.equal(jx.sourceWeights.edc,30);assert.equal(jx.sourceWeights.toc,15);
assert.equal(jx.sourceReliability.toc,.75);

const laine={bullshooter:{id:'99755',ppd:26.6,mpr:3.07,last50PPD:28.06,last50MPR:3,last20PPD:30.9,last20MPR:3.22,last10PPD:29.63,last10MPR:3.61,currentStatsDiagnostics:{x01Count:291,cricketCount:874}},edc:{confirmed:true,ppd:26.84,mpr:3,games:570}};
const lr=computeNexusRating(laine,{tocConfirmed:true,toc:{ppd:28.582,mpr:3.458,ppdSource:'Tournament',mprSource:'Tournament*'}});
assert.equal(lr.rating,59.4);assert.equal(lr.independenceFactors.toc,1);assert.equal(lr.sourceWeights.toc,15);

const duplicate={bullshooter:{last50PPD:30,last20PPD:30,last10PPD:30,last50MPR:3,last20MPR:3,last10MPR:3,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},edc:{confirmed:true,ppd:31,mpr:3.1,games:80}};
const dr=computeNexusRating(duplicate,{tocConfirmed:true,toc:{ppd:30.2,mpr:3.02,ppdSource:'BullShooter',mprSource:'Arachnid BullShooter'}});
assert.equal(dr.independenceFactors.toc,.35,'explicit BullShooter-derived TOC provenance must still be discounted');
assert.equal(dr.sourceBaseWeights.toc,5.3,'TOC priority × reliability × duplicate factor must be applied');
assert.equal(dr.agreementFactors.toc,1,'duplicate or independent sources never receive an agreement bonus');

const gregorio={bullshooter:{id:'238873',ppd:26.98,mpr:3.5,last50PPD:30.01,last50MPR:3.49,last20PPD:31.29,last20MPR:3.42,last10PPD:32.24,last10MPR:3.47,currentStatsDiagnostics:{x01Count:63,cricketCount:213}},edc:{confirmed:true,ppd:32.68,mpr:4.19}};
const gr=computeNexusRating(gregorio);assert.equal(gr.rating,68.3);assert.equal(gr.sourceReliability.edc,.65);assert.equal(gr.sourceBaseWeights.edc,19.5);

const noLocal=computeNexusRating({bullshooter:{last50PPD:20,last50MPR:2,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},camarillo:{last30PPD:99,last30MPR:9,games01:0,gamesCricket:0}});
assert.equal(noLocal.rating,40);assert.equal(noLocal.camarilloRating,0);assert.equal(noLocal.sourceWeights.camarillo,0,'stored local averages must not count without games');
const withLocal=computeNexusRating({bullshooter:{last50PPD:20,last50MPR:2,currentStatsDiagnostics:{x01Count:50,cricketCount:50}},camarillo:{last30PPD:25,last30MPR:2.5,games01:30,gamesCricket:30}});
assert.equal(withLocal.camarilloRating,50);assert.equal(withLocal.sourceBaseWeights.camarillo,50,'mature Camarillo evidence gets the highest source priority');assert.ok(withLocal.rating>40&&withLocal.rating<50);

const ui=read('public/v1000-rating.js'),server=read('server.js'),store=read('src/store.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.match(ui,/\/api\/players\/nexus-rating/);assert.match(ui,/BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'/);assert.match(ui,/camarilloMarkup/);assert.match(ui,/robustnessGrade/);assert.match(ui,/windowMarkup\(b\.last50PPD,b\.last50MPR/);assert.match(ui,/Rating \$\{fmt\(rating,1\)\} =/);assert.match(ui,/byBullshooterId/);assert.doesNotMatch(ui,/\/150/);assert.doesNotMatch(ui,/subtree:true/);
assert.match(store,/export async function getNexusRatingIndexSql\(\)/);assert.ok(/rpc\/camarillo_player_metrics_index/.test(store)||/rpc\/camarillo_nexus_rating_index/.test(store));
assert.match(server,/\/api\/players\/nexus-rating[\s\S]{0,200}getNexusRatingIndexSql/);
assert.match(html,/v1000-rating\.js\?v=0\.11\.3/);assert.match(html,/v1000-rating\.css\?v=0\.11\.3/);
assert.equal(pkg.version,'0.11.3');
console.log('V0.11.3 Nexus v2 checks passed: stable BS50-led form, distinct Camarillo source tracking, evidence-weighted external sources, and no agreement inflation.');