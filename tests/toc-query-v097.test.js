import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/src/dartstoc.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const toc=read('src/dartstoc.js');
const pkg=JSON.parse(read('package.json'));

assert.equal(pkg.version,'0.9.7');
assert.match(toc,/const VERSION='0\.9\.7'/);
assert.match(toc,/const REMOTE_PLAYER_SELECT=/,'TOC reads should use a lightweight explicit column list');
assert.doesNotMatch(toc,/player_name\.ilike\.\$\{like\},vendor\.ilike\.\$\{like\},mpid\.ilike/,'text search must not force wildcard MPID scans');
assert.match(toc,/if\(\/\^\\d\+\$\/\.test\(query\)\)parts\.push\(`mpid=eq\./,'numeric MPID search should use exact indexed lookup');
assert.match(toc,/\(player_name\.ilike\.\$\{like\},vendor\.ilike\.\$\{like\}\)/,'text search should stay on trigram-indexed name/vendor fields');
assert.match(toc,/select=\$\{encodeURIComponent\(REMOTE_PLAYER_SELECT\)\}/,'direct TOC player lookup should avoid raw_data');
assert.match(toc,/return r\.raw_data&&typeof r\.raw_data==='object'\?\{\.\.\.r\.raw_data,\.\.\.mapped\}:mapped/,'lightweight rows must still reconstruct full TOC objects');
console.log('V0.9.7 TOC query performance checks passed');
