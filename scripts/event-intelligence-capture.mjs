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

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const sha=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');

async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}
}
async function writeJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(value,null,2)+'\n','utf8');
}
function looksLikeLoginWall(text='',url=''){
  const hay=`${url}\n${text}`.toLowerCase();
  return hay.includes('log into facebook')||hay.includes('log in to facebook')||hay.includes('you must log in')||hay.includes('/login/?next=');
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
      const finalUrl=page.url();
      const title=clean(await page.title().catch(()=>''));
      const text=clean(await page.locator('body').innerText({timeout:10000}).catch(()=>''));
      const loginWall=looksLikeLoginWall(text,finalUrl);
      const contentHash=sha(`${title}\n${text}`);
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
        collectionMode:source.collectionMode,
        visibleText:text
      };
      await writeJson(path.join(INBOX,source.id,`${stamp}.json`),snapshot);
      state.sources[source.id]={contentHash,capturedAt:checkedAt,finalUrl,loginWall};
      source.lastCheckedAt=checkedAt;
      if(loginWall){
        source.lastError='Facebook login/member wall detected; review collection mode or browser session.';
        skipped++;
      }else{
        source.lastSuccessAt=checkedAt;
        source.lastError='';
        captured++;
        if(isChanged) changed++;
      }
      results.push({sourceId:source.id,name:source.name,changed:isChanged,loginWall,characters:text.length,finalUrl});
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
