import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.join(ROOT,'data','event-intelligence');
const SOURCES=path.join(DATA,'sources.json');
const INBOX=path.join(DATA,'inbox');
const STATE=path.join(DATA,'capture-state.local.json');
const HEADLESS=process.env.NEXUS_INTEL_HEADLESS!=='0';
const PROFILE_DIR=process.env.NEXUS_FB_PROFILE_DIR?path.resolve(process.env.NEXUS_FB_PROFILE_DIR):'';
const MAX_ARTICLES=Math.max(5,Number(process.env.NEXUS_INTEL_MAX_ARTICLES||40));
const SCROLL_PASSES=Math.max(1,Number(process.env.NEXUS_INTEL_SCROLL_PASSES||5));

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const sha=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const EVENT_KEYWORDS=/\b(dart|darts|tournament|blind draw|draw|501|cricket|soft tip|steel tip|bullshooter|doubles|singles|league|luck of the draw|lod|sign[- ]?up|registration|entry fee|added money|payout|calcutta)\b/i;

async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}
}
async function writeJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(value,null,2)+'\n','utf8');
}
function looksLikeLoginWall(text='',url=''){
  const hay=`${url}\n${text}`.toLowerCase();
  return hay.includes('log into facebook')||hay.includes('log in to facebook')||hay.includes('you must log in')||hay.includes('/login/?next=')||hay.includes('create new account');
}
function looksLikeContentShell(text='',articleCount=0){
  const t=clean(text);
  if(articleCount>0) return false;
  if(t.length<350) return true;
  const hay=t.toLowerCase();
  return hay.includes('facebook © 2026')&&articleCount===0;
}
async function scrollForPosts(page){
  for(let i=0;i<SCROLL_PASSES;i++){
    await page.mouse.wheel(0,1500);
    await page.waitForTimeout(1200);
  }
}
async function extractVisibleArticles(page){
  return await page.locator('[role="article"]').evaluateAll((nodes,maxArticles)=>nodes.slice(0,maxArticles).map((node,index)=>{
    const text=(node.innerText||'').replace(/\s+/g,' ').trim();
    const links=Array.from(node.querySelectorAll('a[href]')).map(a=>a.href).filter(Boolean);
    const postUrl=links.find(h=>/facebook\.com\/.+\/(posts|permalink)\//i.test(h))||links.find(h=>/facebook\.com\/events\//i.test(h))||'';
    return {index,text,postUrl,links:links.slice(0,12)};
  }),MAX_ARTICLES).catch(()=>[]);
}

const db=await readJson(SOURCES,{version:1,sources:[]});
const state=await readJson(STATE,{version:1,sources:{}});
const selected=(db.sources||[]).filter(source=>source.active!==false&&source.platform==='facebook'&&source.collectionMode!=='manual_review');

if(!selected.length){
  console.log(JSON.stringify({ok:true,message:'No active Facebook sources are configured for browser capture.',captured:0,changed:0,skipped:0},null,2));
  process.exit(0);
}

const needsAuth=selected.some(source=>source.collectionMode==='authenticated_browser');
if(needsAuth&&!PROFILE_DIR){
  throw new Error('At least one source uses authenticated_browser. Set NEXUS_FB_PROFILE_DIR to a dedicated local Playwright profile directory. Log into Facebook in that browser profile yourself; do not put credentials in the repo.');
}

let browser=null;
let context=null;
if(needsAuth){
  context=await chromium.launchPersistentContext(PROFILE_DIR,{headless:HEADLESS,viewport:{width:1440,height:1100}});
}else{
  browser=await chromium.launch({headless:HEADLESS});
  context=await browser.newContext({viewport:{width:1440,height:1100}});
}

let captured=0,changed=0,skipped=0;
const results=[];
try{
  for(const source of selected){
    const checkedAt=new Date().toISOString();
    const page=await context.newPage();
    try{
      await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForTimeout(3500);
      await scrollForPosts(page);
      const finalUrl=page.url();
      const title=clean(await page.title().catch(()=>''));
      const articles=await extractVisibleArticles(page);
      const bodyText=clean(await page.locator('body').innerText({timeout:10000}).catch(()=>''));
      const loginWall=looksLikeLoginWall(bodyText,finalUrl);
      const contentShell=looksLikeContentShell(bodyText,articles.length);
      const eventCandidates=articles.filter(article=>EVENT_KEYWORDS.test(article.text)).map(article=>({
        text:article.text,
        postUrl:article.postUrl,
        links:article.links
      }));
      const stableText=articles.length?articles.map(a=>a.text).join('\n'):bodyText;
      const contentHash=sha(`${title}\n${stableText}`);
      const prior=state.sources[source.id]||{};
      const isChanged=prior.contentHash!==contentHash;
      const stamp=checkedAt.replace(/[:.]/g,'-');
      const snapshot={
        sourceId:source.id,
        sourceName:source.name,
        sourceUrl:source.url,
        finalUrl,
        capturedAt:checkedAt,
        title,
        contentHash,
        changed:isChanged,
        loginWall,
        contentShell,
        collectionMode:source.collectionMode,
        articleCount:articles.length,
        eventCandidateCount:eventCandidates.length,
        eventCandidates,
        visibleArticles:articles,
        visibleText:bodyText
      };
      await writeJson(path.join(INBOX,source.id,`${stamp}.json`),snapshot);
      state.sources[source.id]={contentHash,capturedAt:checkedAt,finalUrl,loginWall,contentShell,articleCount:articles.length,eventCandidateCount:eventCandidates.length};
      source.lastCheckedAt=checkedAt;
      if(loginWall||contentShell){
        source.lastError=loginWall?'Facebook login/member wall detected; establish or refresh the local browser session.':'Facebook page loaded but useful post content was not exposed; review the browser session or group membership.';
        skipped++;
      }else{
        source.lastSuccessAt=checkedAt;
        source.lastError='';
        captured++;
        if(isChanged) changed++;
      }
      results.push({
        sourceId:source.id,
        name:source.name,
        changed:isChanged,
        loginWall,
        contentShell,
        characters:bodyText.length,
        articleCount:articles.length,
        eventCandidateCount:eventCandidates.length,
        candidatePreviews:eventCandidates.slice(0,5).map(c=>({text:c.text.slice(0,220),postUrl:c.postUrl})),
        finalUrl
      });
    }catch(error){
      source.lastCheckedAt=checkedAt;
      source.lastError=error.message;
      skipped++;
      results.push({sourceId:source.id,name:source.name,error:error.message});
    }finally{
      await page.close().catch(()=>{});
    }
  }
}finally{
  db.updatedAt=new Date().toISOString();
  state.updatedAt=new Date().toISOString();
  await writeJson(SOURCES,db);
  await writeJson(STATE,state);
  await context.close().catch(()=>{});
  await browser?.close().catch(()=>{});
}

console.log(JSON.stringify({ok:true,captured,changed,skipped,results},null,2));
