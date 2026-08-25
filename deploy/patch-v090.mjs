import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
const sheetsImport="import { pushDatabaseToSheets } from './src/sheets.js';";
if(!server.includes(sheetsImport)) throw new Error('V0.9 patch: sheets import anchor not found');
const tocImport="import { startTocSync,tocStatus,searchTocDirectory,getTocPlayer,getPlayerTocIntelligence,linkTocPlayer,unlinkTocPlayer } from './src/dartstoc.js';";
if(!server.includes(tocImport)) server=server.replace(sheetsImport,sheetsImport+'\n'+tocImport);

const dashboardAnchor="  if(url.pathname==='/api/dashboard'&&req.method==='GET')return json(res,200,await dashboard());";
if(!server.includes(dashboardAnchor)) throw new Error('V0.9 patch: dashboard route anchor not found');
const tocRoutes=`  if(url.pathname==='/api/toc/status'&&req.method==='GET')return json(res,200,await tocStatus());
  if(url.pathname==='/api/toc/sync'&&req.method==='POST'){const out=await startTocSync();await auditEvent({action:'toc_sync_started',entityType:'external_source',entityId:'dartstoc',metadata:{runId:out.runId||null,alreadyRunning:Boolean(out.alreadyRunning)}}).catch(()=>{});return json(res,out.alreadyRunning?200:202,out)}
  if(url.pathname==='/api/toc/directory'&&req.method==='GET')return json(res,200,await searchTocDirectory({q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'',vendor:url.searchParams.get('vendor')||'',limit:url.searchParams.get('limit')||50,offset:url.searchParams.get('offset')||0}));
  const tocRecordMatch=matchPath(url,/^\\/api\\/toc\\/directory\\/([^/]+)$/);if(tocRecordMatch&&req.method==='GET'){const row=await getTocPlayer(tocRecordMatch[0]);return row?json(res,200,row):json(res,404,{error:'PPD/TOC record not found.'})}
  const tocIntelMatch=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/toc$/);if(tocIntelMatch&&req.method==='GET'){const p=await getPlayer(tocIntelMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});return json(res,200,await getPlayerTocIntelligence(p))}
  const tocLinkMatch=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/toc\\/link$/);if(tocLinkMatch&&req.method==='POST'){const p=await getPlayer(tocLinkMatch[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req);if(!input.tocId)return json(res,400,{error:'tocId is required.'});const out=await linkTocPlayer(p.id,input.tocId,{confirmed:input.confirmed!==false,matchMethod:input.matchMethod||'manual',confidence:input.confidence||'confirmed'});await auditEvent({action:'toc_player_linked',entityType:'player',entityId:p.id,metadata:{tocId:input.tocId,matchMethod:input.matchMethod||'manual'}}).catch(()=>{});return json(res,200,out)}
  if(tocLinkMatch&&req.method==='DELETE'){const out=await unlinkTocPlayer(tocLinkMatch[0]);await auditEvent({action:'toc_player_unlinked',entityType:'player',entityId:tocLinkMatch[0]}).catch(()=>{});return json(res,200,out)}
`;
if(!server.includes("/api/toc/status")) server=server.replace(dashboardAnchor,tocRoutes+dashboardAnchor);
server=server.replaceAll("version:'0.8.0'","version:'0.9.0'").replaceAll('Camarillo Darts V0.8.0 running','Camarillo Darts V0.9.0 running');
fs.writeFileSync(serverPath,server);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.8.0','V0.9.0').replaceAll('Camarillo Darts Nexus 0.8.0','Camarillo Darts Nexus 0.9.0');
if(!html.includes('/v090.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v090.css"></head>');
if(!html.includes('/v090.js'))html=html.replace('</body>','<script src="/v090.js"></script></body>');
fs.writeFileSync(indexPath,html);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.0';
pkg.description='Camarillo Darts Nexus competition intelligence platform with BullShooter and PPD/TOC Best-Known data';
const additions=['node --check src/dartstoc.js','node --check public/v090.js','node tests/toc-v090.test.js'];
let check=String(pkg.scripts?.check||'');for(const cmd of additions)if(!check.includes(cmd))check+=(check?' && ':'')+cmd;if(!pkg.scripts)pkg.scripts={};pkg.scripts.check=check;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
