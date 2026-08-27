import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const rating=read('public/v0711.js'),bull=read('public/v077.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.doesNotMatch(rating,/cells\[9\]\.innerHTML=ratingMarkup/,'legacy BS/CD rating may not use a hard-coded cell index');
if(html.includes('/v1000-rating.js')){
  const unified=read('public/v1000-rating.js');
  assert.match(rating,/CDNexusPlayerMetricsV1001|CDNexusRatingV1000/,'legacy rating must delegate once unified metrics is active');
  assert.doesNotMatch(rating,/async function patchRatings\(\)\{[\s\S]{0,500}ratingMarkup\(/,'legacy rating may not repaint the unified rating cells');
  if(/function canonicalize\(t\)/.test(unified)){
    const canon=unified.indexOf('canonicalize(t);'),ratingIdx=unified.indexOf("headerIndex(t,'NEXUS RATING')");
    assert.ok(canon>=0&&ratingIdx>canon,'table must canonicalize before resolving Nexus Rating');
    if(String(pkg.version).startsWith('0.11.')){
      assert.match(unified,/const camarillo=take\('CAMARILLO'\)/,'Camarillo source cell must be preserved separately');
      assert.match(unified,/const rating=take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/,'Nexus must absorb legacy blended rating headers without consuming Camarillo');
      assert.match(unified,/const EXPECTED=\['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'\]/,'V0.11 must use separate Camarillo and Nexus columns');
    }
  }
  assert.match(unified,/headerIndex\(t,'CAMARILLO'\)/,'unified renderer must resolve Camarillo semantically');
  assert.match(unified,/headerIndex\(t,'ROBUSTNESS'\)/,'unified robustness must resolve semantically');
  assert.match(unified,/camarilloCell\.innerHTML=camarilloMarkup\(entry\)/,'unified runtime must display local Camarillo rating');
  assert.match(unified,/robustCell\.innerHTML=robustnessMarkup\(r\)/,'unified runtime must display Robustness in its dedicated cell');
  assert.match(unified,/ratingCell\.innerHTML=ratingMarkup\(entry\)/,'unified runtime must display Nexus Rating in its dedicated cell');
  assert.doesNotMatch(html,/v0918-table\.js/,'obsolete V0.9 robustness runtime must remain retired');
  assert.match(unified,/current:headerIndex\(t,'BS CURRENT'\),bs50:headerIndex\(t,'BS50'\),bs20:headerIndex\(t,'BS20'\),bs10:headerIndex\(t,'BS10'\)/,'BullShooter columns must be header-driven');
  assert.match(bull,/async function patchDisplays\(\)\{[\s\S]{0,300}CDNexusPlayerMetricsV1001/,'retired BullShooter renderer must delegate');
  assert.doesNotMatch(bull,/async function patchDisplays\(\)\{[\s\S]{0,700}last50PPD/,'legacy BullShooter renderer must not repaint rows');
}else{
  assert.match(rating,/ratingIdx=hs\.findIndex/,'legacy rating must resolve its header semantically');
}
assert.doesNotMatch(html,/v0916-robustness\.js/,'old robustness renderer must not compete with current table ownership');
const parts=String(pkg.version).split('.').map(Number);assert.ok(parts[0]>0||parts[1]>9||(parts[1]===9&&parts[2]>=17),'package must be V0.9.17 or later');
console.log('V0.9.17+ semantic player-table contract checks passed');