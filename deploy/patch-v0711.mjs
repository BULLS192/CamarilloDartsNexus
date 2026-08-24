import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');
server=server.replaceAll("version:'0.7.10'","version:'0.7.11'");
server=server.replaceAll('Camarillo Darts V0.7.10 running','Camarillo Darts V0.7.11 running');
fs.writeFileSync(serverPath,server);

const indexPath=fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html';
let html=fs.readFileSync(indexPath,'utf8');
html=html.replaceAll('V0.7.10','V0.7.11');
html=html.replaceAll('Camarillo Darts V0.7.10','Camarillo Darts V0.7.11');
if(!html.includes('/v0711.css')) html=html.replace('</head>','<link rel="stylesheet" href="/v0711.css"></head>');
if(!html.includes('/v0711.js')) html=html.replace('</body>','<script src="/v0711.js"></script></body>');
fs.writeFileSync(indexPath,html);
