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
const MAX_ARTICLES=Math.max(10,Number(process.env.NEXUS_INTEL_MAX_ARTICLES||60));
const SCROLL_PASSES=Math.max(1,Number(process.env.NEXUS_INTEL_SCROLL_PASSES||12));

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const sha=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const EVENT_KEYWORDS=/\b(dart|darts|tournament|blind draw|blinddraw|draw|501|301|cricket|soft tip|soft-tip|steel tip|steel-tip|bullshooter|bull shooter|doubles|singles|league|luck of the draw|lod|sign[- ]?up|registration|entry fee|buy[- ]?in|added money|payout|calcutta|round robin|double elimination|single elimination|remote darts?)\b/i;
const EVENT_SIGNAL=/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}[:.]\d{2}\s*(?:am|pm)|\d{1,2}\s*(?:am|pm)|\$\s*\d+|tonight|tomorrow|this weekend)\b/i;

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
function looksLikeContentShell(text='',contentBlocks=0){
  const t=clean(text);
  if(contentBlocks>0) return false;
  if(t.length<350) return true;
  const hay=t.toLowerCase();
  return hay.includes('facebook © 2026')&&contentBlocks===0;
}
async function expandVisibleText(page){
  const candidates=page.getByText(/^See more$/i);
  const count=Math.min(await candidates.count().catch(()=>0),25);
  for(let i=0;i<count;i++){
    try{await candidates.nth(i).click({timeout:900});await page.waitForTimeout(100);}catch{}
  }
}
async function scrollForPosts(page){
  let previousHeight=0;
  for(let i=0;i<SCROLL_PASSES;i++){
    await expandVisibleText(page);
    await page.mouse.wheel(0,1800);
    await page.waitForTimeout(1400);
    const height=await page.evaluate(()=>document.documentElement.scrollHeight).catch(()=>0);
    if(height===previousHeight&&i>=4){
      await page.mouse.wheel(0,2600);
      await page.waitForTimeout(1600);
    }
    previousHeight=height;
  }
  await expandVisibleText(page);
}
async function extractVisibleArticles(page){
  return await page.locator('[role="article"]').evaluateAll((nodes,maxArticles)=>nodes.slice(0,maxArticles).map((node,index)=>{
    const text=(node.innerText||'').replace(/\s+/g,' ').trim();
    const links=Array.from(node.querySelectorAll('a[href]')).map(a=>a.href).filter(Boolean);
    const postUrl=links.find(h=>/facebook\.com\/.+\/(posts|permalink)\//i.test(h))||links.find(h=>/[?&]story_fbid=/i.test(h))||links.find(h=>/facebook\.com\/events\//i.test(h))||'';
    const imageAlts=Array.from(node.querySelectorAll('img[alt]')).map(img=>(img.getAttribute('alt')||'').replace(/\s+/g,' ').trim()).filter(Boolean);
    const combined=[text,...imageAlts].filter(Boolean).join(' | ');
    return {index,text,imageAlts:imageAlts.slice(0,10),combined,postUrl,links:links.slice(0,16)};
  }),MAX_ARTICLES).catch(()=>[]);
}
async function extractMessageBlocks(page){
  const selector='[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-preview="message"] div[dir="auto"]';
  return await page.locator(selector).evaluateAll(nodes=>{
    const seen=new Set(); const out=[];
    for(const node of nodes){
      const text=(node.innerText||'').replace(/\s+/g,' ').trim();
      if(!text||text.length<8||seen.has(text)) continue;
      seen.add(text);out.push(text);
      if(out.length>=80) break;
    }
    return out;
  }).catch(()=>[]);
}
function keywordSnippets(text=''){
  const normalized=clean(text);
  const lower=normalized.toLowerCase();
  const terms=['tournament','blind draw','blinddraw','501','cricket','bullshooter','bull shooter','soft tip','steel tip','doubles','singles','entry fee','added money','payout','calcutta','round robin','double elimination'];
  const snippets=[]; const seen=new Set();
  for(const term of terms){
    let from=0;
    while(snippets.length<20){
      const index=lower.indexOf(term,from);if(index<0) break;
      const start=Math.max(0,index-180),end=Math.min(normalized.length,index+term.length+260);
      const snippet=clean(normalized.slice(start,end));
      if(snippet&&!seen.has(snippet)){seen.add(snippet);snippets.push(snippet);}
      from=index+term.length;
    }
  }
  return snippets;
}
function scoreCandidate(text=''){
  const value=clean(text);
  let score=0;
  if(EVENT_KEYWORDS.test(value)) score+=2;
  if(EVENT_SIGNAL.test(value)) score+=1;
  if(/\b(?:houston|spring|pasadena|katy|cypress|humble|baytown|pearland|tomball|conroe|webster|league city)\b/i.test(value)) score+=1;
  if(/\b(?:bar|pub|grill|saloon|lounge|tavern|sports bar|club)\b/i.test(value)) score+=1;
  return score;
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
      const messageBlocks=await extractMessageBlocks(page);
      const bodyText=clean(await page.locator('body').innerText({timeout:10000}).catch(()=>''));
      const loginWall=looksLikeLoginWall(bodyText,finalUrl);
      const contentBlocks=articles.length+messageBlocks.length;
      const contentShell=looksLikeContentShell(bodyText,contentBlocks);
      const bodySnippets=keywordSnippets(bodyText);
      const rawCandidates=[
        ...articles.map(article=>({kind:'article',text:article.combined||article.text,postUrl:article.postUrl,links:article.links,imageAlts:article.imageAlts})),
        ...messageBlocks.map(text=>({kind:'message',text,postUrl:'',links:[],imageAlts:[]})),
        ...bodySnippets.map(text=>({kind:'body-snippet',text,postUrl:'',links:[],imageAlts:[]}))
      ];
      const deduped=[];const seenCandidate=new Set();
      for(const candidate of rawCandidates){
        const key=clean(candidate.text).toLowerCase();
        if(!key||seenCandidate.has(key)) continue;
        seenCandidate.add(key);
        const score=scoreCandidate(candidate.text);
        if(score>=2) deduped.push({...candidate,score});
      }
      deduped.sort((a,b)=>b.score-a.score||b.text.length-a.text.length);
      const eventCandidates=deduped.slice(0,50);
      const stableText=[...articles.map(a=>a.combined||a.text),...messageBlocks].filter(Boolean).join('\n')||bodyText;
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
        messageBlockCount:messageBlocks.length,
        eventCandidateCount:eventCandidates.length,
        eventCandidates,
        visibleArticles:articles,
        messageBlocks,
        bodyKeywordSnippets:bodySnippets,
        visibleText:bodyText
      };
      await writeJson(path.join(INBOX,source.id,`${stamp}.json`),snapshot);
      state.sources[source.id]={contentHash,capturedAt:checkedAt,finalUrl,loginWall,contentShell,articleCount:articles.length,messageBlockCount:messageBlocks.length,eventCandidateCount:eventCandidates.length};
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
        messageBlockCount:messageBlocks.length,
        eventCandidateCount:eventCandidates.length,
        articlePreviews:articles.slice(0,5).map(a=>({text:(a.text||a.combined).slice(0,260),imageAlts:a.imageAlts?.slice(0,3)||[],postUrl:a.postUrl})),
        messagePreviews:messageBlocks.slice(0,5).map(text=>text.slice(0,300)),
        candidatePreviews:eventCandidates.slice(0,8).map(c=>({kind:c.kind,score:c.score,text:c.text.slice(0,360),postUrl:c.postUrl})),
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
