import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.existsSync('/app/server.js')?'/app':process.cwd();
const read=p=>fs.readFileSync(`${root}/${p}`,'utf8');
const toc=read('src/dartstoc.js'),ui=read('public/v094-player-intel.js'),stats=read('public/v092-stats.js'),pkg=JSON.parse(read('package.json'));

assert.match(toc,/rpc\/camarillo_toc_active_count/,'TOC status must use the authorized count RPC instead of an RLS exact count');
assert.doesNotMatch(toc,/prefer:\s*'count=exact'/,'TOC status may not run an exact PostgREST count through row-level security');
assert.match(toc,/rpc\/camarillo_toc_search/,'TOC text/candidate searches must use the indexed authorized RPC');
assert.match(toc,/p_query:String\(q\|\|''\)\.trim\(\)/,'TOC RPC search must receive the user/candidate query');

assert.doesNotMatch(stats,/new MutationObserver\(\(\)=>schedule\(true\)\)/,'Stats Sources may not refetch from mutations in the TOC intelligence panel');
assert.doesNotMatch(stats,/statsObserver/,'obsolete Stats Sources mutation observer state must be removed');
assert.match(stats,/select\.addEventListener\('change'/,'Stats Sources must still refresh when the selected Nexus player changes');

assert.match(ui,/void searchEdc\('link'\)/,'selecting a Nexus player should automatically surface EDC candidates');
assert.doesNotMatch(ui,/void loadSelectedTocIntel\(p\);scheduleEnhance\(\)/,'Player Intelligence must not duplicate the selected-player TOC request');
const semanticActions=/querySelectorAll\('button'\)[\s\S]*?\^\(edit\|sync\)\$/i.test(ui);
const legacyLastCell=/const actionCell=row\.cells\[row\.cells\.length-1\]/.test(ui);
assert.ok(semanticActions||legacyLastCell,'robustness repair must identify the existing Actions cell');
assert.match(ui,/row\.insertBefore\(cell,actionCell\)|cell\.nextElementSibling!==actionCell/,'robustness cells must be repaired immediately before Actions');

const parts=String(pkg.version).split('.').map(Number);assert.equal(parts[0],0);assert.equal(parts[1],9);assert.ok(parts[2]>=8,'V0.9.8 regression contract must remain valid in later V0.9.x releases');
console.log('V0.9.8+ TOC/EDC linking, request-load and column-order checks passed');
