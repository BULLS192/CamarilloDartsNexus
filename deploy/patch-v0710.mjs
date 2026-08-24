import fs from 'node:fs';

const bsPath = fs.existsSync('/app/src/bullshooter.js') ? '/app/src/bullshooter.js' : 'src/bullshooter.js';
let s = fs.readFileSync(bsPath, 'utf8');
s = s.replace("const PARSER_VERSION = '0.7.9';", "const PARSER_VERSION = '0.7.10';");

const anchor = `function recentAvg(rows, n) {\n  const vals = rows.slice(0, n).map(r => r.stat).filter(Number.isFinite);\n  return vals.length ? round(average(vals), 2) : null;\n}\n`;
if (!s.includes(anchor)) throw new Error('V0.7.10 patch: recentAvg anchor not found');

const helpers = String.raw`
function scalarEntries(obj, prefix = '', depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 2) return [];
  const out = [];
  for (const [k,v] of Object.entries(obj)) {
    const path = prefix ? prefix + '.' + k : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) out.push(...scalarEntries(v, path, depth + 1));
    else if (!Array.isArray(v)) out.push([path,v]);
  }
  return out;
}

function numericValue(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const x = v.trim().replace(/,/g,'');
  if (!/^-?\d+(?:\.\d+)?$/.test(x)) return null;
  const n = Number(x); return Number.isFinite(n) ? n : null;
}

function chooseGameStatField(games, discipline) {
  const rows = Array.isArray(games) ? games.filter(x=>x && typeof x === 'object') : [];
  const byPath = new Map();
  for (const row of rows) {
    for (const [path,v] of scalarEntries(row)) {
      const n = numericValue(v); if (n == null) continue;
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push({n, raw:v});
    }
  }
  const min = discipline === 'cricket' ? 0.5 : 5;
  const max = discipline === 'cricket' ? 9 : 100;
  const wanted = discipline === 'cricket' ? /mpr|marks.?per.?round|cricket.?avg|cricket.?average/i : /ppd|points?.?per.?dart|x?01.?avg|x?01.?average/i;
  const fallback = /avg|average|stat|rating|rate/i;
  const reject = /(^|\.)(id|player.?id|opponent.?id|game.?id|match.?id|score|points?|darts?|dart.?count|count|total|rank|wins?|losses?|timestamp|time|date|year|month|day|page|position|legs?|rounds?)($|\.)/i;
  const candidates = [];
  for (const [path,vals] of byPath.entries()) {
    if (reject.test(path)) continue;
    const inRange = vals.filter(x=>x.n >= min && x.n <= max);
    if (inRange.length < Math.min(3, rows.length)) continue;
    const decimals = inRange.filter(x=>String(x.raw).includes('.') || !Number.isInteger(x.n)).length;
    const unique = new Set(inRange.map(x=>x.n)).size;
    let score = inRange.length * 3 + decimals * 2 + Math.min(unique,10);
    if (wanted.test(path)) score += 200;
    else if (fallback.test(path)) score += 80;
    candidates.push({path,score,count:inRange.length,decimals,unique,preview:inRange.slice(0,5).map(x=>x.n)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return { field: candidates[0]?.path || null, candidates: candidates.slice(0,12) };
}

function valueAtPath(obj, path) {
  if (!obj || !path) return null;
  let cur = obj;
  for (const part of path.split('.')) { if (cur == null) return null; cur = cur[part]; }
  return numericValue(cur);
}

async function fetchBullshooterGames(playerId, discipline, perPage = 50) {
  const gameType = discipline === 'cricket' ? 'cricket' : 'x01';
  const url = 'https://www.bullshooter.live/search/fetch_games.php?player_id=' + encodeURIComponent(playerId) + '&game_type=' + gameType + '&page=1&per_page=' + perPage;
  const res = await fetch(url, { headers: { accept:'application/json,text/plain,*/*', 'user-agent':'Mozilla/5.0 CamarilloDarts/0.7.10' }, signal: AbortSignal.timeout(15000) });
  const payload = await res.json().catch(()=>null);
  if (!res.ok || !payload?.success || !Array.isArray(payload.games)) throw new Error('BullShooter ' + gameType + ' games API failed (' + res.status + ')');
  return { url, games: payload.games, hasNext: Boolean(payload.has_next), page: payload.page, perPage: payload.per_page };
}

function apiWindowAverage(games, field, n, discipline) {
  const min = discipline === 'cricket' ? 0.5 : 5;
  const max = discipline === 'cricket' ? 9 : 100;
  const vals = games.slice(0,n).map(row=>valueAtPath(row,field)).filter(v=>Number.isFinite(v) && v>=min && v<=max);
  return vals.length ? round(average(vals),2) : null;
}

async function directRecentPerformance(playerId) {
  const [x01, cricket] = await Promise.all([
    fetchBullshooterGames(playerId,'01',50),
    fetchBullshooterGames(playerId,'cricket',50)
  ]);
  const xField = chooseGameStatField(x01.games,'01');
  const cField = chooseGameStatField(cricket.games,'cricket');
  const result = {
    last10PPD: xField.field ? apiWindowAverage(x01.games,xField.field,10,'01') : null,
    last20PPD: xField.field ? apiWindowAverage(x01.games,xField.field,20,'01') : null,
    last50PPD: xField.field ? apiWindowAverage(x01.games,xField.field,50,'01') : null,
    last10MPR: cField.field ? apiWindowAverage(cricket.games,cField.field,10,'cricket') : null,
    last20MPR: cField.field ? apiWindowAverage(cricket.games,cField.field,20,'cricket') : null,
    last50MPR: cField.field ? apiWindowAverage(cricket.games,cField.field,50,'cricket') : null,
    diagnostics: {
      x01:{url:x01.url,rowCount:x01.games.length,field:xField.field,candidates:xField.candidates,firstRowKeys:x01.games[0]?scalarEntries(x01.games[0]).map(x=>x[0]).slice(0,40):[]},
      cricket:{url:cricket.url,rowCount:cricket.games.length,field:cField.field,candidates:cField.candidates,firstRowKeys:cricket.games[0]?scalarEntries(cricket.games[0]).map(x=>x[0]).slice(0,40):[]}
    }
  };
  return result;
}

${anchor}`;
s = s.replace(anchor, helpers);

