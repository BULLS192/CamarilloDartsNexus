import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v0922-nexus-rating-v2-applied':'.v0922-nexus-rating-v2-applied'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.9.22 patch: ${label} anchor not found`)};

let store=fs.readFileSync(paths.store,'utf8');
if(!store.includes('export async function getNexusRatingV2InputsSql(')){
  store += `\nexport async function getNexusRatingV2InputsSql(){\n  if(!SUPABASE_URL)throw new Error('Supabase is required for the optimized Nexus Rating V2 input read.');\n  const res=await fetch(\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_nexus_rating_v2_inputs\`,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});\n  const body=await res.json().catch(()=>null);\n  if(!res.ok)throw new Error(\`Supabase Nexus Rating V2 input read failed (${'${res.status}'}): ${'${body?.message||body?.error||\'Unknown error\'}'}\`);\n  if(!Array.isArray(body))throw new Error('Supabase Nexus Rating V2 input RPC returned an invalid payload.');\n  return body;\n}\n`;
}
fs.writeFileSync(paths.store,store);

let server=fs.readFileSync(paths.server,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.9.22 patch: store import not found');
if(!sm[1].includes('getNexusRatingV2InputsSql'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},getNexusRatingV2InputsSql\n} from './src/store.js';`);
if(!server.includes("from './src/nexus-rating.js'"))server=server.replace("import { calculate01Handicap,cricketSpotMarks } from './src/ratings.js';","import { calculate01Handicap,cricketSpotMarks } from './src/ratings.js';\nimport { nexusRatingIndex } from './src/nexus-rating.js';");
const robustRoute="  if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const result=await getRobustnessIndexSql();return json(res,200,result)}";
need(server,robustRoute,'SQL robustness endpoint');
if(!server.includes("url.pathname==='/api/players/nexus-rating-v2'"))server=server.replace(robustRoute,robustRoute+`\n  if(url.pathname==='/api/players/nexus-rating-v2'&&req.method==='GET'){let inputs=null;try{inputs=await getNexusRatingV2InputsSql()}catch(sqlError){console.warn('Nexus Rating V2 optimized input read failed; using app-state fallback:',sqlError.message);const players=await listPlayers(),links=await listTocLinks().catch(()=>[]),tocById=new Map();await Promise.all((links||[]).filter(l=>l.confirmed!==false).map(async l=>{const tid=String(l.tocId??l.toc_id??'');if(!tid||tocById.has(tid))return;try{const row=await getTocPlayer(tid);if(row)tocById.set(tid,row)}catch{}}));const linkByPlayer=new Map((links||[]).filter(l=>l.confirmed!==false).map(l=>[String(l.playerId??l.player_id??''),l]));inputs=(players||[]).map(p=>{const link=linkByPlayer.get(String(p.id)),tid=String(link?.tocId??link?.toc_id??'');return{playerId:String(p.id||''),name:p.name||[p.firstName,p.lastName].filter(Boolean).join(' '),bullshooterId:String(p.bullshooter?.id||p.bullshooterId||''),bullshooter:p.bullshooter||{},edc:p.edc||{},camarillo:p.camarillo||{},toc:tid?tocById.get(tid)||null:null}})}return json(res,200,nexusRatingIndex(inputs||[]))}`);
server=server.replaceAll("version:'0.9.21'","version:'0.9.22'").replaceAll('Camarillo Darts V0.9.21 running','Camarillo Darts V0.9.22 running');
fs.writeFileSync(paths.server,server);

let html=fs.readFileSync(paths.index,'utf8');
if(!html.includes('/v0922-nexus-rating.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v0922-nexus-rating.css"></head>');
if(!html.includes('/v0922-nexus-rating.js'))html=html.replace('</body>','<script src="/v0922-nexus-rating.js"></script></body>');
html=html.replaceAll('V0.9.21','V0.9.22').replaceAll('Camarillo Darts Nexus 0.9.21','Camarillo Darts Nexus 0.9.22');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.9.22';
pkg.description='Camarillo Darts Nexus Rating V2: robust cross-source PPD/MPR, confidence, form and progressive Camarillo weighting';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check src/nexus-rating.js','node --check public/v0922-nexus-rating.js','node tests/nexus-rating-v0922.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.9.22',feature:'nexus-rating-v2',route:'/api/players/nexus-rating-v2',scale:'PPD + 10×MPR',camarilloWeight:'sample-size progressive; zero at zero games'})+'\n');
