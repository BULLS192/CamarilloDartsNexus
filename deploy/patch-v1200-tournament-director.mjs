import fs from 'node:fs';

const MODULE_VERSION = '0.12.0';
const paths = {
  index: fs.existsSync('/app/public/index.html') ? '/app/public/index.html' : 'public/index.html',
  pkg: fs.existsSync('/app/package.json') ? '/app/package.json' : 'package.json',
  marker: fs.existsSync('/app') ? '/app/.v1200-tournament-director-applied' : '.v1200-tournament-director-applied',
};

if (!fs.existsSync(paths.index)) throw new Error('Tournament Director patch: public/index.html not found after bundle reconstruction.');
let html = fs.readFileSync(paths.index, 'utf8');
if (!html.includes('/tournament-entry.js')) {
  if (!html.includes('</body>')) throw new Error('Tournament Director patch: </body> anchor not found.');
  html = html.replace('</body>', `<script src="/tournament-entry.js?v=${MODULE_VERSION}"></script></body>`);
  fs.writeFileSync(paths.index, html);
}

const pkg = JSON.parse(fs.readFileSync(paths.pkg, 'utf8'));
const appVersion = pkg.version;
// Tournament Director is versioned independently. Preserve the established
// global NEXUS package version because existing compatibility tests and other
// modules intentionally use it as the application-baseline contract.
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
  moduleVersion: MODULE_VERSION,
  appVersion,
  module: 'NEXUS Tournament Director',
  page: '/tournament.html',
  formats: ['single-elimination', 'double-elimination'],
  maxParticipants: 128,
  grandFinalReset: true,
}) + '\n');
