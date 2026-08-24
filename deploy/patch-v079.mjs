import fs from 'node:fs';

const bsPath = fs.existsSync('/app/src/bullshooter.js') ? '/app/src/bullshooter.js' : 'src/bullshooter.js';
let s = fs.readFileSync(bsPath, 'utf8');
s = s.replace("const PARSER_VERSION = '0.7.8';", "const PARSER_VERSION = '0.7.9';");

const start = s.indexOf('async function recentPerformanceSample(page, sampleSize) {');
const end = s.indexOf('\nfunction recentAvg(', start);
if (start < 0 || end < 0) throw new Error('V0.7.9 patch: recentPerformanceSample block not found');

const replacement = String.raw`
function networkStore(page) {
  if (!page.__camarilloNetwork) page.__camarilloNetwork = { records: [], installed: false };
  return page.__camarilloNetwork;
}

function summarizePayload(value, depth = 0) {
  if (depth > 2 || value == null) return null;
  if (Array.isArray(value)) return { type: 'array', length: value.length, first: value.length ? summarizePayload(value[0], depth + 1) : null };
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 30);
    const out = { type: 'object', keys };
    for (const k of keys.slice(0, 8)) {
      const v = value[k];
      if (Array.isArray(v)) out[k] = { type: 'array', length: v.length };
      else if (v && typeof v === 'object') out[k] = { type: 'object', keys: Object.keys(v).slice(0, 12) };
    }
    return out;
  }
  return { type: typeof value };
}

function installNetworkCapture(page) {
  const store = networkStore(page);
  if (store.installed) return store;
  store.installed = true;
  page.on('response', async response => {
    try {
      const request = response.request();
      const rt = request.resourceType();
      if (!['xhr','fetch'].includes(rt)) return;
      const ct = String(response.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('json')) return;
      const payload = await response.json().catch(() => null);
      if (payload == null) return;
      store.records.push({
        at: Date.now(), url: response.url(), status: response.status(), method: request.method(), resourceType: rt,
        payload, summary: summarizePayload(payload)
      });
      if (store.records.length > 120) store.records.splice(0, store.records.length - 120);
    } catch {}
  });
  return store;
}

function metricNumber(value, kind) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return kind === 'mpr' ? (n >= 0.5 && n <= 9 ? n : null) : (n >= 5 && n <= 100 ? n : null);
}

function sampleHint(obj, path, sampleSize, url = '') {
  const urlText = String(url).toLowerCase();
  if (new RegExp('(?:limit|size|sample|count|window|last|games)[^0-9]{0,8}' + sampleSize + '(?:\\D|$)', 'i').test(urlText)) return true;
  if (new RegExp('(?:^|\\D)' + sampleSize + '(?:\\D|$)').test(String(path)) && /recent|sample|window|last|game/i.test(String(path))) return true;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  for (const [k,v] of Object.entries(obj)) {
    if (!/sample|size|limit|count|window|last|games?/i.test(k)) continue;
    if (Number(v) === sampleSize) return true;
    if (String(v).match(new RegExp('(?:^|\\D)' + sampleSize + '(?:\\D|$)'))) return true;
  }
  return false;
}

function findDirectPairs(root, sampleSize, url = '') {
  const hits = [];
  const seen = new WeakSet();
  function walk(node, path = '$', inheritedHint = false, depth = 0) {
    if (depth > 9 || node == null || typeof node !== 'object') return;
    if (seen.has(node)) return; seen.add(node);
    if (Array.isArray(node)) {
      node.slice(0, 200).forEach((v,i) => walk(v, path + '[' + i + ']', inheritedHint, depth + 1));
      return;
    }
    const hint = inheritedHint || sampleHint(node, path, sampleSize, url);
    let mpr = null, ppd = null, mprKey = null, ppdKey = null;
    for (const [k,v] of Object.entries(node)) {
      if (/mpr|marks.?per.?round|cricket.?avg|cricket.?average/i.test(k)) {
        const n = metricNumber(v, 'mpr'); if (n != null) { mpr = n; mprKey = k; }
      }
      if (/ppd|points?.?per.?dart|01.?avg|01.?average|x01.?avg|x01.?average/i.test(k)) {
        const n = metricNumber(v, 'ppd'); if (n != null) { ppd = n; ppdKey = k; }
      }
    }
    if ((mpr != null || ppd != null) && hint) hits.push({ path, mpr, ppd, mprKey, ppdKey, hinted: true });
    for (const [k,v] of Object.entries(node)) walk(v, path + '.' + k, hint || /recent|performance|sample|window/i.test(k), depth + 1);
  }
  walk(root);
  return hits;
}

function collectGameArrays(root) {
  const arrays = [];
  const seen = new WeakSet();
  function walk(node, path = '$', depth = 0) {
    if (depth > 8 || node == null || typeof node !== 'object') return;
    if (seen.has(node)) return; seen.add(node);
    if (Array.isArray(node)) {
      const rows = node.filter(x => x && typeof x === 'object' && !Array.isArray(x));
      if (rows.length >= 3) {
        const mprs = [], ppds = [];
        for (const row of rows) {
          for (const [k,v] of Object.entries(row)) {
            if (/mpr|marks.?per.?round|cricket.?avg/i.test(k)) { const n = metricNumber(v,'mpr'); if (n != null) mprs.push(n); }
            if (/ppd|points?.?per.?dart|01.?avg|x01.?avg/i.test(k)) { const n = metricNumber(v,'ppd'); if (n != null) ppds.push(n); }
          }
        }
        if (mprs.length >= 3 || ppds.length >= 3) arrays.push({ path, rowCount: rows.length, mprs, ppds });
      }
      node.slice(0, 100).forEach((v,i)=>walk(v,path+'['+i+']',depth+1));
      return;
    }
    for (const [k,v] of Object.entries(node)) walk(v,path+'.'+k,depth+1);
  }
  walk(root);
  return arrays;
}

function avgWindow(values, n) {
  const vals = values.slice(0, n).filter(Number.isFinite);
  if (!vals.length) return null;
  return round(average(vals), 2);
}

function metricsFromNetwork(records, sampleSize) {
  const direct = [];
  const gameArrays = [];
  for (const rec of records) {
    for (const hit of findDirectPairs(rec.payload, sampleSize, rec.url)) direct.push({ ...hit, url: rec.url });
    for (const arr of collectGameArrays(rec.payload)) gameArrays.push({ ...arr, url: rec.url });
  }
  const both = direct.find(x => x.mpr != null && x.ppd != null);
  if (both) return { mpr: both.mpr, ppd: both.ppd, source: 'network-direct', evidence: both, direct, gameArrays };
  const mprHit = direct.find(x => x.mpr != null);
  const ppdHit = direct.find(x => x.ppd != null);
  if (mprHit || ppdHit) return { mpr: mprHit?.mpr ?? null, ppd: ppdHit?.ppd ?? null, source: 'network-direct-split', evidence: {mpr:mprHit,ppd:ppdHit}, direct, gameArrays };

  const bestMpr = gameArrays.filter(x => x.mprs.length >= Math.min(sampleSize,10)).sort((a,b)=>b.mprs.length-a.mprs.length)[0];
  const bestPpd = gameArrays.filter(x => x.ppds.length >= Math.min(sampleSize,10)).sort((a,b)=>b.ppds.length-a.ppds.length)[0];
  const mpr = bestMpr ? avgWindow(bestMpr.mprs, sampleSize) : null;
  const ppd = bestPpd ? avgWindow(bestPpd.ppds, sampleSize) : null;
  return { mpr, ppd, source: (mpr != null || ppd != null) ? 'network-game-array' : 'network-not-found', evidence: {mprArray:bestMpr,ppdArray:bestPpd}, direct, gameArrays };
}

async function recentPerformanceSample(page, sampleSize) {
  const store = installNetworkCapture(page);
  const before = store.records.length;
  const selects = page.locator('select');
  const count = await selects.count();
  let foundSelector = false;
  let availableSamples = [];
  for (let i = 0; i < count; i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;
    const found = await sel.evaluate(el => {
      let p = el.parentElement;
      for (let depth = 0; p && depth < 10; depth++, p = p.parentElement) {
        const text = (p.textContent || '').trim();
        if (/Recent Performance/i.test(text) && /sample size/i.test(text)) return true;
      }
      return false;
    }).catch(() => false);
    if (!found) continue;
    foundSelector = true;
    const options = await sel.locator('option').evaluateAll(opts => opts.map(o => ({value:o.value,text:(o.textContent||'').trim()}))).catch(() => []);
    availableSamples = options.map(o=>o.text);
    const option = options.find(o => Number((o.text.match(/\d+/)||[])[0]) === sampleSize);
    if (!option) break;
    await sel.selectOption(option.value).catch(() => {});
    await page.waitForTimeout(1800);
    break;
  }

  const delta = store.records.slice(before);
  const all = store.records.slice();
  let result = metricsFromNetwork(delta, sampleSize);
  if (result.mpr == null && result.ppd == null) result = metricsFromNetwork(all, sampleSize);
  const diagRecords = (delta.length ? delta : all).slice(-25).map(r => ({ url:r.url, status:r.status, method:r.method, resourceType:r.resourceType, summary:r.summary }));
  const conciseDirect = (result.direct || []).slice(0,12).map(x=>({url:x.url,path:x.path,mpr:x.mpr,ppd:x.ppd,mprKey:x.mprKey,ppdKey:x.ppdKey}));
  const conciseArrays = (result.gameArrays || []).slice(0,12).map(x=>({url:x.url,path:x.path,rowCount:x.rowCount,mprCount:x.mprs.length,ppdCount:x.ppds.length}));
  return {
    mpr: Number.isFinite(result.mpr) ? result.mpr : null,
    ppd: Number.isFinite(result.ppd) ? result.ppd : null,
    sampleSize: foundSelector ? sampleSize : null,
    parserNote: result.source,
    availableSamples,
    networkDiagnostics: { responseCount: all.length, deltaCount: delta.length, records: diagRecords, directCandidates: conciseDirect, gameArrays: conciseArrays }
  };
}`;

s = s.slice(0, start) + replacement + s.slice(end);

const pageAnchor = "    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });";
if (!s.includes(pageAnchor)) throw new Error('V0.7.9 patch: browser page anchor not found');
s = s.replace(pageAnchor, pageAnchor + "\n    installNetworkCapture(page);");

fs.writeFileSync(bsPath, s);

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replaceAll("version:'0.7.8'", "version:'0.7.9'");
server = server.replaceAll('Camarillo Darts V0.7.8 running', 'Camarillo Darts V0.7.9 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('V0.7.8', 'V0.7.9');
html = html.replaceAll('Camarillo Darts V0.7.8', 'Camarillo Darts V0.7.9');
fs.writeFileSync(indexPath, html);
