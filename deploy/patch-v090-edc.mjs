import fs from 'node:fs';

const serverPath=fs.existsSync('/app/server.js')?'/app/server.js':'server.js';
let server=fs.readFileSync(serverPath,'utf8');

const importAnchor="import { importBullshooterProfile } from './src/bullshooter.js';";
if(!server.includes(importAnchor))throw new Error('EDC patch: BullShooter import anchor not found');
if(!server.includes("from './src/edc.js'"))server=server.replace(importAnchor,`${importAnchor}\nimport { edcHealth, searchEdcPlayers, findEdcPlayer, EDC_DEFAULT_PUBLISHED_URL } from './src/edc.js';`);

const syncStart="  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/sync$/);if(m&&req.method==='POST'){";
const startIndex=server.indexOf(syncStart);
if(startIndex<0)throw new Error('EDC patch: player sync route anchor not found');
const syncEnd=server.indexOf('\n',startIndex);
if(syncEnd<0)throw new Error('EDC patch: player sync route line end not found');
const resilientSync=`  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});
    const bs=String(p.bullshooter?.id||'').trim();
    const [bsResult,edcResult]=await Promise.allSettled([
      bs?importBullshooterProfile(bs):Promise.resolve(null),
      findEdcPlayer(p.name||'')
    ]);
    let updated=p;const syncSources={bullshooter:{ok:false},edc:{ok:false}};
    if(bsResult.status==='fulfilled'&&bsResult.value){updated=await attachBullshooterProfile(p.id,bsResult.value);syncSources.bullshooter={ok:true,id:bs};}
    else if(bsResult.status==='rejected')syncSources.bullshooter={ok:false,id:bs||null,error:bsResult.reason?.message||String(bsResult.reason)};
    else if(!bs)syncSources.bullshooter={ok:false,skipped:true,error:'No BullShooter ID.'};
    if(edcResult.status==='fulfilled'&&edcResult.value?.preferred){
      const r=edcResult.value.preferred,capturedAt=new Date().toISOString();
      const edc={name:r.name,ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,capturedAt,parserVersion:'0.9.0-edc.1',selectionRule:edcResult.value.selectionRule};
      updated=await updatePlayer(p.id,{edc});syncSources.edc={ok:true,exactMatch:edcResult.value.exactMatch,name:r.name,sourceRow:r.sourceRow};
    }else if(edcResult.status==='rejected')syncSources.edc={ok:false,error:edcResult.reason?.message||String(edcResult.reason)};
    else syncSources.edc={ok:false,error:'No confident EDC match.'};
    if(!syncSources.bullshooter.ok&&!syncSources.edc.ok)return json(res,502,{error:'No external stats source could be synchronized.',sources:syncSources});
    return json(res,200,{...updated,syncSources});
  }`;
server=server.slice(0,startIndex)+resilientSync+server.slice(syncEnd);

const routeAnchor="  if(url.pathname==='/api/games'&&req.method==='POST')return json(res,201,await recordGame(await body(req)));";
if(!server.includes(routeAnchor))throw new Error('EDC patch: games route anchor not found');
const edcRoutes=`  if(url.pathname==='/api/stats/edc/health'&&req.method==='GET')return json(res,200,await edcHealth({force:url.searchParams.get('force')==='1'}));
  if(url.pathname==='/api/stats/edc/search'&&req.method==='GET'){const q=String(url.searchParams.get('q')||'').trim();if(!q)return json(res,400,{error:'q is required.'});return json(res,200,{query:q,results:await searchEdcPlayers(q,{limit:url.searchParams.get('limit'),force:url.searchParams.get('force')==='1'})})}
  if(url.pathname==='/api/stats/edc/player'&&req.method==='GET'){const name=String(url.searchParams.get('name')||'').trim();if(!name)return json(res,400,{error:'name is required.'});const result=await findEdcPlayer(name,{force:url.searchParams.get('force')==='1'});return result.preferred?json(res,200,result):json(res,404,{error:'No confident EDC player match.',...result})}
  m=matchPath(url,/^\\/api\\/players\\/([^/]+)\\/edc-sync$/);if(m&&req.method==='POST'){
    const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const input=await body(req);const name=String(input.name||p.name||'').trim();if(!name)return json(res,400,{error:'Player name is required for EDC matching.'});
    const result=await findEdcPlayer(name,{force:Boolean(input.force)});if(!result.preferred)return json(res,404,{error:'No confident EDC player match.',...result});
    const r=result.preferred,capturedAt=new Date().toISOString();const edc={name:r.name,ppd:r.ppd,mpr:r.mpr,evpRating:r.evpRating,calculatedEvpRating:r.calculatedEvpRating,games:r.games,preferredStyle:r.preferredStyle,platform:r.platform,updatedText:r.updatedText,sourceRow:r.sourceRow,sourceFormat:r.sourceFormat,ratingDelta:r.ratingDelta,source:'edc-evp-published-sheet',sourceUrl:EDC_DEFAULT_PUBLISHED_URL,capturedAt,parserVersion:'0.9.0-edc.1',selectionRule:result.selectionRule};
    const updated=await updatePlayer(p.id,{edc});return json(res,200,{player:updated,edc,result:{exactMatch:result.exactMatch,candidateCount:result.candidates.length,selectionRule:result.selectionRule}})
  }

${routeAnchor}`;
server=server.replace(routeAnchor,edcRoutes);
fs.writeFileSync(serverPath,server);

const pkgPath=fs.existsSync('/app/package.json')?'/app/package.json':'package.json';
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(pkg.scripts?.check&&!pkg.scripts.check.includes('tests/edc.test.js'))pkg.scripts.check += ' && node --check src/edc.js && node tests/edc.test.js';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
