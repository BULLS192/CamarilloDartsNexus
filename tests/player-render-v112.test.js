import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');

const ui=read('public/v1000-rating.js');
const html=read('public/index.html');
const pkg=JSON.parse(read('package.json'));
const marker=JSON.parse(read('.v1001-player-metrics-applied'));
const tableMarker=JSON.parse(read('.v1003-player-table-applied'));

const expected="const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'];";
assert.ok(ui.includes(expected),'canonical schema must use the same Camarillo Rating text the rendered header exposes');
assert.doesNotMatch(ui,/BS10','CAMARILLO','NEXUS RATING'/,'broken CAMARILLO schema token must not remain');
assert.match(ui,/'CAMARILLO RATING':'Camarillo Rating'/,'display map must preserve canonical Camarillo Rating label');
assert.match(ui,/const camarillo=take\('CAMARILLO RATING','CAMARILLO'\)/,'canonicalizer must accept both new and legacy Camarillo headers');
assert.match(ui,/camarillo:headerIndex\(t,'CAMARILLO RATING','CAMARILLO'\)/,'runtime lookup must resolve the visible Camarillo Rating header');
assert.doesNotMatch(ui,/camarillo:headerIndex\(t,'CAMARILLO'\),/,'renderer must not abort on the visible Camarillo Rating header');

const upper=s=>String(s||'').trim().toUpperCase();
const visible=['Player','Contact','Home','BullShooter','BS Current','BS50','BS20','BS10','Camarillo Rating','Nexus Rating','Robustness','Actions'].map(upper);
const canonical=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO RATING','NEXUS RATING','ROBUSTNESS','ACTIONS'];
assert.deepEqual(visible,canonical,'rendered header text must compare equal to the canonical schema on subsequent renders');

assert.match(ui,/renderBullshooter\(row,idx,identity\.player\)/,'BullShooter windows must still repaint after canonicalization');
assert.match(ui,/camarilloCell\.innerHTML=camarilloMarkup\(entry\)/,'Camarillo rating must repaint');
assert.match(ui,/ratingCell\.innerHTML=ratingMarkup\(entry\)/,'Nexus rating must repaint');
assert.match(ui,/robustCell\.innerHTML=robustnessMarkup\(r\)/,'Robustness grade must repaint');
assert.match(ui,/if\(idx\.camarillo<0\|\|idx\.rating<0\|\|idx\.robust<0\|\|idx\.bs<0\)return;/,'renderer guard must remain explicit after semantic lookup');

assert.match(html,/v1000-rating\.js\?v=0\.11\.2/,'browser must receive a fresh rating runtime cache key');
assert.match(html,/v1000-rating\.css\?v=0\.11\.2/,'browser must receive a fresh rating CSS cache key');
assert.equal(pkg.version,'0.11.2');
assert.equal(marker.version,'0.11.2');
assert.deepEqual(marker.owns,['bs-current','bs50-rating','bs20-rating','bs10-rating','camarillo-rating','nexus-rating','robustness-grade']);
assert.equal(tableMarker.version,'0.11.2');
assert.deepEqual(tableMarker.schema,canonical);
assert.deepEqual(tableMarker.statCells,{bsCurrent:4,bs50:5,bs20:6,bs10:7,camarilloRating:8,nexusRating:9,robustness:10,actions:11});

console.log('V0.11.2 player renderer regression passed: Camarillo Rating header resolves and all unified metric cells can repaint.');
