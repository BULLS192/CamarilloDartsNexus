import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('../public/v090.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/v090.css',import.meta.url),'utf8');

for(const marker of ['BullShooter','PPD/TOC','EDC / EVP','Nexus Working','stats-source-grid','/edc-sync']){
  assert.ok(js.includes(marker),`stats source UI missing ${marker}`);
}
for(const marker of ['stats-source-grid','stats-source-card','source-divergence']){
  assert.ok(css.includes(marker),`stats source CSS missing ${marker}`);
}
console.log('Stats sources UI contract passed');
