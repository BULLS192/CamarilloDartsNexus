import { average, round } from './ratings.js';

const PARSER_VERSION = '0.7.2';

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
    // BullShooter has rendered the value both before and after the label at different times.
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

function parseProfileText(text, id) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  let name = null;
  const idx = lines.findIndex(l => l === `#${id}` || l.includes(`#${id}`));
  if (idx >= 0) {
    const candidates = lines.slice(Math.max(0, idx - 6), idx + 8)
      .filter(x => !x.includes(String(id)) && x.length > 1 && x.length < 70);
    name = candidates.find(x => !/Leaderboard|Search|Welcome|Games|Win Rate|Contact|Profile|Locations|Performance|Guest/i.test(x)) || null;
  }

  const core = coreSectionLines(text);
  return {
    id: String(id),
    name,
    // Plausibility bounds intentionally reject page numbers / select values such as 1 or 30.
    mpr: numberNearLabel(core, 'MPR', { min: 0.5, max: 9 }),
    ppd: numberNearLabel(core, 'PPD', { min: 5, max: 100 }),
    wins: numberNearLabel(core, 'Wins', { min: 0, max: 10000000, integer: true }),
    losses: numberNearLabel(core, 'Losses', { min: 0, max: 10000000, integer: true })
  };
}

async function waitForCoreStats(page, id, timeoutMs = 9000) {
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
  const pattern = discipline === 'cricket' ? /^\s*Cricket\s*$/i : /^\s*01(?:\s+Games)?\s*$/i;
  const nodes = page.locator('button, [role="button"], a');
  const n = await nodes.count();
  for (let i = 0; i < n; i++) {
    const el = nodes.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const txt = (await el.innerText().catch(() => '')).trim();
    if (pattern.test(txt)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(700);
      return true;
    }
  }
  return false;
}

function parseDateMaybe(text) {
  const d = new Date(text);
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
      const links = await tr.locator('a').evaluateAll(as => as.map(a => ({
        text: (a.textContent || '').trim(),
        href: a.getAttribute('href') || ''
      }))).catch(() => []);

      let opponentId = null;
      let opponentName = null;
      for (const l of links) {
        const m = l.href.match(/[?&]id=(\d+)/);
        if (m) {
          opponentId = m[1];
          opponentName = l.text || null;
          break;
        }
      }

      const resultText = resultIndex >= 0 && cells[resultIndex] != null ? cells[resultIndex] : raw;
      const upper = String(resultText).toUpperCase();
      let result = null;
      if (/\bWIN\b|^\s*W\s*$/.test(upper)) result = 'W';
      else if (/\bLOSS\b|\bLOSE\b|^\s*L\s*$/.test(upper)) result = 'L';

      let dateCell = dateIndex >= 0 && cells[dateIndex] != null ? cells[dateIndex] : null;
      if (!dateCell) {
        dateCell = [...cells].reverse().find(c => /\d{1,2}[\/\-]\d{1,2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(c)) || null;
      }

      rows.push({
        discipline,
        stat,
        result,
        opponentId,
        opponentName,
        dateText: dateCell,
        playedAt: dateCell ? parseDateMaybe(dateCell) : null,
        rawText: raw
      });
    }
  }
  return rows;
}

async function waitForRecentRows(page, discipline, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await visibleRows(page, discipline);
    if (rows.length) return rows;
    await page.waitForTimeout(400);
  }
  return rows;
}

async function collectRecent(page, discipline, limit = 30) {
  await clickDiscipline(page, discipline);
  const all = [];
  const seen = new Set();

  for (let pageNum = 0; pageNum < 8 && all.length < limit; pageNum++) {
    const rows = pageNum === 0
      ? await waitForRecentRows(page, discipline)
      : await visibleRows(page, discipline);

    for (const row of rows) {
      const key = `${row.rawText}|${row.opponentId || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(row);
      }
    }
    if (all.length >= limit) break;

    const nextCandidates = page.locator('button, a');
    let clicked = false;
    const n = await nextCandidates.count();
    for (let i = 0; i < n; i++) {
      const el = nextCandidates.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const txt = (await el.innerText().catch(() => '')).trim();
      if (/^Next$/i.test(txt) || txt === '›' || txt === '»') {
        const disabled = await el.isDisabled().catch(() => false);
        const ariaDisabled = await el.getAttribute('aria-disabled').catch(() => null);
        if (!disabled && ariaDisabled !== 'true') {
          await el.click().catch(() => {});
          await page.waitForTimeout(650);
          clicked = true;
          break;
        }
      }
    }
    if (!clicked) break;
  }
  return all.slice(0, limit);
}

function recentAvg(rows, n) {
  const vals = rows.slice(0, n).map(r => r.stat).filter(Number.isFinite);
  return vals.length ? round(average(vals), 2) : null;
}

async function loadProfilePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Network-idle is not guaranteed on analytics-heavy pages, so use a short settled wait plus explicit stat polling.
  await page.waitForTimeout(900);
}

export async function importBullshooterProfile(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('BullShooter ID must contain digits only.');

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed. Run: npm install && npx playwright install chromium');
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const url = `https://www.bullshooter.live/profile/?id=${encodeURIComponent(id)}`;

    await loadProfilePage(page, url);
    const { profile } = await waitForCoreStats(page, id);

    // IMPORTANT: collect sequentially. Clicking Cricket and 01 concurrently on one page creates a race.
    const cricketGames = await collectRecent(page, 'cricket', 30).catch(() => []);

    // Reset the profile before switching disciplines so pagination/tab state cannot contaminate the 01 sample.
    await loadProfilePage(page, url);
    const games01 = await collectRecent(page, '01', 30).catch(() => []);

    profile.recentCricketGames = cricketGames;
    profile.recent01Games = games01;
    profile.last30MPR = recentAvg(cricketGames, 30);
    profile.last10MPR = recentAvg(cricketGames, 10);
    profile.last30PPD = recentAvg(games01, 30);
    profile.last10PPD = recentAvg(games01, 10);
    profile.recentGameCount = cricketGames.length + games01.length;
    profile.sourceUrl = url;
    profile.rawImportedAt = new Date().toISOString();
    profile.parserVersion = PARSER_VERSION;

    if (![profile.mpr, profile.ppd, profile.last30MPR, profile.last30PPD].some(Number.isFinite)) {
      throw new Error('Profile loaded, but statistics could not be parsed. The site layout may have changed.');
    }
    return profile;
  } finally {
    await browser.close();
  }
}
