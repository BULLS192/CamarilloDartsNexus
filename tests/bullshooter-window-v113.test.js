import fs from 'node:fs';
import assert from 'node:assert/strict';

const bull=fs.readFileSync('src/bullshooter.js','utf8');
const css=fs.readFileSync('public/v1000-rating.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.match(bull,/for\(let attempt=1;attempt<=3;attempt\+\+\)/,'recent BullShooter game requests should retry transient failures');
assert.match(bull,/recent01Games=x01\.rows\.slice\(0,50\)/,'retain all 50 recent 01 games');
assert.match(bull,/recentCricketGames=cricket\.rows\.slice\(0,50\)/,'retain all 50 recent Cricket games');
assert.match(bull,/last50MPR=avg\(cricket\.rows,50\)/,'calculate BS50 MPR from real recent Cricket rows');
for(const grade of ['s','a','b','c','d'])assert.match(css,new RegExp(`robustness-grade\\.grade-${grade}`),`grade ${grade.toUpperCase()} should have a dedicated color style`);
assert.match(html,/v1000-rating\.js\?v=0\.11\.3/,'browser should receive the V0.11.3 rating runtime');
assert.equal(pkg.version,'0.11.3');

console.log('V0.11.3 BullShooter recent-window reliability + robustness color checks passed.');
