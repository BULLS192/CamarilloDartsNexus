import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const rating=read('public/v0711.js'),bull=read('public/v077.js'),html=read('public/index.html'),pkg=JSON.parse(read('package.json'));
assert.doesNotMatch(rating,/cells\[9\]\.innerHTML=ratingMarkup/,'BS/CD rating may not use a hard-coded cell index');
if(html.includes('/v1000-rating.js')){
  const unified=read('public/v1000-rating.js');
  assert.match(rating,/CDNexusPlayerMetricsV1001|CDNexusRatingV1000/,'legacy rating must delegate once unified metrics is active');
  assert.doesNotMatch(rating,/async function patchRatings\(\)\{[\s\S]{0,500}ratingMarkup\(/,'legacy rating may not repaint the unified Nexus Rating cell');
  if(/function canonicalize\(t\)/.test(unified)){
    const canon=unified.indexOf('canonicalize(t);'),ratingIdx=unified.indexOf("headerIndex(t,'NEXUS RATING')");
    assert.ok(canon>=0&&ratingIdx>canon,'V0.10.3+ must canonicalize the table before resolving Nexus Rating');
    assert.match(unified,/take\('NEXUS RATING','BS \/ CD RATING','RATING'\)/,'canonicalizer must absorb legacy rating headers');
  }else{
    assert.match(unified,/headerIndex\(t,'NEXUS RATING','BS \/ CD RATING'\)/,'unified rating must resolve its target semantically');
  }
  assert.match(unified,/headerIndex\(t,'ROBUSTNESS'\)/,'unified robustness must resolve its target semantically');
  assert.match(unified,/robustCell\.innerHTML=robustnessMarkup\(r\)/,'unified runtime must display Robustness in the dedicated cell');
  assert.match(unified,/ratingCell\.innerHTML=ratingMarkup\(entry\)/,'unified runtime must display Nexus Rating in the dedicated cell');
  assert.doesNotMatch(html,/v0918-table\.js/,'V0.10.1+ must not load a competing V0.9 robustness writer');
}else{
  assert.match(rating,/ratingIdx=hs\.findIndex/,'BS/CD rating must resolve its header semantically');
  const active=html.includes('/v0918-table.js')?read('public/v0918-table.js'):read('public/v0917-table.js');
  if(html.includes('/v0918-table.js')){
    assert.match(active,/const EXPECTED=/,'V0.9.18+ must own one canonical Players table schema');
    assert.match(active,/row\.replaceChildren\(\.\.\.ordered\)/,'V0.9.18+ must structurally normalize player rows');
    assert.match(active,/row\.cells\[10\]/,'V0.9.18+ must write Robustness only after canonicalizing the schema');
  }else{
    assert.match(active,/robIdx=hidx\(t,'ROBUSTNESS'\)/,'V0.9.17 must use the actual Robustness header index');
    assert.match(active,/cell\.dataset\.v0917Sig!==sig\|\|!cell\.querySelector\('\.robustness-badge'\)/,'V0.9.17 must repair overwritten robustness cells');
  }
  assert.match(active,/R \$\{entry\.score\}/,'Robustness cell must display the robustness score, not the rating block');
}
assert.doesNotMatch(bull,/cells\[4\]\.textContent/,'BullShooter current may not use a hard-coded cell index');
assert.match(bull,/const cur=idx\('BS CURRENT'\),i50=idx\('BS50'\),i20=idx\('BS20'\),i10=idx\('BS10'\)/,'BullShooter display must resolve columns by headers');
assert.doesNotMatch(html,/v0916-robustness\.js/,'old renderer must not compete with current table ownership');
const parts=String(pkg.version).split('.').map(Number);assert.ok(parts[0]>0||parts[1]>9||(parts[1]===9&&parts[2]>=17),'package must be V0.9.17 or later');
console.log('V0.9.17+ semantic player-table contract checks passed');
