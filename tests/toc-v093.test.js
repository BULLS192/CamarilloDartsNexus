import fs from 'node:fs';
import assert from 'node:assert/strict';

const sourcePath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const src=fs.readFileSync(sourcePath,'utf8');

// V0.9.3 established these reliability guarantees. Later V0.9.x releases may
// legitimately tune checkpoint cadence/version while retaining the behavior.
assert.match(src,/const VERSION='0\.9\.\d+';/);
assert.match(src,/Math\.min\(5000,Number\(process\.env\.TOC_MAX_PAGES\)\|\|2000\)/);
assert.match(src,/const toPersist=crawl\.records\.filter\(r=>existing\.get\(r\.tocId\)!==r\.signature\)/);
assert.match(src,/existing\.has\(r\.tocId\)&&existing\.get\(r\.tocId\)!==r\.signature/);
assert.match(src,/for\(let i=0;i<toPersist\.length;i\+=100\)/);
assert.match(src,/for\(let i=0;i<changed\.length;i\+=100\)/);
assert.match(src,/p\.page===1\|\|p\.page%\d+===0/,'periodic TOC checkpoint persistence must remain enabled');
assert.doesNotMatch(src,/if\(crawl\.complete\)\{\s*const qp=new URLSearchParams/);

console.log('TOC V0.9.3+ reliability tests passed');
