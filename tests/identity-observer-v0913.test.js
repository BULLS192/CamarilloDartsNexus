import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/public/v0912-identity.js')?'/app':process.cwd();
const src=fs.readFileSync(`${root}/public/v0912-identity.js`,'utf8');
assert.match(src,/if\(b\.classList\.contains\('identity-raw-link'\)\)continue/,'TOC button enhancement must be guarded');
assert.doesNotMatch(src,/for\(const b of host\.querySelectorAll\('\.toc-use'\)\)\{b\.textContent=/,'must not unconditionally rewrite observed TOC button children');
assert.match(src,/new MutationObserver\(augmentToc\)/,'RAW TOC observer remains supported');

const toc=fs.readFileSync(`${root}/src/dartstoc.js`,'utf8');
assert.match(toc,/const TOC_SYNC_STRATEGY='prefix-shards-v2-progressive'/,'TOC sync must use progressive deterministic prefix shards');
assert.match(toc,/export async function crawlBestKnownSharded/,'failure-isolated sharded crawler must be installed');
assert.match(toc,/async function persistTocRowsIncremental/,'completed shard records must have an immediate persistence path');
assert.match(toc,/const unique=new Map\(\)/,'incremental TOC persistence must deduplicate every write set');
assert.match(toc,/unique\.set\(row\.tocId,chooseBetterRecord\(unique\.get\(row\.tocId\),row\)\)/,'duplicate TOC IDs must collapse to one best record before Supabase upsert');
assert.match(toc,/const deduped=\[\.\.\.unique\.values\(\)\]/,'Supabase batches must be built from deduplicated rows');
assert.match(toc,/for\(let i=0;i<deduped\.length;i\+=100\)/,'deduplicated TOC rows must be chunked for Supabase');
assert.match(toc,/else\{persistedRows\+=await persistTocRowsIncremental\(rows\)\}/,'terminal shards must persist before the entire crawl completes');
assert.match(toc,/persistedRows\+=await persistTocRowsIncremental\(paged\.records\)/,'terminal paged fallbacks must also persist immediately');
assert.match(toc,/failedShards\.push\(\{prefix:shard\.prefix,error:/,'individual shard failures must be captured instead of aborting the crawl');
assert.match(toc,/complete:failedShards\.length===0/,'TOC run is complete only when every shard succeeds');
assert.match(toc,/\.filter\(r=>r\.playerName!=='\.\.\.'\)/,'pager ellipsis must never be persisted as a player');
assert.match(toc,/lastProgressAt:now\(\)/,'running checkpoints must carry a remote heartbeat');
assert.match(toc,/TOC_REMOTE_LEASE_MS/,'restart-safe TOC remote lease must be configured');
assert.match(toc,/remoteLease:true/,'a live remote lease must prevent overlapping crawls');
assert.match(toc,/Stale TOC sync lease expired; superseded by a new worker\./,'stale remote runs must be explicitly closed before replacement');
assert.match(toc,/persistedRows:crawl\.persistedRows\|\|0/,'sync audit metadata must expose progressive persistence');
assert.match(toc,/failedShards:crawl\.failedShards\|\|\[\]/,'sync audit metadata must expose any missing shards');

console.log('V0.9.13 identity safety + progressive TOC persistence/lease/dedupe checks passed');
