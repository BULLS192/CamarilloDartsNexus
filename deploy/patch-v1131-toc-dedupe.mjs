import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

const oldFn=`async function persistTocRowsIncremental(rows,seenAt=now()){
  if(!Array.isArray(rows)||!rows.length)return 0;
  if(REMOTE){
    for(let i=0;i<rows.length;i+=100){
      const batch=rows.slice(i,i+100).map(r=>toRemotePlayer(r,seenAt));
      await remoteFetch('camarillo_toc_players?on_conflict=toc_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:batch});
    }
    return rows.length;
  }
  const db=await readLocal(),by=new Map((db.players||[]).map(r=>[r.tocId,r]));
  for(const r of rows)by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});
  db.players=[...by.values()];await writeLocal(db);return rows.length;
}`;

const newFn=`async function persistTocRowsIncremental(rows,seenAt=now()){
  if(!Array.isArray(rows)||!rows.length)return 0;
  // The same TOC player can appear more than once inside a dense shard or paged
  // fallback. Postgres rejects one INSERT ... ON CONFLICT batch when the same
  // conflict key occurs twice, so collapse each persistence call to one best row
  // per tocId before building the Supabase request batches.
  const unique=new Map();
  for(const row of rows){
    if(!row?.tocId||!row?.playerName||row.playerName==='...')continue;
    unique.set(row.tocId,chooseBetterRecord(unique.get(row.tocId),row));
  }
  const deduped=[...unique.values()];
  if(!deduped.length)return 0;
  if(REMOTE){
    for(let i=0;i<deduped.length;i+=100){
      const batch=deduped.slice(i,i+100).map(r=>toRemotePlayer(r,seenAt));
      await remoteFetch('camarillo_toc_players?on_conflict=toc_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:batch});
    }
    return deduped.length;
  }
  const db=await readLocal(),by=new Map((db.players||[]).map(r=>[r.tocId,r]));
  for(const r of deduped)by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});
  db.players=[...by.values()];await writeLocal(db);return deduped.length;
}`;

if(!toc.includes(oldFn))throw new Error('TOC dedupe patch anchor not found');
toc=toc.replace(oldFn,newFn);
fs.writeFileSync(tocPath,toc);
