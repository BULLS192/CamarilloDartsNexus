import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/public/v0912-identity.js')?'/app':process.cwd();
const src=fs.readFileSync(`${root}/public/v0912-identity.js`,'utf8');
// RAW TOC enhancement must be idempotent. An observer callback may not
// unconditionally rewrite textContent because that mutation retriggers the observer.
assert.match(src,/if\(b\.classList\.contains\('identity-raw-link'\)\)continue/,'TOC button enhancement must be guarded');
assert.doesNotMatch(src,/for\(const b of host\.querySelectorAll\('\.toc-use'\)\)\{b\.textContent=/,'must not unconditionally rewrite observed TOC button children');
assert.match(src,/new MutationObserver\(augmentToc\)/,'RAW TOC observer remains supported');

// V0.11.4 reliability contract: a transient TOC page failure must not throw
// away all successful directory work and force every future run back to page 1.
const toc=fs.readFileSync(`${root}/src/dartstoc.js`,'utf8');
assert.match(toc,/const TOC_SYNC_STRATEGY='prefix-shards-v1'/,'TOC background sync must use deterministic prefix shards');
assert.match(toc,/export async function crawlBestKnownSharded/,'failure-isolated sharded crawler must be installed');
assert.match(toc,/failedShards\.push\(\{prefix:shard\.prefix,error:/,'individual shard failures must be captured instead of aborting the crawl');
assert.match(toc,/complete:failedShards\.length===0/,'TOC run is complete only when every shard succeeds');
assert.match(toc,/const crawl=await crawlBestKnownSharded\(\{onProgress:/,'background sync must use the failure-isolated crawler');
assert.match(toc,/\.filter\(r=>r\.playerName!=='\.\.\.'\)/,'pager ellipsis must never be persisted as a player');
assert.match(toc,/failedShards:crawl\.failedShards\|\|\[\]/,'sync audit metadata must expose any missing shards');

console.log('V0.9.13 identity safety + TOC failure-isolation checks passed');
