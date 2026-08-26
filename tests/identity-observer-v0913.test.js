import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/public/v0912-identity.js')?'/app':process.cwd();
const src=fs.readFileSync(`${root}/public/v0912-identity.js`,'utf8');
// RAW TOC enhancement must be idempotent. An observer callback may not
// unconditionally rewrite textContent because that mutation retriggers the observer.
assert.match(src,/if\(b\.classList\.contains\('identity-raw-link'\)\)continue/,'TOC button enhancement must be guarded');
assert.doesNotMatch(src,/for\(const b of host\.querySelectorAll\('\.toc-use'\)\)\{b\.textContent=/,'must not unconditionally rewrite observed TOC button children');
assert.match(src,/new MutationObserver\(augmentToc\)/,'RAW TOC observer remains supported');
console.log('V0.9.13 identity observer safety checks passed');
