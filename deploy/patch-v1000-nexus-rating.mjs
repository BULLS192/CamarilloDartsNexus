import fs from 'node:fs';

const paths={
  store:fs.existsSync('/app/src/store.js')?'/app/src/store.js':'src/store.js',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json',
  marker:fs.existsSync('/app')?'/app/.v1000-rating-applied':'.v1000-rating-applied'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.10.0 patch: ${label} anchor not found`)};

let store=fs.readFileSync(paths.store,'utf8');
if(!store.includes('export async function getNexusRatingIndexSql(')){
  store+=`\nexport async function getNexusRatingIndexSql(){\n  if(!SUPABASE_URL)throw new Error('Supabase is required for Nexus Rating.');\n  const res=await fetch(\`${'${SUPABASE_URL}'}/rest/v1/rpc/camarillo_nexus_rating_index\`,{method:'POST',headers:remoteHeaders(),body:'{}',signal:AbortSignal.timeout(12000)});\n  const body=await res.json().catch(()=>null);\n  if(!res.ok)throw new Error(\`Supabase Nexus Rating read failed (${'${res.status}'}): ${'${body?.message||body?.error||\'Unknown error\'}'}\`);\n  if(!body||typeof body!=='object'||Array.isArray(body)||!body.byBullshooterId)throw new Error('Supabase Nexus Rating RPC returned an invalid index.');\n  return body;\n}\n`;
}
fs.writeFileSync(paths.store,store);

let server=fs.readFileSync(paths.server,'utf8');
const storeImportRe=/import \{([\s\S]*?)\} from '\.\/src\/store\.js';/;
const sm=server.match(storeImportRe);if(!sm)throw new Error('V0.10.0 patch: store import not found');
if(!sm[1].includes('getNexusRatingIndexSql'))server=server.replace(storeImportRe,(_,names)=>`import {${names.trimEnd()},getNexusRatingIndexSql\n} from './src/store.js';`);
const robustnessRoute="if(url.pathname==='/api/players/robustness'&&req.method==='GET'){const result=await getRobustnessIndexSql();return json(res,200,result)}";
need(server,robustnessRoute,'robustness route');
if(!server.includes("url.pathname==='/api/players/nexus-rating'"))server=server.replace(robustnessRoute,robustnessRoute+"\nif(url.pathname==='/api/players/nexus-rating'&&req.method==='GET'){const result=await getNexusRatingIndexSql();return json(res,200,result)}");
server=server.replaceAll("version:'0.9.23'","version:'0.10.0'").replaceAll('Camarillo Darts V0.9.23 running','Camarillo Darts V0.10.0 running');
fs.writeFileSync(paths.server,server);

let html=fs.readFileSync(paths.index,'utf8');
if(!html.includes('/v1000-rating.css'))html=html.includes('</head>')?html.replace('</head>','<link rel="stylesheet" href="/v1000-rating.css?v=0.10.0"></head>'):html.replace('</body>','<link rel="stylesheet" href="/v1000-rating.css?v=0.10.0"></body>');
if(!html.includes('/v1000-rating.js'))html=html.replace('</body>','<script src="/v1000-rating.js?v=0.10.0"></script></body>');
html=html.replaceAll('V0.9.23','V0.10.0').replaceAll('Camarillo Darts Nexus 0.9.23','Camarillo Darts Nexus 0.10.0');
fs.writeFileSync(paths.index,html);

const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));
pkg.version='0.10.0';
pkg.description='Camarillo Darts Nexus multi-source evidence-weighted rating engine';
if(!pkg.scripts)pkg.scripts={};
for(const cmd of ['node --check public/v1000-rating.js','node tests/nexus-rating-v1000.test.js'])if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
fs.writeFileSync(paths.marker,JSON.stringify({version:'0.10.0',source:'camarillo_nexus_rating_index',route:'/api/players/nexus-rating',renderer:'v1000-rating'})+'\n');
