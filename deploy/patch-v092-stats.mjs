import fs from 'node:fs';

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('/v092-stats.css'))html=html.replace('</head>','<link rel="stylesheet" href="/v092-stats.css"></head>');
if(!html.includes('/v092-stats.js'))html=html.replace('</body>','<script src="/v092-stats.js"></script></body>');
html=html.replaceAll('V0.9.1','V0.9.2').replaceAll('Camarillo Darts Nexus 0.9.1','Camarillo Darts Nexus 0.9.2');
fs.writeFileSync(indexPath,html);

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.9.1'","version:'0.9.2'").replaceAll('Camarillo Darts V0.9.1 running','Camarillo Darts V0.9.2 running');
fs.writeFileSync(serverPath,server);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='0.9.2';
pkg.description='Camarillo Darts Nexus multi-source player intelligence with BullShooter, PPD/TOC and EDC/EVP';
const additions=['node --check public/v092-stats.js','node tests/stats-sources-ui.test.js'];
let check=String(pkg.scripts?.check||'');for(const cmd of additions)if(!check.includes(cmd))check+=(check?' && ':'')+cmd;if(!pkg.scripts)pkg.scripts={};pkg.scripts.check=check;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
