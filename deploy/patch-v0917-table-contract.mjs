import fs from 'node:fs';

const paths={
  rating:fs.existsSync('/app/public/v0711.js')?'/app/public/v0711.js':'public/v0711.js',
  bull:fs.existsSync('/app/public/v077.js')?'/app/public/v077.js':'public/v077.js',
  player:fs.existsSync('/app/public/v094-player-intel.js')?'/app/public/v094-player-intel.js':'public/v094-player-intel.js',
  index:fs.existsSync('/app/public/index.html')?'/app/public/index.html':'public/index.html',
  server:fs.existsSync('/app/server.js')?'/app/server.js':'server.js',
  pkg:fs.existsSync('/app/package.json')?'/app/package.json':'package.json'
};
const need=(s,n,label)=>{if(!s.includes(n))throw new Error(`V0.9.17 patch: ${label} anchor not found`)};

// Stop the legacy rating patch from assuming a numeric cell position. It must target the BS / CD RATING header semantically.
let rating=fs.readFileSync(paths.rating,'utf8');
const oldRating="        cells[9].innerHTML=ratingMarkup(ratingsFor(players[idx]));";
need(rating,oldRating,'legacy rating cell write');
rating=rating.replace(oldRating,"        const table=row.closest('table'),hs=[...table.querySelectorAll('thead th')],ratingIdx=hs.findIndex(h=>h.textContent.trim().toUpperCase()==='BS / CD RATING');if(ratingIdx>=0&&cells[ratingIdx])cells[ratingIdx].innerHTML=ratingMarkup(ratingsFor(players[idx]));");
fs.writeFileSync(paths.rating,rating);

// Stop the BullShooter display patch from assuming fixed columns as later versions add/hide columns.
let bull=fs.readFileSync(paths.bull,'utf8');
const oldBull=`        if(cells.length<11) return;\n        cells[4].textContent=\`${'${fmt(b.ppd)} / ${fmt(b.mpr)}'}\`;\n        cells[5].innerHTML=\`${'${fmt(b.last50PPD)} / ${fmt(b.last50MPR)}<span class="sub">BullShooter Last 50</span>'}\`;\n        cells[6].innerHTML=\`${'${fmt(b.last20PPD)} / ${fmt(b.last20MPR)}<span class="sub">BullShooter Last 20</span>'}\`;\n        cells[7].innerHTML=\`${'${fmt(b.last10PPD)} / ${fmt(b.last10MPR)}<span class="sub">BullShooter Last 10</span>'}\`;`;
need(bull,oldBull,'legacy BullShooter positional writes');
const newBull=`        const table=row.closest('table'),hs=[...table.querySelectorAll('thead th')],idx=label=>hs.findIndex(h=>h.textContent.trim().toUpperCase()===label);\n        const cur=idx('BS CURRENT'),i50=idx('BS50'),i20=idx('BS20'),i10=idx('BS10');\n        if(cur>=0&&cells[cur])cells[cur].textContent=\`${'${fmt(b.ppd)} / ${fmt(b.mpr)}'}\`;\n        if(i50>=0&&cells[i50])cells[i50].innerHTML=\`${'${fmt(b.last50PPD)} / ${fmt(b.last50MPR)}<span class="sub">BullShooter Last 50</span>'}\`;\n        if(i20>=0&&cells[i20])cells[i20].innerHTML=\`${'${fmt(b.last20PPD)} / ${fmt(b.last20MPR)}<span class="sub">BullShooter Last 20</span>'}\`;\n        if(i10>=0&&cells[i10])cells[i10].innerHTML=\`${'${fmt(b.last10PPD)} / ${fmt(b.last10MPR)}<span class="sub">BullShooter Last 10</span>'}\`;`;
bull=bull.replace(oldBull,newBull);fs.writeFileSync(paths.bull,bull);

let player=fs.readFileSync(paths.player,'utf8');player=player.replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.16','EXTERNAL PLAYER INTELLIGENCE · V0.9.17').replaceAll('EXTERNAL PLAYER INTELLIGENCE · V0.9.15','EXTERNAL PLAYER INTELLIGENCE · V0.9.17');fs.writeFileSync(paths.player,player);

let html=fs.readFileSync(paths.index,'utf8');html=html.replace(/<script src=["']\/v0916-robustness\.js["']><\/script>/g,'');if(!html.includes('/v0917-table.js'))html=html.replace('</body>','<script src="/v0917-table.js"></script></body>');html=html.replaceAll('V0.9.16','V0.9.17').replaceAll('Camarillo Darts Nexus 0.9.16','Camarillo Darts Nexus 0.9.17');fs.writeFileSync(paths.index,html);

let server=fs.readFileSync(paths.server,'utf8');server=server.replaceAll("version:'0.9.16'","version:'0.9.17'").replaceAll('Camarillo Darts V0.9.16 running','Camarillo Darts V0.9.17 running');fs.writeFileSync(paths.server,server);
const pkg=JSON.parse(fs.readFileSync(paths.pkg,'utf8'));pkg.version='0.9.17';pkg.description='Camarillo Darts Nexus semantic player-table contract and stable robustness rendering';if(!pkg.scripts)pkg.scripts={};const cmd='node tests/table-contract-v0917.test.js';if(!String(pkg.scripts.check||'').includes(cmd))pkg.scripts.check+=(pkg.scripts.check?' && ':'')+cmd;fs.writeFileSync(paths.pkg,JSON.stringify(pkg,null,2)+'\n');
