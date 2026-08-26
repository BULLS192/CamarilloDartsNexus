import assert from 'node:assert/strict';
import {nexusRatingV2,bullshooterEstimate,camarilloEstimate} from '../src/nexus-rating.js';

const near=(a,b,t=.15)=>assert.ok(Math.abs(a-b)<=t,`${a} not within ${t} of ${b}`);

{
  const c=camarilloEstimate({games01:0,last30PPD:30,last10PPD:35},'ppd');
  assert.equal(c.included,false);assert.equal(c.rawWeight,0);
}
{
  const a=camarilloEstimate({games01:5,last30PPD:25,last10PPD:25},'ppd');
  const b=camarilloEstimate({games01:20,last30PPD:25,last10PPD:25},'ppd');
  const c=camarilloEstimate({games01:80,last30PPD:25,last10PPD:25},'ppd');
  assert.ok(a.rawWeight<b.rawWeight&&b.rawWeight<c.rawWeight);assert.ok(c.rawWeight<1.05);
}
{
  const up=bullshooterEstimate({ppd:24,last50PPD:24,last20PPD:25,last10PPD:26,last50PPDSampleSize:50},'ppd');
  const down=bullshooterEstimate({ppd:24,last50PPD:24,last20PPD:23,last10PPD:22,last50PPDSampleSize:50},'ppd');
  assert.ok(up.value>24);assert.ok(down.value<24);near(up.value-24,24-down.value,.05);
}
{
  const r=nexusRatingV2({playerId:'p',bullshooter:{ppd:24,last50PPD:24.2,last20PPD:24.4,last10PPD:24.5,mpr:2.4,last50MPR:2.42,last20MPR:2.45,last10MPR:2.44,last50PPDSampleSize:50,last50MPRSampleSize:50,currentStatsDiagnostics:{x01Count:120,cricketCount:150}},edc:{confirmed:true,ppd:24.5,mpr:2.43,games:120},toc:{ppd:24.1,mpr:2.45},camarillo:{games01:0,gamesCricket:0}});
  near(r.nexusPPD,24.3,.3);near(r.nexusMPR,2.43,.05);near(r.rating,48.6,.8);assert.ok(r.confidence>=85);assert.equal(r.contribution.Camarillo,0);
}
{
  const r=nexusRatingV2({playerId:'p',bullshooter:{last50PPD:24,last20PPD:24,last10PPD:24,last50MPR:2.4,last20MPR:2.4,last10MPR:2.4,last50PPDSampleSize:50,last50MPRSampleSize:50,currentStatsDiagnostics:{x01Count:100,cricketCount:100}},edc:{confirmed:true,ppd:24.4,mpr:2.42,games:100},toc:{ppd:34,mpr:3.5},camarillo:{games01:0,gamesCricket:0}});
  assert.ok(r.nexusPPD<25);assert.ok(r.nexusMPR<2.5);assert.ok(r.disciplines.ppd.sources.find(x=>x.source==='TOC').outlier);
}
{
  const r=nexusRatingV2({playerId:'p',bullshooter:{last50PPD:30,last20PPD:30,last10PPD:30,last50MPR:3.5,last20MPR:3.5,last10MPR:3.5,last50PPDSampleSize:50,last50MPRSampleSize:50,currentStatsDiagnostics:{x01Count:80,cricketCount:80}},edc:{confirmed:true,ppd:35,mpr:4.2,games:0},camarillo:{games01:0,gamesCricket:0}});
  assert.ok(r.nexusPPD<32);assert.ok(r.nexusMPR<3.8);assert.ok(r.contribution.BullShooter>r.contribution.EDC);
}
{
  const base={playerId:'p',bullshooter:{last50PPD:24,last20PPD:24,last10PPD:24,last50MPR:2.4,last20MPR:2.4,last10MPR:2.4,last50PPDSampleSize:50,last50MPRSampleSize:50,currentStatsDiagnostics:{x01Count:100,cricketCount:100}}};
  const r0=nexusRatingV2({...base,camarillo:{games01:0,gamesCricket:0,last30PPD:27,last30MPR:2.7}});
  const r10=nexusRatingV2({...base,camarillo:{games01:10,gamesCricket:10,last30PPD:27,last10PPD:27,last30MPR:2.7,last10MPR:2.7}});
  const r80=nexusRatingV2({...base,camarillo:{games01:80,gamesCricket:80,last30PPD:27,last10PPD:27,last30MPR:2.7,last10MPR:2.7}});
  assert.ok(r0.rating<r10.rating&&r10.rating<r80.rating);assert.equal(r0.contribution.Camarillo,0);assert.ok(r80.contribution.Camarillo>r10.contribution.Camarillo);
}
{
 const r=nexusRatingV2({playerId:'p',bullshooter:{mpr:2,last50MPR:2,last50MPRSampleSize:50,currentStatsDiagnostics:{cricketCount:50}},camarillo:{games01:0,gamesCricket:0}});
 assert.equal(r.rating,null);assert.equal(r.nexusPPD,null);assert.ok(r.nexusMPR>0);assert.ok(r.confidence<60);
}

console.log('Nexus Rating V2 tests passed');
