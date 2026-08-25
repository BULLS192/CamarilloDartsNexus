import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

const replaceRequired=(from,to,label)=>{
  if(!toc.includes(from)) throw new Error(`V0.9.3 patch: ${label} anchor not found`);
  toc=toc.replace(from,to);
};

replaceRequired("const VERSION='0.9.1';","const VERSION='0.9.3';",'TOC version');
replaceRequired(
  "const MAX_PAGES=Math.max(1,Math.min(1000,Number(process.env.TOC_MAX_PAGES)||500));",
  "const MAX_PAGES=Math.max(1,Math.min(5000,Number(process.env.TOC_MAX_PAGES)||2000));",
  'page ceiling'
);

replaceRequired(
`  const changed=crawl.records.filter(r=>existing.get(r.tocId)!==r.signature);\n  run.changedRows=changed.length;\n  if(REMOTE){\n    for(let i=0;i<crawl.records.length;i+=400){\n      const batch=crawl.records.slice(i,i+400).map(r=>toRemotePlayer(r,seenAt));`,
`  // Only write records that are genuinely new or changed. This avoids re-upserting\n  // 100k+ unchanged Best-Known rows on every full crawl.\n  const toPersist=crawl.records.filter(r=>existing.get(r.tocId)!==r.signature);\n  // Historical snapshots represent changes to records we already knew about; a first\n  // observation is the baseline and does not need its own duplicate snapshot row.\n  const changed=crawl.records.filter(r=>existing.has(r.tocId)&&existing.get(r.tocId)!==r.signature);\n  run.changedRows=toPersist.length;\n  if(REMOTE){\n    for(let i=0;i<toPersist.length;i+=100){\n      const batch=toPersist.slice(i,i+100).map(r=>toRemotePlayer(r,seenAt));`,
  'delta-only player persistence'
);

replaceRequired(
`      for(let i=0;i<changed.length;i+=400){\n        const batch=changed.slice(i,i+400).map(r=>({snapshot_id:shortId('tocsnap',\`${'${r.tocId}|${r.signature}'}\`),toc_id:r.tocId,captured_at:captured,signature:r.signature,raw_data:r}));`,
`      for(let i=0;i<changed.length;i+=100){\n        const batch=changed.slice(i,i+100).map(r=>({snapshot_id:shortId('tocsnap',\`${'${r.tocId}|${r.signature}'}\`),toc_id:r.tocId,captured_at:captured,signature:r.signature,raw_data:r}));`,
  'snapshot batch size'
);

replaceRequired(
`    if(crawl.complete){\n      const qp=new URLSearchParams(); qp.set('active','eq.true'); qp.set('last_seen_at',\`lt.${'${seenAt}'}\`);\n      await remoteFetch(\`camarillo_toc_players?${'${qp.toString()}'}\`,{method:'PATCH',headers:{prefer:'return=minimal'},body:{active:false,updated_at:now()}});\n    }`,
`    // V0.9.3 deliberately defers stale-row deactivation. Delta-only persistence does\n    // not touch unchanged rows' last_seen_at, so deactivating by timestamp here could\n    // incorrectly hide valid players. A separate reconciliation pass can handle this.`,
  'stale deactivation'
);

replaceRequired(
`    for(const r of crawl.records) by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});\n    if(crawl.complete) for(const r of by.values()) if(r.lastSeenAt<seenAt) r.active=false;`,
`    for(const r of toPersist) by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});`,
  'local delta persistence'
);

replaceRequired(
`    const crawl=await crawlBestKnown({onProgress:async p=>{\n      syncJob={...syncJob,page:p.page,pages:p.page,rowsSeen:p.totalSeen,uniqueRows:p.uniqueRows,lastProgressAt:now()};\n    }});`,
`    const crawl=await crawlBestKnown({onProgress:async p=>{\n      syncJob={...syncJob,page:p.page,pages:p.page,rowsSeen:p.totalSeen,uniqueRows:p.uniqueRows,lastProgressAt:now()};\n      // Persist a lightweight checkpoint periodically so progress survives a browser\n      // disconnect and is visible in the external sync audit table.\n      if(p.page===1||p.page%25===0) await persistRun({...run,status:'running',pages:p.page,rowsSeen:p.totalSeen,uniqueRows:p.uniqueRows,metadata:{...run.metadata,checkpoint:true}}).catch(()=>{});\n    }});`,
  'sync checkpoints'
);

fs.writeFileSync(tocPath,toc);

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.2'","version:'0.9.3'").replaceAll('Camarillo Darts V0.9.2 running','Camarillo Darts V0.9.3 running');
fs.writeFileSync(serverPath,server);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.2','V0.9.3').replaceAll('Camarillo Darts Nexus 0.9.2','Camarillo Darts Nexus 0.9.3');
fs.writeFileSync(indexPath,html);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.3';
const cmd='node tests/toc-v093.test.js';
if(!String(pkg.scripts?.check||'').includes(cmd))pkg.scripts.check+=` && ${cmd}`;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
