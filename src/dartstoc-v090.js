import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const VERSION='0.9.0';
const BASE_URL='https://www.dartstoc.com/RWDTOC/playerstat.aspx';
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const STATE_TOKEN=String(process.env.CAMARILLO_STATE_TOKEN||'');
const REMOTE=Boolean(SUPABASE_URL&&SUPABASE_KEY&&STATE_TOKEN);
const LOCAL_PATH=process.env.TOC_CACHE_PATH
  ? path.resolve(process.env.TOC_CACHE_PATH)
  : path.resolve(process.env.DB_PATH ? path.join(path.dirname(process.env.DB_PATH),'toc-cache.json') : 'data/toc-cache.json');
const PAGE_DELAY_MS=Math.max(100,Number(process.env.TOC_PAGE_DELAY_MS)||250);
const MAX_PAGES=Math.max(1,Math.min(1000,Number(process.env.TOC_MAX_PAGES)||500));
const REQUEST_TIMEOUT_MS=Math.max(5000,Number(process.env.TOC_REQUEST_TIMEOUT_MS)||20000);
const PAGE_SIZE_HINT=250;

const now=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:null};
const boolText=v=>/^yes$/i.test(String(v||'').trim())?true:/^no$/i.test(String(v||'').trim())?false:null;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const shortId=(prefix,v)=>`${prefix}_${sha(v).slice(0,24)}`;

export function decodeHtml(value=''){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value)
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&([a-z]+);/gi,(m,n)=>named[n.toLowerCase()]??m);
}

function stripHtml(value=''){
  return decodeHtml(String(value)
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ').trim();
}

function attrs(tag=''){
  const out={};
  for(const m of String(tag).matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
    out[m[1].toLowerCase()]=decodeHtml(m[2]??m[3]??m[4]??'');
  }
  return out;
}

export function parseHiddenInputs(html=''){
  const out={};
  for(const m of String(html).matchAll(/<input\b[^>]*>/gi)){
    const a=attrs(m[0]);
    if((a.type||'').toLowerCase()==='hidden'&&a.name) out[a.name]=a.value||'';
  }
  return out;
}

export function normalizeName(value=''){
  return decodeHtml(value).toUpperCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(JR|SR|II|III|IV)\.?$/,'')
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ').trim();
}

function absoluteUrl(href=''){
  const h=decodeHtml(href).trim();
  if(!h||/^javascript:/i.test(h)||h==='#') return null;
  try{return new URL(h,BASE_URL).href}catch{return null}
}

function hrefsFromCell(cellHtml=''){
  return [...String(cellHtml).matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)]
    .map(m=>absoluteUrl(m[1]??m[2]??m[3]??''))
    .filter(Boolean);
}

