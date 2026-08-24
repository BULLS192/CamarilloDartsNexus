import fs from 'node:fs';

const serverPath = fs.existsSync('/app/server.js') ? '/app/server.js' : 'server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = server.replaceAll("version:'0.7.4'", "version:'0.7.5'");
server = server.replaceAll('Camarillo Darts V0.7.4 running', 'Camarillo Darts V0.7.5 running');
fs.writeFileSync(serverPath, server);

const indexPath = fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('V0.7.4', 'V0.7.5');
html = html.replaceAll('Camarillo Darts V0.7.4', 'Camarillo Darts V0.7.5');
if (!html.includes('/v075.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/v075.css"></head>');
if (!html.includes('/v075.js')) html = html.replace('</body>', '<script src="/v075.js"></script></body>');
fs.writeFileSync(indexPath, html);
