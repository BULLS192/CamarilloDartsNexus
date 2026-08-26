import fs from 'node:fs';

const statsPath=fs.existsSync('/app/public/v092-stats.js')?'/app/public/v092-stats.js':'public/v092-stats.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';

const required=(text,needle,label)=>{if(!text.includes(needle))throw new Error(`V0.9.11 patch: ${label} anchor not found`)};

let stats=fs.readFileSync(statsPath,'utf8');
const oldRefresh=`    try{\n      const [players,intel]=await Promise.all([getPlayersCached(refreshPlayers),api(\`/api/players/\${encodeURIComponent(id)}/toc\`)]);\n      const player=(Array.isArray(players)?players:[]).find(p=>String(p.id)===String(id));\n      if(!player)throw Error('Selected Nexus player was not found.');\n      renderStats(player,intel);panel.dataset.loaded='1';\n    }catch(error){panel.innerHTML=\`<div class="source-stats-empty error">\${esc(error.message)}</div>\`}\n`;
const newRefresh=`    try{\n      const players=await getPlayersCached(refreshPlayers);\n      const player=(Array.isArray(players)?players:[]).find(p=>String(p.id)===String(id));\n      if(!player)throw Error('Selected Nexus player was not found.');\n      renderStats(player,{toc:null,candidates:[],comparison:{}});\n      panel.dataset.loaded='1';\n      try{\n        const intel=await api(\`/api/players/\${encodeURIComponent(id)}/toc\`);\n        if(String($('#tocNexusPlayer')?.value||'')===String(id))renderStats(player,intel);\n      }catch(tocError){\n        if(String($('#tocNexusPlayer')?.value||'')===String(id)){\n          const note=document.createElement('div');note.className='source-stats-error';note.textContent=\`PPD/TOC: \${tocError.message}\`;panel.appendChild(note);\n        }\n      }\n    }catch(error){panel.innerHTML=\`<div class="source-stats-empty error">\${esc(error.message)}</div>\`}\n`;
required(stats,oldRefresh,'progressive stats refresh');
stats=stats.replace(oldRefresh,newRefresh);
fs.writeFileSync(statsPath,stats);

let server=fs.readFileSync(serverPath,'utf8');
const serverAnchor='const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);';
required(server,serverAnchor,'server startup');
const cacheHelper=`const tocIntelCache=new Map();\nasync function cachedTocIntelligence(player){\n  const key=String(player?.id||'');if(!key)return getPlayerTocIntelligence(player);\n  const now=Date.now(),hit=tocIntelCache.get(key);\n  if(hit&&hit.value&&now-hit.at<5000)return hit.value;\n  if(hit?.promise)return hit.promise;\n  const promise=Promise.resolve(getPlayerTocIntelligence(player)).then(value=>{tocIntelCache.set(key,{at:Date.now(),value});return value}).finally(()=>{const cur=tocIntelCache.get(key);if(cur?.promise===promise)tocIntelCache.delete(key)});\n  tocIntelCache.set(key,{at:now,promise});return promise;\n}\nfunction invalidateTocIntelligence(playerId){tocIntelCache.delete(String(playerId||''))}\n`;
server=server.replace(serverAnchor,cacheHelper+serverAnchor);
const oldTocRoute="const tocIntelMatch=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/toc$/);if(tocIntelMatch&&req.method==='GET'){const p=await getPlayer(tocIntelMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});return json(res,200,await getPlayerTocIntelligence(p))}";
const newTocRoute="const tocIntelMatch=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/toc$/);if(tocIntelMatch&&req.method==='GET'){const p=await getPlayer(tocIntelMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});return json(res,200,await cachedTocIntelligence(p))}";
required(server,oldTocRoute,'TOC intelligence route');server=server.replace(oldTocRoute,newTocRoute);
const oldLink="const out=await linkTocPlayer(p.id,input.tocId,{confirmed:input.confirmed!==false,matchMethod:input.matchMethod||'manual',confidence:input.confidence||'confirmed'});";
required(server,oldLink,'TOC link invalidation');server=server.replace(oldLink,oldLink+'invalidateTocIntelligence(p.id);');
const oldUnlink="if(tocLinkMatch&&req.method==='DELETE'){const out=await unlinkTocPlayer(tocLinkMatch[0]);";
required(server,oldUnlink,'TOC unlink invalidation');server=server.replace(oldUnlink,"if(tocLinkMatch&&req.method==='DELETE'){const out=await unlinkTocPlayer(tocLinkMatch[0]);invalidateTocIntelligence(tocLinkMatch[0]);");
server=server.replaceAll("version:'0.9.10'","version:'0.9.11'").replaceAll('Camarillo Darts V0.9.10 running','Camarillo Darts V0.9.11 running');
fs.writeFileSync(serverPath,server);

let ui=fs.readFileSync(playerUiPath,'utf8');
ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.9','EXTERNAL PLAYER INTELLIGENCE · V0.9.11');
fs.writeFileSync(playerUiPath,ui);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.10','V0.9.11').replaceAll('Camarillo Darts Nexus 0.9.10','Camarillo Darts Nexus 0.9.11');
fs.writeFileSync(indexPath,html);

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version='0.9.11';pkg.description='Camarillo Darts Nexus progressive external-source loading with deduplicated TOC intelligence';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/source-loading-v0911.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
