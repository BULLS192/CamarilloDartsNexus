import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/src/dartstoc.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const toc=read('src/dartstoc.js');
const pkg=JSON.parse(read('package.json'));

const [major=0,minor=0,patch=0]=String(pkg.version).split('.').map(Number);
assert.ok(major>0||minor>9||(minor===9&&patch>=7),'V0.9.7+ query-performance contract requires version 0.9.7 or newer');
assert.match(toc,/const VERSION='0\.9\.\d+'/);
assert.match(toc,/const REMOTE_PLAYER_SELECT=/,'TOC reads should use a lightweight explicit column list');
assert.doesNotMatch(toc,/mpid\.ilike/,'TOC text search must never force wildcard MPID scans');
assert.ok(/rpc\/camarillo_toc_search/.test(toc)||/mpid=eq\./.test(toc),'TOC search must use an indexed/RPC fast path');
assert.match(toc,/select=\$\{encodeURIComponent\(REMOTE_PLAYER_SELECT\)\}/,'direct TOC player lookup should avoid raw_data');
assert.match(toc,/return r\.raw_data&&typeof r\.raw_data==='object'\?\{\.\.\.r\.raw_data,\.\.\.mapped\}:mapped/,'lightweight rows must still reconstruct full TOC objects');
console.log('V0.9.7+ TOC query performance checks passed');