function idFromUrls(urls=[]){
  for(const url of urls){
    const m=String(url).match(/[?&](?:MPID|mpid|player_?id|PlayerID|pid)=([^&#]+)/);
    if(m) return decodeURIComponent(m[1]);
  }
  return null;
}

function gridHtml(html=''){
  const start=String(html).search(/<table\b[^>]*(?:id|name)\s*=\s*(?:"[^"]*GridBestKnownOverall[^"]*"|'[^']*GridBestKnownOverall[^']*')[^>]*>/i);
  if(start<0) return '';
  const tail=String(html).slice(start);
  const end=tail.search(/<\/table\s*>/i);
  return end<0?tail:tail.slice(0,end+8);
}

function headerSeason(table=''){
  const first=(table.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i)||[])[1]||'';
  const cells=[...first.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m=>stripHtml(m[1]));
  const toc=cells.find(x=>/^TOC\b/i.test(x))||'';
  const year=(toc.match(/\b(20\d{2})\b/)||[])[1]||null;
  return {tocHeader:toc||null,tocSeason:year};
}

function scoreRecordCompleteness(r){
  return [r.mpid,r.rating,r.ppd,r.mpr,r.vendor,r.vendorState,r.ppdSource,r.mprSource].reduce((s,v)=>s+(v!==null&&v!==undefined&&v!==''?1:0),0);
}

function chooseBetterRecord(a,b){
  if(!a) return b;
  if(!b) return a;
  return scoreRecordCompleteness(b)>=scoreRecordCompleteness(a)?b:a;
}

export function tocCombinedRating(ppd,mpr){
  const p=num(ppd),m=num(mpr);
  return p!==null&&m!==null?Math.round((p+m*10)*1000)/1000:null;
}

export function parseBestKnownRows(html='',page=1){
  const table=gridHtml(html);
  if(!table) return [];
  const season=headerSeason(table);
  const out=[];
  let position=0;
  for(const rm of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const rawCells=[...rm[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>m[1]);
    if(rawCells.length<10) continue;
    const cells=rawCells.map(stripHtml);
    const name=cells[0];
    if(!name||/^Player Name$/i.test(name)||/^\d+(?:\s+\d+)*\s*(?:\.\.\.)?$/.test(name)) continue;
    const urls=rawCells.flatMap(hrefsFromCell);
    const playerUrls=hrefsFromCell(rawCells[0]);
    const ppdUrls=hrefsFromCell(rawCells[4]||'');
    const mprUrls=hrefsFromCell(rawCells[6]||'');
    const mpid=idFromUrls([...playerUrls,...ppdUrls,...mprUrls,...urls]);
    const normalizedName=normalizeName(name);
    const vendor=cells[7]||null;
    const vendorState=cells[8]||null;
    const playerUrl=playerUrls[0]||null;
    const stableIdentity=mpid?`mpid:${mpid}`:playerUrl?`url:${playerUrl}`:`fallback:${normalizedName}|${normalizeName(vendor||'')}|${String(vendorState||'').toUpperCase()}|${cells[1]||''}`;
    const tocId=mpid?`mpid_${mpid}`:shortId('toc',stableIdentity);
    const ppd=num(cells[3]),mpr=num(cells[5]),rating=num(cells[2]);
    const computed=tocCombinedRating(ppd,mpr);
    const record={
      tocId,mpid,playerName:name,normalizedName,sex:cells[1]||null,
      rating,ppd,ppdSource:cells[4]||null,ppdSourceUrl:ppdUrls[0]||null,
      mpr,mprSource:cells[6]||null,mprSourceUrl:mprUrls[0]||null,
      vendor,vendorState,showdown:boolText(cells[9]),tocEligible:boolText(cells[10]),
      tocHeader:season.tocHeader,tocSeason:season.tocSeason,playerUrl,
      ratingComputed:computed,ratingValidationDelta:rating!==null&&computed!==null?Math.round(Math.abs(rating-computed)*1000)/1000:null,
      sourcePage:page,sourcePosition:++position,sourceUrl:BASE_URL,parserVersion:VERSION
    };
    record.signature=sha(JSON.stringify([
      record.playerName,record.sex,record.rating,record.ppd,record.ppdSource,record.mpr,record.mprSource,
      record.vendor,record.vendorState,record.showdown,record.tocEligible,record.tocSeason
    ]));
    out.push(record);
  }
  return out;
}

export function parsePagerPages(html=''){
  const set=new Set();
  for(const m of String(html).matchAll(/__doPostBack\([^)]*['"]Page\$(\d+)['"]/gi)) set.add(Number(m[1]));
  return [...set].filter(Number.isFinite).sort((a,b)=>a-b);
}

class WebFormsSession{
  constructor(){this.cookies=new Map()}
  captureCookies(res){
    const arr=typeof res.headers.getSetCookie==='function'?res.headers.getSetCookie():[];
    const fallback=arr.length?arr:[res.headers.get('set-cookie')].filter(Boolean);
    for(const raw of fallback){
      for(const part of String(raw).split(/,(?=[^;,]+=)/)){
        const first=part.split(';')[0]; const i=first.indexOf('=');
        if(i>0)this.cookies.set(first.slice(0,i).trim(),first.slice(i+1).trim());
      }
    }
  }
  cookieHeader(){return [...this.cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; ')}
  async request(url,options={},attempt=1){
    const headers={
      accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language':'en-US,en;q=0.9',
      'user-agent':'Mozilla/5.0 CamarilloDartsNexus/0.9 (+PPD-TOC sync)',
      ...(options.headers||{})
    };
    const cookie=this.cookieHeader(); if(cookie) headers.cookie=cookie;
    try{
      const res=await fetch(url,{...options,headers,redirect:'follow',signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
      this.captureCookies(res);
      const text=await res.text();
      if(!res.ok) throw new Error(`DartsTOC HTTP ${res.status}`);
      return text;
    }catch(error){
      if(attempt>=3) throw error;
      await sleep(400*attempt);
      return this.request(url,options,attempt+1);
    }
  }
  get(){return this.request(BASE_URL,{method:'GET'})}
  post(html,eventTarget,eventArgument,searchTerm='%'){
    const hidden=parseHiddenInputs(html);
    const form=new URLSearchParams();
    for(const [k,v] of Object.entries(hidden)) form.set(k,v);
    form.set('__EVENTTARGET',eventTarget);
    form.set('__EVENTARGUMENT',eventArgument||'');
    if(!form.has('__LASTFOCUS')) form.set('__LASTFOCUS','');
    form.set('ctl00$ContentPlaceHolder1$txtSearch',searchTerm);
    return this.request(BASE_URL,{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded','origin':'https://www.dartstoc.com','referer':BASE_URL},
      body:form.toString()
    });
  }
}

export async function crawlBestKnown({searchTerm='%',maxPages=MAX_PAGES,onProgress=()=>{}}={}){
  const session=new WebFormsSession();
  let html=await session.get();
  html=await session.post(html,'ctl00$ContentPlaceHolder1$txtSearch','',searchTerm);
  const records=new Map();
  let page=1,complete=false,totalSeen=0,lastFingerprint=null;
  while(page<=maxPages){
    const rows=parseBestKnownRows(html,page);
    totalSeen+=rows.length;
    if(!rows.length){
      complete=page===1?false:true;
      break;
    }
    const fingerprint=rows.length?`${rows[0].tocId}|${rows.at(-1).tocId}|${rows.length}`:'';
    if(lastFingerprint&&fingerprint===lastFingerprint) throw new Error(`DartsTOC pagination repeated page ${page}; stopped to prevent an infinite loop.`);
    lastFingerprint=fingerprint;
    for(const row of rows) records.set(row.tocId,chooseBetterRecord(records.get(row.tocId),row));
    const pager=parsePagerPages(html);
    const hasNext=pager.includes(page+1);
    await onProgress({page,pageRows:rows.length,totalSeen,uniqueRows:records.size,pager,hasNext});
    if(!hasNext){complete=true;break}
    page++;
    await sleep(PAGE_DELAY_MS);
    html=await session.post(html,'ctl00$ContentPlaceHolder1$GridBestKnownOverall',`Page$${page}`,searchTerm);
  }
  if(page>maxPages) complete=false;
  return {records:[...records.values()],pages:Math.min(page,maxPages),rowsSeen:totalSeen,uniqueRows:records.size,complete,searchTerm};
}

function remoteHeaders(extra={}){
  return {apikey:SUPABASE_KEY,authorization:`Bearer ${SUPABASE_KEY}`,'x-camarillo-key':STATE_TOKEN,'content-type':'application/json',accept:'application/json',...extra};
}

async function remoteFetch(resource,{method='GET',body,headers={},attempt=1}={}){
  const url=`${SUPABASE_URL}/rest/v1/${resource}`;
  try{
    const res=await fetch(url,{method,headers:remoteHeaders(headers),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    const text=await res.text();
    let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
    if(!res.ok) throw new Error(`Supabase TOC ${method} ${res.status}: ${data?.message||data?.error||text||'Unknown error'}`);
    return {data,res};
  }catch(error){
    if(attempt>=3) throw error;
    await sleep(250*attempt);
    return remoteFetch(resource,{method,body,headers,attempt:attempt+1});
  }
}

async function remoteAll(table,select='*',filter=''){
  const out=[]; let offset=0; const limit=1000;
  while(true){
    const {data}=await remoteFetch(`${table}?select=${encodeURIComponent(select)}${filter?`&${filter}`:''}&limit=${limit}&offset=${offset}`);
    const rows=Array.isArray(data)?data:[]; out.push(...rows);
    if(rows.length<limit) break; offset+=limit;
  }
  return out;
}

async function ensureLocal(){
  await fs.mkdir(path.dirname(LOCAL_PATH),{recursive:true});
  try{await fs.access(LOCAL_PATH)}catch{await fs.writeFile(LOCAL_PATH,JSON.stringify({players:[],links:[],snapshots:[],runs:[]},null,2))}
}
async function readLocal(){await ensureLocal();return JSON.parse(await fs.readFile(LOCAL_PATH,'utf8'))}
async function writeLocal(db){await ensureLocal();await fs.writeFile(LOCAL_PATH,JSON.stringify(db,null,2));return db}

async function existingSignatureMap(){
  if(REMOTE){
    const rows=await remoteAll('camarillo_toc_players','toc_id,signature');
    return new Map(rows.map(r=>[r.toc_id,r.signature]));
  }
  const db=await readLocal(); return new Map((db.players||[]).map(r=>[r.tocId,r.signature]));
}

function toRemotePlayer(r,seenAt){
  return {
    toc_id:r.tocId,mpid:r.mpid,player_name:r.playerName,normalized_name:r.normalizedName,sex:r.sex,rating:r.rating,
    ppd:r.ppd,ppd_source:r.ppdSource,ppd_source_url:r.ppdSourceUrl,mpr:r.mpr,mpr_source:r.mprSource,mpr_source_url:r.mprSourceUrl,
    vendor:r.vendor,vendor_state:r.vendorState,showdown:r.showdown,toc_eligible:r.tocEligible,toc_header:r.tocHeader,toc_season:r.tocSeason,
    player_url:r.playerUrl,signature:r.signature,active:true,last_seen_at:seenAt,updated_at:seenAt,raw_data:r
  };
}
function fromRemotePlayer(r){
  if(!r) return null;
  return r.raw_data&&typeof r.raw_data==='object'?{
    ...r.raw_data,tocId:r.toc_id,mpid:r.mpid,playerName:r.player_name,normalizedName:r.normalized_name,sex:r.sex,
    rating:num(r.rating),ppd:num(r.ppd),ppdSource:r.ppd_source,ppdSourceUrl:r.ppd_source_url,mpr:num(r.mpr),mprSource:r.mpr_source,mprSourceUrl:r.mpr_source_url,
    vendor:r.vendor,vendorState:r.vendor_state,showdown:r.showdown,tocEligible:r.toc_eligible,tocHeader:r.toc_header,tocSeason:r.toc_season,
    playerUrl:r.player_url,signature:r.signature,active:r.active,lastSeenAt:r.last_seen_at,updatedAt:r.updated_at
  }:{tocId:r.toc_id,playerName:r.player_name,normalizedName:r.normalized_name};
}

async function persistRun(run){
  if(REMOTE){
    await remoteFetch('camarillo_external_sync_runs?on_conflict=run_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:{
      run_id:run.runId,source:'dartstoc-best-known',status:run.status,started_at:run.startedAt,finished_at:run.finishedAt||null,
      pages:run.pages||0,rows_seen:run.rowsSeen||0,unique_rows:run.uniqueRows||0,changed_rows:run.changedRows||0,error:run.error||null,metadata:run.metadata||{}
    }}); return;
  }
  const db=await readLocal(); const i=(db.runs||[]).findIndex(x=>x.runId===run.runId); if(i>=0)db.runs[i]=run;else(db.runs||(db.runs=[])).push(run); await writeLocal(db);
}

async function persistCrawl(crawl,run){
  const seenAt=run.startedAt;
  const existing=await existingSignatureMap();
  const changed=crawl.records.filter(r=>existing.get(r.tocId)!==r.signature);
  run.changedRows=changed.length;
  if(REMOTE){
    for(let i=0;i<crawl.records.length;i+=400){
      const batch=crawl.records.slice(i,i+400).map(r=>toRemotePlayer(r,seenAt));
      await remoteFetch('camarillo_toc_players?on_conflict=toc_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:batch});
    }
    if(changed.length){
      const captured=now();
      for(let i=0;i<changed.length;i+=400){
        const batch=changed.slice(i,i+400).map(r=>({snapshot_id:shortId('tocsnap',`${r.tocId}|${r.signature}`),toc_id:r.tocId,captured_at:captured,signature:r.signature,raw_data:r}));
        await remoteFetch('camarillo_toc_snapshots?on_conflict=snapshot_id',{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=minimal'},body:batch});
      }
    }
    if(crawl.complete){
      const qp=new URLSearchParams(); qp.set('active','eq.true'); qp.set('last_seen_at',`lt.${seenAt}`);
      await remoteFetch(`camarillo_toc_players?${qp.toString()}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:{active:false,updated_at:now()}});
    }
  }else{
    const db=await readLocal(); const by=new Map((db.players||[]).map(r=>[r.tocId,r]));
    for(const r of crawl.records) by.set(r.tocId,{...r,active:true,lastSeenAt:seenAt,updatedAt:seenAt});
    if(crawl.complete) for(const r of by.values()) if(r.lastSeenAt<seenAt) r.active=false;
    db.players=[...by.values()];
    const snaps=new Map((db.snapshots||[]).map(s=>[s.snapshotId,s]));
    for(const r of changed){const snapshotId=shortId('tocsnap',`${r.tocId}|${r.signature}`);snaps.set(snapshotId,{snapshotId,tocId:r.tocId,capturedAt:now(),signature:r.signature,rawData:r})}
    db.snapshots=[...snaps.values()]; await writeLocal(db);
  }
}

let syncJob={running:false,runId:null,status:'idle',startedAt:null,finishedAt:null,page:0,pages:0,rowsSeen:0,uniqueRows:0,changedRows:0,error:null,lastProgressAt:null};

export function currentTocSync(){return {...syncJob}}

async function runSync(runId){
  const startedAt=now();
  syncJob={running:true,runId,status:'running',startedAt,finishedAt:null,page:0,pages:0,rowsSeen:0,uniqueRows:0,changedRows:0,error:null,lastProgressAt:startedAt};
  let run={...syncJob,metadata:{version:VERSION,pageSizeHint:PAGE_SIZE_HINT}};
  await persistRun(run).catch(()=>{});
  try{
    const crawl=await crawlBestKnown({onProgress:async p=>{
      syncJob={...syncJob,page:p.page,pages:p.page,rowsSeen:p.totalSeen,uniqueRows:p.uniqueRows,lastProgressAt:now()};
    }});
    run={...run,pages:crawl.pages,rowsSeen:crawl.rowsSeen,uniqueRows:crawl.uniqueRows,status:crawl.complete?'success':'partial',metadata:{...run.metadata,complete:crawl.complete}};
    await persistCrawl(crawl,run);
    run.finishedAt=now();
    await persistRun(run);
    syncJob={...syncJob,running:false,status:run.status,finishedAt:run.finishedAt,pages:run.pages,page:run.pages,rowsSeen:run.rowsSeen,uniqueRows:run.uniqueRows,changedRows:run.changedRows,error:null,lastProgressAt:now()};
  }catch(error){
    run={...run,status:'error',error:error.message,finishedAt:now(),pages:syncJob.pages,rowsSeen:syncJob.rowsSeen,uniqueRows:syncJob.uniqueRows};
    await persistRun(run).catch(()=>{});
    syncJob={...syncJob,running:false,status:'error',finishedAt:run.finishedAt,error:error.message,lastProgressAt:now()};
  }
}

export async function startTocSync(){
  if(syncJob.running) return {...syncJob,alreadyRunning:true};
  const runId=shortId('tocrun',`${Date.now()}|${crypto.randomUUID()}`);
  void runSync(runId);
  return {running:true,runId,status:'starting'};
}

async function tocCount(){
  if(REMOTE){
    const {res}=await remoteFetch('camarillo_toc_players?select=toc_id&active=eq.true&limit=1',{headers:{prefer:'count=exact'}});
    const cr=res.headers.get('content-range')||''; const m=cr.match(/\/(\d+)$/); return m?Number(m[1]):null;
  }
  const db=await readLocal(); return (db.players||[]).filter(x=>x.active!==false).length;
}

async function lastRun(){
  if(REMOTE){
    const {data}=await remoteFetch('camarillo_external_sync_runs?source=eq.dartstoc-best-known&select=*&order=started_at.desc&limit=1'); return Array.isArray(data)?data[0]||null:null;
  }
  const db=await readLocal(); return [...(db.runs||[])].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0]||null;
}

export async function tocStatus(){
  const [count,last]=await Promise.all([tocCount().catch(()=>null),lastRun().catch(()=>null)]);
  return {version:VERSION,backend:REMOTE?'supabase':'local-json',directoryCount:count,current:{...syncJob},lastRun:last};
}

function postgrestLike(q){return `*${String(q).replace(/[,*()]/g,' ')}*`}

export async function searchTocDirectory({q='',state='',vendor='',limit=50,offset=0,active=true}={}){
  limit=Math.max(1,Math.min(250,Number(limit)||50)); offset=Math.max(0,Number(offset)||0);
  if(REMOTE){
    const parts=['select=*',`limit=${limit}`,`offset=${offset}`,'order=player_name.asc'];
    if(active!==false) parts.push('active=eq.true');
    if(state)parts.push(`vendor_state=eq.${encodeURIComponent(String(state).toUpperCase())}`);
    if(vendor)parts.push(`vendor=ilike.${encodeURIComponent(postgrestLike(vendor))}`);
    if(q){const like=postgrestLike(q);parts.push(`or=${encodeURIComponent(`(player_name.ilike.${like},vendor.ilike.${like},mpid.ilike.${like})`)}`)}
    const {data}=await remoteFetch(`camarillo_toc_players?${parts.join('&')}`); return (Array.isArray(data)?data:[]).map(fromRemotePlayer);
  }
  const db=await readLocal(); const nq=normalizeName(q),sv=String(state||'').toUpperCase(),vv=normalizeName(vendor);
  return (db.players||[]).filter(r=>(active===false||r.active!==false)&&(!sv||String(r.vendorState||'').toUpperCase()===sv)&&(!vv||normalizeName(r.vendor).includes(vv))&&(!nq||normalizeName(`${r.playerName} ${r.vendor} ${r.mpid||''}`).includes(nq))).sort((a,b)=>String(a.playerName).localeCompare(String(b.playerName))).slice(offset,offset+limit);
}

export async function getTocPlayer(tocId){
  if(!tocId)return null;
  if(REMOTE){const {data}=await remoteFetch(`camarillo_toc_players?toc_id=eq.${encodeURIComponent(tocId)}&select=*&limit=1`);return fromRemotePlayer(Array.isArray(data)?data[0]:null)}
  const db=await readLocal(); return (db.players||[]).find(r=>r.tocId===tocId)||null;
}

async function getTocLink(playerId){
  if(REMOTE){const {data}=await remoteFetch(`camarillo_player_toc_links?player_id=eq.${encodeURIComponent(playerId)}&select=*&limit=1`);return Array.isArray(data)?data[0]||null:null}
  const db=await readLocal(); return (db.links||[]).find(x=>x.playerId===playerId)||null;
}

export async function linkTocPlayer(playerId,tocId,{confirmed=true,matchMethod='manual',confidence='confirmed'}={}){
  const toc=await getTocPlayer(tocId); if(!toc)throw new Error('PPD/TOC player not found in the Nexus cache.');
  const linkedAt=now();
  if(REMOTE){
    const row={player_id:String(playerId),toc_id:tocId,mpid:toc.mpid||null,confirmed:Boolean(confirmed),match_method:matchMethod,confidence,linked_at:linkedAt,updated_at:linkedAt};
    await remoteFetch('camarillo_player_toc_links?on_conflict=player_id',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=minimal'},body:row});
  }else{
    const db=await readLocal(); const row={playerId:String(playerId),tocId,mpid:toc.mpid||null,confirmed:Boolean(confirmed),matchMethod,confidence,linkedAt,updatedAt:linkedAt}; const i=(db.links||[]).findIndex(x=>x.playerId===String(playerId)); if(i>=0)db.links[i]=row;else(db.links||(db.links=[])).push(row); await writeLocal(db);
  }
  return {playerId:String(playerId),toc};
}

export async function unlinkTocPlayer(playerId){
  if(REMOTE){await remoteFetch(`camarillo_player_toc_links?player_id=eq.${encodeURIComponent(playerId)}`,{method:'DELETE',headers:{prefer:'return=minimal'}})}
  else{const db=await readLocal();db.links=(db.links||[]).filter(x=>x.playerId!==String(playerId));await writeLocal(db)}
  return {ok:true,playerId:String(playerId)};
}

function tokenOverlap(a,b){
  const A=new Set(normalizeName(a).split(' ').filter(Boolean)),B=new Set(normalizeName(b).split(' ').filter(Boolean));
  if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.max(A.size,B.size);
}

export function scoreCandidate(player,toc){
  const pn=normalizeName(player?.name||`${player?.firstName||''} ${player?.lastName||''}`),tn=normalizeName(toc?.playerName||'');
  const state=String(player?.state||'').toUpperCase(),ts=String(toc?.vendorState||'').toUpperCase();
  let score=0,method='fuzzy';
  if(pn&&pn===tn){score=85;method='exact-name'}
  else{
    const pt=pn.split(' '),tt=tn.split(' ');
    if(pt.length>=2&&tt.length>=2&&pt[0]===tt.at(-1)&&pt.at(-1)===tt[0]){score=75;method='swapped-name'}
    else score=Math.round(tokenOverlap(pn,tn)*65);
  }
  if(state&&ts&&state===ts){score+=12;method+= '+state'}
  if(player?.gender&&toc?.sex&&String(player.gender)[0].toUpperCase()===String(toc.sex)[0].toUpperCase())score+=3;
  return {score:Math.min(100,score),method};
}

export async function findTocCandidates(player,{limit=8}={}){
  const name=player?.name||`${player?.firstName||''} ${player?.lastName||''}`;
  const norm=normalizeName(name); if(!norm)return[];
  const terms=norm.split(' '); const probe=terms.at(-1)||norm;
  const pool=await searchTocDirectory({q:probe,state:'',limit:100});
  return pool.map(toc=>({toc,...scoreCandidate(player,toc)})).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score||String(a.toc.playerName).localeCompare(String(b.toc.playerName))).slice(0,limit);
}

function bsReference(player){
  const b=player?.bullshooter||{};
  for(const key of ['50','20','10']){
    const ppd=num(b[`last${key}PPD`]),mpr=num(b[`last${key}MPR`]); if(ppd!==null&&mpr!==null)return{label:`BullShooter Last ${key}`,ppd,mpr,rating:tocCombinedRating(ppd,mpr)};
  }
  const ppd=num(b.ppd),mpr=num(b.mpr); return{label:'BullShooter Current',ppd,mpr,rating:tocCombinedRating(ppd,mpr)};
}

export function compareExternalRatings(player,toc){
  const bs=bsReference(player),tr=toc?{label:'PPD/TOC Best-Known',ppd:num(toc.ppd),mpr:num(toc.mpr),rating:num(toc.rating)??tocCombinedRating(toc.ppd,toc.mpr)}:null;
  if(!tr)return{bullshooter:bs,toc:null,confidence:'low',reason:'No linked PPD/TOC record.'};
  if(bs.ppd===null||bs.mpr===null||tr.ppd===null||tr.mpr===null)return{bullshooter:bs,toc:tr,confidence:'medium',reason:'Only one source has a complete PPD/MPR pair.'};
  const ppdDelta=Math.round(Math.abs(bs.ppd-tr.ppd)*1000)/1000,mprDelta=Math.round(Math.abs(bs.mpr-tr.mpr)*1000)/1000,ratingDelta=Math.round(Math.abs((bs.rating??0)-(tr.rating??0))*1000)/1000;
  let confidence='review',reason='External ratings disagree significantly.';
  if(ppdDelta<=1.5&&mprDelta<=0.15){confidence='high';reason='BullShooter and PPD/TOC agree closely.'}
  else if(ppdDelta<=3&&mprDelta<=0.3){confidence='medium';reason='BullShooter and PPD/TOC are reasonably aligned.'}
  return{bullshooter:bs,toc:tr,ppdDelta,mprDelta,ratingDelta,confidence,reason};
}

export async function getPlayerTocIntelligence(player){
  const link=await getTocLink(player.id);
  const toc=link?await getTocPlayer(link.toc_id||link.tocId):null;
  const candidates=!toc?await findTocCandidates(player):[];
  return{playerId:player.id,link,toc,candidates,comparison:compareExternalRatings(player,toc),handicapPolicy:'reference-only-v0.9'};
}
