import fs from 'node:fs';

const paths = {
  index: fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html',
  pkg: fs.existsSync('/app/package.json') ? '/app/package.json' : 'package.json',
  marker: fs.existsSync('/app') ? '/app/.v1200-tournament-director-applied' : '.v1200-tournament-director-applied',
};

if (!fs.existsSync(paths.index)) throw new Error('V0.12.0 patch: public/index.html not found after bundle reconstruction.');
let html = fs.readFileSync(paths.index, 'utf8');
if (!html.includes('/tournament-entry.js')) {
  if (!html.includes('</body>')) throw new Error('V0.12.0 patch: </body> anchor not found.');
  html = html.replace('</body>', '<script src="/tournament-entry.js?v=0.12.0"></script></body>');
  fs.writeFileSync(paths.index, html);
}

const pkg = JSON.parse(fs.readFileSync(paths.pkg, 'utf8'));
pkg.version = '0.12.0';
pkg.description = 'Camarillo Darts Nexus with Tournament Director bracket engine';
if (!pkg.scripts) pkg.scripts = {};
const checks = [
  'node --check src/tournament-brackets.js',
  'node --check public/tournament-director.js',
  'node --check public/tournament-entry.js',
  'node tests/tournament-brackets.test.js',
];
for (const cmd of checks) {
  if (!String(pkg.scripts.check || '').includes(cmd)) pkg.scripts.check += (pkg.scripts.check ? ' && ' : '') + cmd;
}
fs.writeFileSync(paths.pkg, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(paths.marker, JSON.stringify({
  version: '0.12.0',
  module: 'NEXUS Tournament Director',
  page: '/tournament.html',
  formats: ['single-elimination', 'double-elimination'],
  maxParticipants: 128,
  grandFinalReset: true,
}) + '\n');
