import fs from 'node:fs';
import assert from 'node:assert/strict';

const sourcePath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const src=fs.readFileSync(sourcePath,'utf8');

assert.match(src,/const TOC_SYNC_STRATEGY='prefix-shards-v1'/);
assert.match(src,/export async function crawlBestKnownSharded/);
assert.match(src,/const queue=.*TOC_SHARD_ROOTS/);
assert.match(src,/const saturated=pager\.some\(n=>n>1\)\|\|rows\.length>=PAGE_SIZE_HINT/);
assert.match(src,/failedShards\.push\(\{prefix:shard\.prefix,error:/);
assert.match(src,/complete:failedShards\.length===0/);
assert.match(src,/const crawl=await crawlBestKnownSharded\(\{onProgress:/);
assert.match(src,/strategy:crawl\.strategy\|\|TOC_SYNC_STRATEGY/);
assert.match(src,/failedShards:crawl\.failedShards\|\|\[\]/);
assert.doesNotMatch(src,/playerName==='\.\.\.'/,'pager artifact must not be retained as a player');

console.log('TOC V0.11.4 sharded sync tests passed');
