import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app')?'/app':'.';
const ui=fs.readFileSync(`${root}/public/v1000-rating.js`,'utf8');
const css=fs.readFileSync(`${root}/public/v1000-rating.css`,'utf8');
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));
const marker=JSON.parse(fs.readFileSync(`${root}/.v111-camarillo-rating-grades-applied`,'utf8'));
const table=JSON.parse(fs.readFileSync(`${root}/.v1003-player-table-applied`,'utf8'));

assert.ok(ui.includes("const EXPECTED=['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS'];"),'Players schema must include separate Camarillo and Nexus columns');
assert.ok(ui.includes("CAMARILLO:'Camarillo Rating'"),'Camarillo column must be explicitly named Camarillo Rating');
assert.ok(ui.includes('const camarilloMarkup=entry=>'),'Camarillo source rating renderer must exist');
assert.ok(ui.includes('0 Camarillo games'),'Camarillo rating must visibly remain zero before local games exist');
assert.ok(ui.includes("const robustnessGrade=score=>Number(score)>=85?'S':Number(score)>=70?'A':Number(score)>=50?'B':Number(score)>=25?'C':'D';"),'Robustness grade thresholds must be S/A/B/C/D');
assert.ok(ui.includes('<strong>${grade}</strong><small>${r.score} / 100</small>'),'Robustness must show the letter prominently with numeric score underneath');
assert.ok(!ui.includes('<small>${r.label||\'Thin\'}</small>'),'Legacy word labels must not be rendered in the canonical Players table');
assert.ok(css.includes('.robustness-badge.robustness-grade'),'Robustness letter-grade styling must be present');
assert.equal(pkg.version,'0.11.1');
assert.deepEqual(table.schema,['PLAYER','CONTACT','HOME','BULLSHOOTER','BS CURRENT','BS50','BS20','BS10','CAMARILLO','NEXUS RATING','ROBUSTNESS','ACTIONS']);
assert.equal(table.statCells.camarillo,8);
assert.equal(table.statCells.nexusRating,9);
assert.equal(table.statCells.robustness,10);
assert.equal(marker.camarilloZeroUntilGames,true);
assert.equal(marker.robustnessMathChanged,false);
assert.equal(marker.robustnessDisplay,'S/A/B/C/D');

console.log('V0.11.1 checks passed: Camarillo is a distinct local-play rating; robustness displays S/A/B/C/D without changing robustness math.');
