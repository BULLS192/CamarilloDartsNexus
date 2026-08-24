import { average, round } from './ratings.js';

const PARSER_VERSION = '0.7.5';

function asNumber(line) {
  const m = String(line || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function coreSectionLines(text) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const start = lines.findIndex(l => /^Performance$/i.test(l));
  const end = lines.findIndex((l, i) => i > start && /^Recent Performance$/i.test(l));
  return start >= 0 ? lines.slice(start + 1, end > start ? end : undefined) : lines;
}

function numberNearLabel(lines, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const indices = [];
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^${label}$`, 'i').test(lines[i])) indices.push(i);
  }
  for (const idx of indices) {
    for (const distance of [1, 2, 3]) {
      for (const j of [idx + distance, idx - distance]) {
        if (j < 0 || j >= lines.length) continue;
        const value = asNumber(lines[j]);
        if (!inRange(value, min, max)) continue;
        if (integer && !Number.isInteger(value)) continue;
        return value;
      }
    }
  }
  return null;
}

const BAD_PROFILE_NAMES = /^(ANALYTICS|LEADERBOARD|SEARCH|WELCOME|GAMES|WIN RATE|CONTACT|PROFILE|LOCATIONS|PERFORMANCE|RECENT PERFORMANCE|GUEST|CRICKET|01(?: GAMES)?)$/i;
function plausibleProfileName(value, id) {
  const x = String(value || '').trim();
  return x.length > 1 && x.length < 70 && !x.includes(String(id)) && !BAD_PROFILE_NAMES.test(x);
}

function parseProfileText(text, id) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  let name = null;
  const idx = lines.findIndex(l => l === `#${id}` || l.includes(`#${id}`));
  if (idx >= 0) {
    const before = lines.slice(Math.max(0, idx - 8), idx).reverse();
    const after = lines.slice(idx + 1, idx + 9);
    name = before.find(x => plausibleProfileName(x, id)) || after.find(x => plausibleProfileName(x, id)) || null;
  }
  const core = coreSectionLines(text);
  return {
    id: String(id), name,
    mpr: numberNearLabel(core, 'MPR', { min: 0.5, max: 9 }),
    ppd: numberNearLabel(core, 'PPD', { min: 5, max: 100 }),
    wins: numberNearLabel(core, 'Wins', { min: 0, max: 10000000, integer: true }),
    losses: numberNearLabel(core, 'Losses', { min: 0, max: 10000000, integer: true })
  };
}

async function waitForCoreStats(page, id, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let profile = null;
  while (Date.now() < deadline) {
    lastText = await page.locator('body').innerText().catch(() => '');
    profile = parseProfileText(lastText, id);
    if (Number.isFinite(profile.mpr) && Number.isFinite(profile.ppd)) return { profile, text: lastText };
    await page.waitForTimeout(500);
  }
  return { profile: profile || parseProfileText(lastText, id), text: lastText };
}

async function clickDiscipline(page, discipline) {
  const patterns = discipline === 'cricket'
    ? [/^\s*Cricket\s*$/i, /Cricket/i]
    : [/^\s*01(?:\s+Games)?\s*$/i, /01\s*Games/i, /'01/i, /01/i];
  const nodes = page.locator('button, [role="button"], a, [role="tab"]');
  const n = await nodes.count();
  for (const pattern of patterns) {
    for (let i = 0; i < n; i++) {
      const el = nodes.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const txt = (await el.innerText().catch(() => '')).trim();
      if (!pattern.test(txt)) continue;
      await el.click().catch(() => {});
      await page.waitForTimeout(900);
      return true;
    }
  }
  return false;
}

function parseDateMaybe(text) {
  const d = new Date(String(text || '').replace(/\s+/g, ' ').trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function statFromCell(text, discipline) {
  const value = asNumber(text);
  if (discipline === 'cricket') return inRange(value, 0.5, 9) ? value : null;
  return inRange(value, 5, 100) ? value : null;
}

async function visibleRows(page, discipline) {
  const rows = [];
  const tables = page.locator('table');
  const tc = await tables.count();
  for (let ti = 0; ti < tc; ti++) {
    const table = tables.nth(ti);
    if (!(await table.isVisible().catch(() => false))) continue;
    const headerCells = await table.locator('thead th, thead td').allTextContents().catch(() => []);
    const headers = headerCells.map(h => h.trim().toLowerCase());
    const wanted = discipline === 'cricket' ? 'mpr' : 'ppd';
    const statIndex = headers.findIndex(h => h === wanted || h.includes(wanted));
    if (statIndex < 0) continue;
    const resultIndex = headers.findIndex(h => h.includes('result'));
    const dateIndex = headers.findIndex(h => h.includes('date') || h.includes('time'));
    const trs = table.locator('tbody tr');
    const rc = await trs.count();
    for (let ri = 0; ri < rc; ri++) {
      const tr = trs.nth(ri);
      const cells = await tr.locator('td').allTextContents().catch(() => []);
      if (cells.length <= statIndex) continue;
      const stat = statFromCell(cells[statIndex], discipline);
      if (!Number.isFinite(stat)) continue;
      const raw = (await tr.innerText().catch(() => cells.join(' | '))).trim();
      const links = await tr.locator('a').evaluateAll(as => as.map(a => ({ text: (a.textContent || '').trim(), href: a.getAttribute('href') || '' }))).catch(() => []);
      let opponentId = null, opponentName = null;
      for (const l of links) {
        const m = l.href.match(/[?&]id=(\d+)/);
        if (m) { opponentId = m[1]; opponentName = l.text || null; break; }
      }
      const resultText = resultIndex >= 0 && cells[resultIndex] != null ? cells[resultIndex] : raw;
      const upper = String(resultText).toUpperCase();
      let result = null;
      if (/\bWIN\b|^\s*W\s*$/.test(upper)) result = 'W';
      else if (/\bLOSS\b|\bLOSE\b|^\s*L\s*$/.test(upper)) result = 'L';
      let dateCell = dateIndex >= 0 && cells[dateIndex] != null ? cells[dateIndex] : null;
      if (!dateCell) dateCell = [...cells].reverse().find(c => /\d{1,2}[\/\-]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(c)) || null;
      rows.push({ discipline, stat, result, opponentId, opponentName, dateText: dateCell, playedAt: dateCell ? parseDateMaybe(dateCell) : null, rawText: raw });
    }
  }
  return rows;
}

async function waitForRecentRows(page, discipline, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await visibleRows(page, discipline);
    if (rows.length) return rows;
    await page.waitForTimeout(400);
  }
  return rows;
}

async function maximizePageSize(page) {
  const selects = page.locator('select');
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;
    const options = await sel.locator('option').evaluateAll(opts => opts.map(o => ({ value:o.value, text:(o.textContent||'').trim() }))).catch(() => []);
    const numeric = options.map(o => ({...o,n:Number(o.text.match(/\d+/)?.[0])})).filter(o => Number.isFinite(o.n));
    if (!numeric.length) continue;
    numeric.sort((a,b)=>b.n-a.n);
    const best = numeric.find(o => o.n >= 30) || numeric[0];
    if (best && best.n > 10) {
      await sel.selectOption(best.value).catch(() => {});
      await page.waitForTimeout(700);
    }
  }
}

async function clickNextPage(page) {
  const candidates = page.locator('button, a, [role="button"]');
  const n = await candidates.count();
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const txt = (await el.innerText().catch(() => '')).trim();
    const aria = (await el.getAttribute('aria-label').catch(() => '')) || '';
    const title = (await el.getAttribute('title').catch(() => '')) || '';
    if (!(/^Next$/i.test(txt) || txt === '›' || txt === '»' || /next/i.test(aria) || /next/i.test(title))) continue;
    const disabled = await el.isDisabled().catch(() => false);
    const ariaDisabled = await el.getAttribute('aria-disabled').catch(() => null);
    const cls = (await el.getAttribute('class').catch(() => '')) || '';
    if (disabled || ariaDisabled === 'true' || /disabled/i.test(cls)) continue;
    await el.click().catch(() => {});
    await page.waitForTimeout(850);
    return true;
  }
  return false;
}

async function collectRecent(page, discipline, limit = 30) {
  const clicked = await clickDiscipline(page, discipline);
  if (!clicked) return [];
  await maximizePageSize(page);
  const all = [], seen = new Set();
  for (let pageNum = 0; pageNum < 12 && all.length < limit; pageNum++) {
    const rows = pageNum === 0 ? await waitForRecentRows(page, discipline) : await visibleRows(page, discipline);
    for (const row of rows) {
      const key = `${row.playedAt || row.dateText || ''}|${row.stat}|${row.result || ''}|${row.opponentId || ''}|${row.rawText}`;
      if (!seen.has(key)) { seen.add(key); all.push(row); }
    }
    if (all.length >= limit) break;
    if (!(await clickNextPage(page))) break;
  }
  all.sort((a,b) => String(b.playedAt || '').localeCompare(String(a.playedAt || '')));
  return all.slice(0, limit);
}

function recentAvg(rows, n) {
  const vals = rows.slice(0, n).map(r => r.stat).filter(Number.isFinite);
  return vals.length ? round(average(vals), 2) : null;
}

async function loadProfilePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1100);
}

