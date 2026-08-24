import fs from 'node:fs';

const bsPath = fs.existsSync('/app/src/bullshooter.js') ? '/app/src/bullshooter.js' : 'src/bullshooter.js';
let s = fs.readFileSync(bsPath, 'utf8');

if (!s.includes("const PARSER_VERSION = '0.7.10';")) throw new Error('V0.7.12 patch: parser version anchor not found');
s = s.replace("const PARSER_VERSION = '0.7.10';", "const PARSER_VERSION = '0.7.12';");

const gamesAnchor = "async function fetchBullshooterGames(playerId, discipline, perPage = 50) {";
if (!s.includes(gamesAnchor)) throw new Error('V0.7.12 patch: fetchBullshooterGames anchor not found');

const playerHelper = String.raw`
async function fetchBullshooterPlayer(playerId) {
  const url = 'https://www.bullshooter.live/search/fetch_player.php?player_id=' + encodeURIComponent(playerId);
  const res = await fetch(url, {
    headers: { accept:'application/json,text/plain,*/*', 'user-agent':'Mozilla/5.0 CamarilloDarts/0.7.12' },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) throw new Error('BullShooter player API failed (' + res.status + ')');

  const rawPPD = numericValue(payload.ppd_15);
  const rawMPR = numericValue(payload.mpr_15);
  const x01Count = numericValue(payload.total_x01_15);
  const cricketCount = numericValue(payload.total_crk_15);
  const winsRaw = numericValue(payload.wins_15 ?? payload.wins);
  const lossesRaw = numericValue(payload.losses_15 ?? payload.losses);

  const ppd = Number.isFinite(rawPPD) && rawPPD >= 5 && rawPPD <= 100 && (!Number.isFinite(x01Count) || x01Count > 0)
    ? round(rawPPD, 2) : null;
  const mpr = Number.isFinite(rawMPR) && rawMPR >= 0.5 && rawMPR <= 9 && (!Number.isFinite(cricketCount) || cricketCount > 0)
    ? round(rawMPR, 2) : null;

  return {
    id: String(playerId),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null,
    ppd,
    mpr,
    wins: Number.isFinite(winsRaw) ? winsRaw : null,
    losses: Number.isFinite(lossesRaw) ? lossesRaw : null,
    diagnostics: {
      url,
      source: 'fetch_player.php',
      ppdField: 'ppd_15',
      mprField: 'mpr_15',
      rawPPD: rawPPD ?? null,
      rawMPR: rawMPR ?? null,
      x01Count: x01Count ?? null,
      cricketCount: cricketCount ?? null,
      keys: Object.keys(payload).slice(0, 50)
    }
  };
}

`;
s = s.replace(gamesAnchor, playerHelper + gamesAnchor);

const directStart = s.indexOf('async function directRecentPerformance(playerId) {');
const directEnd = s.indexOf('\n\nfunction recentAvg(', directStart);
if (directStart < 0 || directEnd < 0) throw new Error('V0.7.12 patch: directRecentPerformance block not found');

const newDirect = String.raw`async function directRecentPerformance(playerId) {
  const [xResult, cricketResult] = await Promise.allSettled([
    fetchBullshooterGames(playerId, '01', 50),
    fetchBullshooterGames(playerId, 'cricket', 50)
  ]);

  const x01 = xResult.status === 'fulfilled'
    ? xResult.value
    : { url:null, games:[], error: xResult.reason?.message || String(xResult.reason || 'x01 unavailable') };
  const cricket = cricketResult.status === 'fulfilled'
    ? cricketResult.value
    : { url:null, games:[], error: cricketResult.reason?.message || String(cricketResult.reason || 'cricket unavailable') };

  const xField = chooseGameStatField(x01.games, '01');
  const cField = chooseGameStatField(cricket.games, 'cricket');

  return {
    last10PPD: xField.field ? apiWindowAverage(x01.games, xField.field, 10, '01') : null,
    last20PPD: xField.field ? apiWindowAverage(x01.games, xField.field, 20, '01') : null,
    last50PPD: xField.field ? apiWindowAverage(x01.games, xField.field, 50, '01') : null,
    last10MPR: cField.field ? apiWindowAverage(cricket.games, cField.field, 10, 'cricket') : null,
    last20MPR: cField.field ? apiWindowAverage(cricket.games, cField.field, 20, 'cricket') : null,
    last50MPR: cField.field ? apiWindowAverage(cricket.games, cField.field, 50, 'cricket') : null,
    ppdSampleCount: x01.games.length,
    mprSampleCount: cricket.games.length,
    diagnostics: {
      x01: {
        url:x01.url,
        rowCount:x01.games.length,
        error:x01.error || null,
        field:xField.field,
        candidates:xField.candidates,
        firstRowKeys:x01.games[0] ? scalarEntries(x01.games[0]).map(x=>x[0]).slice(0,40) : []
      },
      cricket: {
        url:cricket.url,
        rowCount:cricket.games.length,
        error:cricket.error || null,
        field:cField.field,
        candidates:cField.candidates,
        firstRowKeys:cricket.games[0] ? scalarEntries(cricket.games[0]).map(x=>x[0]).slice(0,40) : []
      }
    }
  };
}`;
s = s.slice(0, directStart) + newDirect + s.slice(directEnd);

