import { average, round } from './ratings.js';

function numberAfter(text,label){const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const re of [new RegExp(`${esc}\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`,'i'),new RegExp(`${esc}[^\\d]{0,60}(\\d+(?:\\.\\d+)?)`,'i')]){const m=text.match(re);if(m)return Number(m[1])}return null}
function parseProfileText(text,id){const lines=text.split(/\n+/).map(s=>s.trim()).filter(Boolean);let name=null;const idx=lines.findIndex(l=>l===`#${id}`||l.includes(`#${id}`));if(idx>=0){const candidates=lines.slice(Math.max(0,idx-6),idx+8).filter(x=>!x.includes(String(id))&&x.length>1&&x.length<70);name=candidates.find(x=>!/Leaderboard|Search|Welcome|Games|Win Rate|Contact|Profile|Locations|Performance|Guest/i.test(x))||null}return{id:String(id),name,mpr:numberAfter(text,'MPR'),ppd:numberAfter(text,'PPD'),wins:numberAfter(text,'Wins'),losses:numberAfter(text,'Losses')}}

async function clickDiscipline(page,discipline){
  const pattern=discipline==='cricket'?/^\s*Cricket\s*$/i:/^\s*01(?:\s+Games)?\s*$/i;
  const nodes=page.locator('button, [role="button"], a');const n=await nodes.count();
  for(let i=0;i<n;i++){const el=nodes.nth(i);const txt=(await el.innerText().catch(()=>'' )).trim();if(pattern.test(txt)){await el.click().catch(()=>{});await page.waitForTimeout(500);return true}}
  return false;
}
function parseDateMaybe(text){const d=new Date(text);return Number.isNaN(d.getTime())?null:d.toISOString()}
async function visibleRows(page,discipline){
  const rows=[];const tables=page.locator('table');const tc=await tables.count();
  for(let ti=0;ti<tc;ti++){
    const table=tables.nth(ti);if(!(await table.isVisible().catch(()=>false)))continue;
    const header=(await table.locator('thead').innerText().catch(()=>'' )).toLowerCase();
    if(discipline==='cricket'&&!header.includes('mpr'))continue;if(discipline==='01'&&!header.includes('ppd'))continue;
    const trs=table.locator('tbody tr');const rc=await trs.count();
    for(let ri=0;ri<rc;ri++){
      const tr=trs.nth(ri);const cells=await tr.locator('td').allTextContents().catch(()=>[]);if(cells.length<2)continue;
      const raw=(await tr.innerText().catch(()=>cells.join(' | '))).trim();const links=await tr.locator('a').evaluateAll(as=>as.map(a=>({text:(a.textContent||'').trim(),href:a.getAttribute('href')||''}))).catch(()=>[]);
      let opponentId=null,opponentName=null;for(const l of links){const m=l.href.match(/[?&]id=(\d+)/);if(m){opponentId=m[1];opponentName=l.text||null;break}}
      const statCell=cells.find(c=>/^\s*\d+(?:\.\d+)?\s*$/.test(c));const stat=statCell?Number(statCell.trim()):null;
      const dateCell=[...cells].reverse().find(c=>/\d{1,2}[\/\-]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(c));
      const upper=raw.toUpperCase();let result=null;if(/\bWIN\b|\bW\b/.test(upper))result='W';else if(/\bLOSS\b|\bLOSE\b|\bL\b/.test(upper))result='L';
      if(Number.isFinite(stat))rows.push({discipline,stat,result,opponentId,opponentName,dateText:dateCell||null,playedAt:dateCell?parseDateMaybe(dateCell):null,rawText:raw});
    }
  }
  return rows;
}
async function collectRecent(page,discipline,limit=30){
  await clickDiscipline(page,discipline);const all=[];const seen=new Set();
  for(let pageNum=0;pageNum<6&&all.length<limit;pageNum++){
    const rows=await visibleRows(page,discipline);for(const row of rows){const key=`${row.rawText}|${row.opponentId||''}`;if(!seen.has(key)){seen.add(key);all.push(row)}}
    if(all.length>=limit)break;
    const nextCandidates=page.locator('button, a');let clicked=false;const n=await nextCandidates.count();
    for(let i=0;i<n;i++){const el=nextCandidates.nth(i);if(!(await el.isVisible().catch(()=>false)))continue;const txt=(await el.innerText().catch(()=>'' )).trim();if(/^Next$/i.test(txt)||txt==='›'||txt==='»'){const disabled=await el.isDisabled().catch(()=>false);if(!disabled){await el.click().catch(()=>{});await page.waitForTimeout(450);clicked=true;break}}}
    if(!clicked)break;
  }
  return all.slice(0,limit);
}
function recentAvg(rows,n){const vals=rows.slice(0,n).map(r=>r.stat).filter(Number.isFinite);return vals.length?round(average(vals),2):null}

export async function importBullshooterProfile(id){
  if(!/^\d+$/.test(String(id)))throw new Error('BullShooter ID must contain digits only.');let chromium;try{({chromium}=await import('playwright'))}catch{throw new Error('Playwright is not installed. Run: npm install && npx playwright install chromium')}
  const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}});const url=`https://www.bullshooter.live/profile/?id=${encodeURIComponent(id)}`;await page.goto(url,{waitUntil:'networkidle',timeout:30000});await page.waitForTimeout(1200);const text=await page.locator('body').innerText();const profile=parseProfileText(text,id);
    const [cricketGames,games01]=await Promise.all([collectRecent(page,'cricket',30).catch(()=>[]),collectRecent(page,'01',30).catch(()=>[])]);
    profile.recentCricketGames=cricketGames;profile.recent01Games=games01;
    profile.last30MPR=recentAvg(cricketGames,30);profile.last10MPR=recentAvg(cricketGames,10);profile.last30PPD=recentAvg(games01,30);profile.last10PPD=recentAvg(games01,10);
    profile.recentGameCount=cricketGames.length+games01.length;profile.sourceUrl=url;profile.rawImportedAt=new Date().toISOString();
    if(![profile.mpr,profile.ppd,profile.last30MPR,profile.last30PPD].some(Number.isFinite))throw new Error('Profile loaded, but statistics could not be parsed. The site layout may have changed.');return profile;
  }finally{await browser.close()}}