export async function importBullshooterProfile(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('BullShooter ID must contain digits only.');
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('Playwright is not installed. Run: npm install && npx playwright install chromium'); }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const url = `https://www.bullshooter.live/profile/?id=${encodeURIComponent(id)}`;
    await loadProfilePage(page, url);
    const { profile } = await waitForCoreStats(page, id);
    const cricketGames = await collectRecent(page, 'cricket', 30).catch(() => []);
    await loadProfilePage(page, url);
    const games01 = await collectRecent(page, '01', 30).catch(() => []);
    profile.recentCricketGames = cricketGames;
    profile.recent01Games = games01;
    profile.last30MPR = recentAvg(cricketGames, 30);
    profile.last10MPR = recentAvg(cricketGames, 10);
    profile.last30PPD = recentAvg(games01, 30);
    profile.last10PPD = recentAvg(games01, 10);
    profile.recentCricketCount = cricketGames.length;
    profile.recent01Count = games01.length;
    profile.recentGameCount = cricketGames.length + games01.length;
    profile.sourceUrl = url;
    profile.rawImportedAt = new Date().toISOString();
    profile.parserVersion = PARSER_VERSION;
    if (![profile.mpr, profile.ppd, profile.last30MPR, profile.last30PPD].some(Number.isFinite)) throw new Error('Profile loaded, but statistics could not be parsed. The site layout may have changed.');
    return profile;
  } finally { await browser.close(); }
}