const coreAnchor = '    const { profile } = await waitForCoreStats(page, id);';
if (!s.includes(coreAnchor)) throw new Error('V0.7.12 patch: current profile anchor not found');
const coreReplacement = String.raw`    const pageText = await page.locator('body').innerText().catch(() => '');
    const pageProfile = parseProfileText(pageText, id);
    const structuredCurrent = await fetchBullshooterPlayer(id).catch(error => ({
      id:String(id), name:null, ppd:null, mpr:null, wins:null, losses:null,
      diagnostics:{source:'fetch_player.php', error:error.message}
    }));
    const profile = {
      ...pageProfile,
      name: structuredCurrent.name || pageProfile.name,
      ppd: structuredCurrent.ppd,
      mpr: structuredCurrent.mpr,
      wins: Number.isFinite(structuredCurrent.wins) ? structuredCurrent.wins : pageProfile.wins,
      losses: Number.isFinite(structuredCurrent.losses) ? structuredCurrent.losses : pageProfile.losses,
      currentStatsSource: 'bullshooter-fetch-player-api',
      currentStatsDiagnostics: structuredCurrent.diagnostics
    };`;
s = s.replace(coreAnchor, coreReplacement);

const sampleAnchor = "    profile.recentPerformanceSource = 'bullshooter-fetch-games-api';";
if (!s.includes(sampleAnchor)) throw new Error('V0.7.12 patch: recent source anchor not found');
s = s.replace(sampleAnchor, String.raw`    profile.last50PPDSampleSize = Math.min(50, directRecent.ppdSampleCount || 0) || null;
    profile.last20PPDSampleSize = Math.min(20, directRecent.ppdSampleCount || 0) || null;
    profile.last10PPDSampleSize = Math.min(10, directRecent.ppdSampleCount || 0) || null;
    profile.last50MPRSampleSize = Math.min(50, directRecent.mprSampleCount || 0) || null;
    profile.last20MPRSampleSize = Math.min(20, directRecent.mprSampleCount || 0) || null;
    profile.last10MPRSampleSize = Math.min(10, directRecent.mprSampleCount || 0) || null;
    profile.recentPerformanceSource = 'bullshooter-fetch-games-api';`);

fs.writeFileSync(bsPath, s);

const ratingsPath = fs.existsSync('/app/src/ratings.js') ? '/app/src/ratings.js' : 'src/ratings.js';
let ratings = fs.readFileSync(ratingsPath, 'utf8');
const oldCombined = "  if(pn===null&&mn===null)return null;\n  if(pn===null)return round(mn,1); if(mn===null)return round(pn,1);\n  return round((pn+mn)/2,1);";
const newCombined = "  if(pn===null||mn===null)return null;\n  return round((pn+mn)/2,1);";
if (ratings.includes(oldCombined)) ratings = ratings.replace(oldCombined, newCombined);
fs.writeFileSync(ratingsPath, ratings);

const ratingUiPath = fs.existsSync('/app/public/v0711.js') ? '/app/public/v0711.js' : 'public/v0711.js';
let ratingUi = fs.readFileSync(ratingUiPath, 'utf8');
const oldUiCombined = "    if(pn===null&&mn===null)return null;\n    if(pn===null)return Math.round(mn*10)/10;\n    if(mn===null)return Math.round(pn*10)/10;\n    return Math.round(((pn+mn)/2)*10)/10;";
const newUiCombined = "    if(pn===null||mn===null)return null;\n    return Math.round(((pn+mn)/2)*10)/10;";
if (!ratingUi.includes(oldUiCombined)) throw new Error('V0.7.12 patch: rating UI combined anchor not found');
ratingUi = ratingUi.replace(oldUiCombined, newUiCombined);
fs.writeFileSync(ratingUiPath, ratingUi);

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replaceAll("version:'0.7.11'", "version:'0.7.12'");
server = server.replaceAll('Camarillo Darts V0.7.11 running', 'Camarillo Darts V0.7.12 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('V0.7.11', 'V0.7.12');
html = html.replaceAll('Camarillo Darts V0.7.11', 'Camarillo Darts V0.7.12');
fs.writeFileSync(indexPath, html);