const blockStart = s.indexOf('    const { profile } = await waitForCoreStats(page, id);');
const blockEnd = s.indexOf('    profile.recentCricketCount = cricketGames.length;', blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error('V0.7.10 patch: importer recent block not found');
const newBlock = `    const { profile } = await waitForCoreStats(page, id);\n    const directRecent = await directRecentPerformance(id).catch(error => ({last10PPD:null,last20PPD:null,last50PPD:null,last10MPR:null,last20MPR:null,last50MPR:null,diagnostics:{error:error.message}}));\n    await loadProfilePage(page, url);\n    const cricketGames = await collectRecent(page, 'cricket', 30).catch(() => []);\n    await loadProfilePage(page, url);\n    const games01 = await collectRecent(page, '01', 30).catch(() => []);\n    profile.recentCricketGames = cricketGames;\n    profile.recent01Games = games01;\n    profile.last50MPR = directRecent.last50MPR;\n    profile.last50PPD = directRecent.last50PPD;\n    profile.last20MPR = directRecent.last20MPR;\n    profile.last20PPD = directRecent.last20PPD;\n    profile.last10MPR = directRecent.last10MPR;\n    profile.last10PPD = directRecent.last10PPD;\n    profile.last50SampleSize = directRecent.last50MPR != null || directRecent.last50PPD != null ? 50 : null;\n    profile.last20SampleSize = directRecent.last20MPR != null || directRecent.last20PPD != null ? 20 : null;\n    profile.last10SampleSize = directRecent.last10MPR != null || directRecent.last10PPD != null ? 10 : null;\n    profile.last30MPR = null; profile.last30PPD = null; profile.last30SampleSize = null;\n    profile.recentPerformanceSource = 'bullshooter-fetch-games-api';\n    profile.directGameApiDiagnostics = directRecent.diagnostics;\n`;
s = s.slice(0, blockStart) + newBlock + s.slice(blockEnd);

fs.writeFileSync(bsPath, s);

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replaceAll("version:'0.7.9'", "version:'0.7.10'");
server = server.replaceAll('Camarillo Darts V0.7.9 running', 'Camarillo Darts V0.7.10 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('V0.7.9', 'V0.7.10');
html = html.replaceAll('Camarillo Darts V0.7.9', 'Camarillo Darts V0.7.10');
fs.writeFileSync(indexPath, html);
