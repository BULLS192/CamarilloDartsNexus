import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const playerUiPath=fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js';

const replaceRequired=(text,from,to,label)=>{
  if(!text.includes(from))throw new Error(`V0.9.7 TOC query patch: ${label} anchor not found`);
  return text.replace(from,to);
};

let toc=fs.readFileSync(tocPath,'utf8');

toc=replaceRequired(
  toc,
  "function fromRemotePlayer(r){\n  if(!r) return null;\n  return r.raw_data&&typeof r.raw_data==='object'?{\n    ...r.raw_data,tocId:r.toc_id,mpid:r.mpid,playerName:r.player_name,normalizedName:r.normalized_name,sex:r.sex,\n    rating:num(r.rating),ppd:num(r.ppd),ppdSource:r.ppd_source,ppdSourceUrl:r.ppd_source_url,mpr:num(r.mpr),mprSource:r.mpr_source,mprSourceUrl:r.mpr_source_url,\n    vendor:r.vendor,vendorState:r.vendor_state,showdown:r.showdown,tocEligible:r.toc_eligible,tocHeader:r.toc_header,tocSeason:r.toc_season,\n    playerUrl:r.player_url,signature:r.signature,active:r.active,lastSeenAt:r.last_seen_at,updatedAt:r.updated_at\n  }:{tocId:r.toc_id,playerName:r.player_name,normalizedName:r.normalized_name};\n}",
  "function fromRemotePlayer(r){\n  if(!r) return null;\n  const mapped={tocId:r.toc_id,mpid:r.mpid,playerName:r.player_name,normalizedName:r.normalized_name,sex:r.sex,\n    rating:num(r.rating),ppd:num(r.ppd),ppdSource:r.ppd_source,ppdSourceUrl:r.ppd_source_url,mpr:num(r.mpr),mprSource:r.mpr_source,mprSourceUrl:r.mpr_source_url,\n    vendor:r.vendor,vendorState:r.vendor_state,showdown:r.showdown,tocEligible:r.toc_eligible,tocHeader:r.toc_header,tocSeason:r.toc_season,\n    playerUrl:r.player_url,signature:r.signature,active:r.active,lastSeenAt:r.last_seen_at,updatedAt:r.updated_at};\n  return r.raw_data&&typeof r.raw_data==='object'?{...r.raw_data,...mapped}:mapped;\n}",
  'lightweight row mapping'
);

toc=replaceRequired(
  toc,
  "function postgrestLike(q){return `*${String(q).replace(/[, *()]/g,' ')}*`}".replace(', *', ',*'),
  "function postgrestLike(q){return `*${String(q).replace(/[, *()]/g,' ')}*`}".replace(', *', ',*')+"\nconst REMOTE_PLAYER_SELECT='toc_id,mpid,player_name,normalized_name,sex,rating,ppd,ppd_source,ppd_source_url,mpr,mpr_source,mpr_source_url,vendor,vendor_state,showdown,toc_eligible,toc_header,toc_season,player_url,signature,active,last_seen_at,updated_at';",
  'remote player select'
);

const searchOld=`export async function searchTocDirectory({q='',state='',vendor='',limit=50,offset=0,active=true}={}){
  limit=Math.max(1,Math.min(250,Number(limit)||50)); offset=Math.max(0,Number(offset)||0);
  if(REMOTE){
    const parts=['select=*',\`limit=\${limit}\`,\`offset=\${offset}\`,'order=player_name.asc'];
    if(active!==false) parts.push('active=eq.true');
    if(state)parts.push(\`vendor_state=eq.\${encodeURIComponent(String(state).toUpperCase())}\`);
    if(vendor)parts.push(\`vendor=ilike.\${encodeURIComponent(postgrestLike(vendor))}\`);
    if(q){const like=postgrestLike(q);parts.push(\`or=\${encodeURIComponent(\`(player_name.ilike.\${like},vendor.ilike.\${like},mpid.ilike.\${like})\`)}\`)}
    const {data}=await remoteFetch(\`camarillo_toc_players?\${parts.join('&')}\`); return (Array.isArray(data)?data:[]).map(fromRemotePlayer);
  }`;
const searchNew=`export async function searchTocDirectory({q='',state='',vendor='',limit=50,offset=0,active=true}={}){
  limit=Math.max(1,Math.min(250,Number(limit)||50)); offset=Math.max(0,Number(offset)||0);
  if(REMOTE){
    const parts=[\`select=\${encodeURIComponent(REMOTE_PLAYER_SELECT)}\`,\`limit=\${limit}\`,\`offset=\${offset}\`,'order=player_name.asc'];
    if(active!==false) parts.push('active=eq.true');
    if(state)parts.push(\`vendor_state=eq.\${encodeURIComponent(String(state).toUpperCase())}\`);
    if(vendor)parts.push(\`vendor=ilike.\${encodeURIComponent(postgrestLike(vendor))}\`);
    if(q){
      const query=String(q).trim();
      if(/^\\d+$/.test(query))parts.push(\`mpid=eq.\${encodeURIComponent(query)}\`);
      else{const like=postgrestLike(query);parts.push(\`or=\${encodeURIComponent(\`(player_name.ilike.\${like},vendor.ilike.\${like})\`)}\`)}
    }
    const {data}=await remoteFetch(\`camarillo_toc_players?\${parts.join('&')}\`); return (Array.isArray(data)?data:[]).map(fromRemotePlayer);
  }`;
toc=replaceRequired(toc,searchOld,searchNew,'indexed directory search');

toc=replaceRequired(
  toc,
  "if(REMOTE){const {data}=await remoteFetch(`camarillo_toc_players?toc_id=eq.${encodeURIComponent(tocId)}&select=*&limit=1`);return fromRemotePlayer(Array.isArray(data)?data[0]:null)}",
  "if(REMOTE){const {data}=await remoteFetch(`camarillo_toc_players?toc_id=eq.${encodeURIComponent(tocId)}&select=${encodeURIComponent(REMOTE_PLAYER_SELECT)}&limit=1`);return fromRemotePlayer(Array.isArray(data)?data[0]:null)}",
  'lightweight direct player lookup'
);

toc=replaceRequired(toc,"const VERSION='0.9.5';","const VERSION='0.9.7';",'TOC version');
fs.writeFileSync(tocPath,toc);

let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.6'","version:'0.9.7'").replaceAll('Camarillo Darts V0.9.6 running','Camarillo Darts V0.9.7 running');
fs.writeFileSync(serverPath,server);

let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.6','V0.9.7').replaceAll('Camarillo Darts Nexus 0.9.6','Camarillo Darts Nexus 0.9.7');
fs.writeFileSync(indexPath,html);

if(fs.existsSync(playerUiPath)){
  let ui=fs.readFileSync(playerUiPath,'utf8');
  ui=ui.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.6','EXTERNAL PLAYER INTELLIGENCE · V0.9.7');
  fs.writeFileSync(playerUiPath,ui);
}

const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.7';
pkg.description='Camarillo Darts Nexus responsive multi-source player intelligence with indexed TOC lookups';
if(!pkg.scripts)pkg.scripts={};
const cmd='node tests/toc-query-v097.test.js';
if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
