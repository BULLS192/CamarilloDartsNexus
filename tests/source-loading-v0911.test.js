import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.existsSync('/app/public/v092-stats.js')?'/app':process.cwd();
const stats=fs.readFileSync(`${root}/public/v092-stats.js`,'utf8');
const server=fs.readFileSync(`${root}/server.js`,'utf8');
const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));

assert.match(stats,/const players=await getPlayersCached\(refreshPlayers\)/,'player data should load before TOC intelligence');
assert.doesNotMatch(stats,/Promise\.all\(\[getPlayersCached\(refreshPlayers\),api\(`\/api\/players\/\$\{encodeURIComponent\(id\)\}\/toc`\)\]\)/,'Stats Sources must not block all source rendering on TOC');
assert.match(stats,/renderStats\(player,\{toc:null,candidates:\[\],comparison:\{\}\}\)/,'locally available sources should render immediately');
assert.match(stats,/const intel=await api\(`\/api\/players\/\$\{encodeURIComponent\(id\)\}\/toc`\)/,'TOC should then load progressively');
assert.match(stats,/PPD\/TOC: \$\{tocError\.message\}/,'a TOC failure should be isolated to a TOC note');

assert.match(server,/const tocIntelCache=new Map\(\)/,'server should cache selected-player TOC intelligence');
assert.match(server,/if\(hit\?\.promise\)return hit\.promise/,'concurrent TOC intelligence requests should share one in-flight promise');
assert.match(server,/now-hit\.at<5000/,'TOC intelligence should have a short reuse window');
assert.match(server,/await cachedTocIntelligence\(p\)/,'TOC route should use the deduplicated helper');
assert.match(server,/invalidateTocIntelligence\(p\.id\)/,'linking must invalidate TOC cache');
assert.match(server,/invalidateTocIntelligence\(tocLinkMatch\[0\]\)/,'unlinking must invalidate TOC cache');

const version=String(pkg.version||'0.0.0').split('.').map(Number);
assert.ok(version[0]>0||version[1]>9||(version[1]===9&&version[2]>=11),'package version must be V0.9.11 or later');
console.log('V0.9.11+ progressive source loading and TOC dedupe checks passed');
