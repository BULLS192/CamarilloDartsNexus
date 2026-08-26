import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/public/v094-player-intel.js')?'/app':process.cwd();
const ui=fs.readFileSync(`${root}/public/v094-player-intel.js`,'utf8');
const robust=fs.existsSync(`${root}/public/v0915-robustness.js`)?fs.readFileSync(`${root}/public/v0915-robustness.js`,'utf8'):'';
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));
if(robust){
  assert.match(robust,/textContent\.trim\(\)\.toUpperCase\(\)==='BULLSHOOTER'/,'robustness must locate the BullShooter column by header, not numeric position');
  assert.match(robust,/state\.byBs\.get\(id\)/,'row mapping must use BullShooter ID as the primary key');
  assert.match(robust,/const id=bsId\(row,table\)/,'BullShooter cell resolution must happen before name fallback');
  assert.doesNotMatch(robust,/const text=row\?\.textContent\|\|'',bs=\(text\.match/,'whole-row number scanning must not be the primary mapper');
}else{
  assert.match(ui,/function bullshooterIdForRow\(row\)/,'robustness must resolve the BullShooter cell directly');
  assert.match(ui,/textContent\.trim\(\)\.toUpperCase\(\)==='BULLSHOOTER'/,'robustness must locate the BullShooter column by header, not numeric position');
  assert.match(ui,/playerByBsId\.get\(bs\)/,'row mapping must use BullShooter ID as the primary key');
  assert.match(ui,/row\.dataset\.bullshooterId=bs/,'resolved BullShooter ID should be cached on the row');
  const fnStart=ui.indexOf('function playerForRow(row)');
  const exact=ui.indexOf('playerByBsId.get(bs)',fnStart);
  const cached=ui.indexOf('dataset?.nexusPlayerId',fnStart);
  assert.ok(fnStart>=0&&exact>fnStart&&cached>exact,'BullShooter exact lookup must happen before stale row-cache/name fallback');
  assert.doesNotMatch(ui,/const text=row\?\.textContent\|\|'',bs=\(text\.match/,'whole-row number scanning must not be the primary mapper');
}
const [major=0,minor=0,patch=0]=String(pkg.version||'0.0.0').split('.').map(Number);
assert.ok(major>0||minor>9||(minor===9&&patch>=14),`Expected V0.9.14 or later, got ${pkg.version}`);
console.log('V0.9.14+ robustness mapping checks passed');
