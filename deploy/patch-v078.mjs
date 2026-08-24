import fs from 'node:fs';

const bsPath = fs.existsSync('/app/src/bullshooter.js') ? '/app/src/bullshooter.js' : 'src/bullshooter.js';
let s = fs.readFileSync(bsPath, 'utf8');
s = s.replace("const PARSER_VERSION = '0.7.7';", "const PARSER_VERSION = '0.7.8';");

const start = s.indexOf('async function recentPerformanceSample(page, sampleSize) {');
const end = s.indexOf('\nfunction recentAvg(', start);
if (start < 0 || end < 0) throw new Error('V0.7.8 patch: recentPerformanceSample block not found');

const replacement = `async function recentPerformanceSample(page, sampleSize) {
  const selects = page.locator('select');
  const count = await selects.count();
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

    const options = await sel.locator('option').evaluateAll(opts => opts.map(o => ({value:o.value,text:(o.textContent||'').trim()}))).catch(() => []);
    const option = options.find(o => Number((o.text.match(/\\d+/)||[])[0]) === sampleSize);
    if (!option) return {mpr:null,ppd:null,sampleSize:null,availableSamples:options.map(o=>o.text),parserNote:'sample-option-not-found'};

    await sel.selectOption(option.value);
    await page.waitForTimeout(1400);

    const probe = await sel.evaluate(el => {
      let target = null;
      let p = el.parentElement;
      for (let depth = 0; p && depth < 10; depth++, p = p.parentElement) {
        const text = (p.textContent || '').trim();
        if (/Recent Performance/i.test(text) && /sample size/i.test(text)) { target = p; break; }
      }
      if (!target) return {nodes:[], raw:''};
      const all = [target, ...target.querySelectorAll('*')];
      const nodes = all.map(n => {
        const ownText = Array.from(n.childNodes || []).filter(x => x.nodeType === Node.TEXT_NODE).map(x => x.textContent || '').join(' ').trim();
        const text = (n.textContent || '').trim();
        const attrs = {};
        for (const a of Array.from(n.attributes || [])) attrs[a.name] = a.value;
        const value = ('value' in n && typeof n.value !== 'undefined') ? String(n.value ?? '') : '';
        return {
          tag: n.tagName || '', ownText, text, value,
          id: n.id || '', cls: typeof n.className === 'string' ? n.className : '',
          ariaValue: n.getAttribute?.('aria-valuenow') || n.getAttribute?.('aria-valuetext') || '',
          ariaLabel: n.getAttribute?.('aria-label') || '',
          title: n.getAttribute?.('title') || '',
          dataValue: n.getAttribute?.('data-value') || n.getAttribute?.('data-stat') || n.getAttribute?.('data-mpr') || n.getAttribute?.('data-ppd') || '',
          attrs
        };
      }).filter(x => x.tag !== 'OPTION' && x.tag !== 'SELECT');
      return {nodes, raw:(target.textContent || '').trim()};
    }).catch(() => ({nodes:[],raw:''}));

    const decimalValues = source => {
      const vals = [];
      const re = /-?\\d+\\.\\d+/g;
      for (const m of String(source || '').matchAll(re)) vals.push(Number(m[0]));
      return vals.filter(Number.isFinite);
    };
    const pick = (kind, min, max) => {
      for (const n of probe.nodes || []) {
        const descriptor = [n.id,n.cls,n.ariaLabel,n.title,Object.keys(n.attrs||{}).join(' '),Object.values(n.attrs||{}).join(' ')].join(' ');
        const tagged = kind === 'mpr' ? /mpr|cricket/i.test(descriptor + ' ' + n.ownText) : /ppd|(?:^|\\W)01(?:\\W|$)|x01/i.test(descriptor + ' ' + n.ownText);
        if (!tagged) continue;
        const payloads = [n.ariaValue,n.dataValue,n.value,n.ownText,n.text];
        for (const payload of payloads) {
          for (const v of decimalValues(payload)) if (v >= min && v <= max) return v;
        }
      }
      const allDecimals = [];
      for (const n of probe.nodes || []) {
        for (const payload of [n.ariaValue,n.dataValue,n.value,n.ownText]) allDecimals.push(...decimalValues(payload));
      }
      const unique = [...new Set(allDecimals)].filter(v => v >= min && v <= max);
      return unique.length === 1 ? unique[0] : null;
    };

    const mpr = pick('mpr', 0.5, 9);
    const ppd = pick('ppd', 5, 100);
    const diagnosticNodes = (probe.nodes || []).filter(n => /mpr|ppd|cricket|(?:^|\\W)01(?:\\W|$)|value/i.test([n.id,n.cls,n.ariaLabel,n.title,Object.keys(n.attrs||{}).join(' '),n.ownText].join(' '))).slice(0,40);
    return {
      mpr: Number.isFinite(mpr) ? mpr : null,
      ppd: Number.isFinite(ppd) ? ppd : null,
      sampleSize,
      parserNote: (Number.isFinite(mpr) || Number.isFinite(ppd)) ? 'structural-dom' : 'metrics-not-found',
      recentPerformanceDom: diagnosticNodes,
      rawRecentPerformanceText: probe.raw
    };
  }
  return {mpr:null,ppd:null,sampleSize:null,parserNote:'recent-performance-selector-not-found'};
}`;

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(bsPath, s);

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replaceAll("version:'0.7.7'", "version:'0.7.8'");
server = server.replaceAll('Camarillo Darts V0.7.7 running', 'Camarillo Darts V0.7.8 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('V0.7.7', 'V0.7.8');
html = html.replaceAll('Camarillo Darts V0.7.7', 'Camarillo Darts V0.7.8');
fs.writeFileSync(indexPath, html);
