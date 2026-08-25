import fs from 'node:fs';

const tocPath=fs.existsSync('/app/src/dartstoc.js')?'/app/src/dartstoc.js':'src/dartstoc-v090.js';
let toc=fs.readFileSync(tocPath,'utf8');

toc=toc.replace("const VERSION='0.9.0';","const VERSION='0.9.1';");
const oldPager=`export function parsePagerPages(html=''){\n  const set=new Set();\n  for(const m of String(html).matchAll(/__doPostBack\\([^)]*['\"]Page\\$(\\d+)['\"]/gi)) set.add(Number(m[1]));\n  return [...set].filter(Number.isFinite).sort((a,b)=>a-b);\n}`;
const newPager=`export function parsePagerPages(html=''){\n  const set=new Set();\n  // ASP.NET emits pager hrefs with HTML-encoded quotes (for example &#39;Page$2&#39;).\n  // Decode entities before matching so the crawler sees Page$2, Page$3 ... exactly as the browser does.\n  const decoded=decodeHtml(String(html));\n  for(const m of decoded.matchAll(/__doPostBack\\([^)]*['\"]Page\\$(\\d+)['\"]/gi)) set.add(Number(m[1]));\n  return [...set].filter(Number.isFinite).sort((a,b)=>a-b);\n}`;
if(!toc.includes(oldPager)) throw new Error('V0.9.1 patch: parsePagerPages anchor not found');
toc=toc.replace(oldPager,newPager);
fs.writeFileSync(tocPath,toc);

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.0'","version:'0.9.1'").replaceAll('Camarillo Darts V0.9.0 running','Camarillo Darts V0.9.1 running');
fs.writeFileSync(serverPath,server);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.9.0','V0.9.1').replaceAll('Camarillo Darts Nexus 0.9.0','Camarillo Darts Nexus 0.9.1');
fs.writeFileSync(indexPath,html);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.1';
const cmd='node tests/toc-v091.test.js';
if(!String(pkg.scripts?.check||'').includes(cmd))pkg.scripts.check+=` && ${cmd}`;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
