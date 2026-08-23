import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listPlayers,createPlayer,updatePlayer,getPlayer,attachBullshooterProfile,recordGame,dashboard,
  listCompetitions,createCompetition,updateCompetition,addCompetitionParticipants,generateCompetitionMatches,
  listMatches,updateMatch,listFeats,recordFeat,standings,playerIntelligence,getSettings,updateSettings,exportDatabase,logSyncRun
} from './src/store.js';
import { importBullshooterProfile } from './src/bullshooter.js';
import { calculate01Handicap,cricketSpotMarks } from './src/ratings.js';
import { pushDatabaseToSheets } from './src/sheets.js';

const PORT=process.env.PORT||8787;const ROOT=path.dirname(fileURLToPath(import.meta.url));const PUBLIC=path.join(ROOT,'public');
const ADMIN_USER=process.env.ADMIN_USER||'';const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
function requireAuth(req,res){if(!ADMIN_USER&&!ADMIN_PASSWORD)return true;const h=String(req.headers.authorization||'');if(h.startsWith('Basic ')){try{const [u,p]=Buffer.from(h.slice(6),'base64').toString('utf8').split(':');if(u===ADMIN_USER&&p===ADMIN_PASSWORD)return true}catch{}}res.writeHead(401,{'www-authenticate':'Basic realm="Camarillo Darts"','content-type':'text/plain; charset=utf-8'});res.end('Authentication required');return false;}
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))};
async function body(req){let s='';for await(const c of req)s+=c;return s?JSON.parse(s):{}}
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
function matchPath(url,re){const m=url.pathname.match(re);return m?m.slice(1).map(decodeURIComponent):null}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/health')return json(res,200,{ok:true,version:'0.7.1'});
  if(!requireAuth(req,res))return;
  if(url.pathname==='/api/dashboard'&&req.method==='GET')return json(res,200,await dashboard());
  if(url.pathname==='/api/players'&&req.method==='GET')return json(res,200,await listPlayers());
  if(url.pathname==='/api/players'&&req.method==='POST')return json(res,201,await createPlayer(await body(req)));
  let m=matchPath(url,/^\/api\/players\/([^/]+)$/);if(m&&req.method==='GET'){const p=await getPlayer(m[0]);return p?json(res,200,p):json(res,404,{error:'Player not found.'})}if(m&&req.method==='PATCH')return json(res,200,await updatePlayer(m[0],await body(req)));
  m=matchPath(url,/^\/api\/players\/([^/]+)\/sync$/);if(m&&req.method==='POST'){const p=await getPlayer(m[0]);if(!p)return json(res,404,{error:'Player not found.'});const bs=String(p.bullshooter?.id||'').trim();if(!bs)return json(res,400,{error:'Add a BullShooter ID before syncing.'});const profile=await importBullshooterProfile(bs);return json(res,200,await attachBullshooterProfile(p.id,profile))}
  m=matchPath(url,/^\/api\/players\/([^/]+)\/intelligence$/);if(m&&req.method==='GET')return json(res,200,await playerIntelligence(m[0]));
  if(url.pathname==='/api/players/import'&&req.method==='POST'){const input=await body(req),bs=String(input.bullshooterId||'').trim();if(!bs)return json(res,400,{error:'BullShooter ID is required.'});const profile=await importBullshooterProfile(bs);return json(res,200,await attachBullshooterProfile(input.playerId||null,profile,input))}

  if(url.pathname==='/api/games'&&req.method==='POST')return json(res,201,await recordGame(await body(req)));
  if(url.pathname==='/api/handicap/01'&&req.method==='POST')return json(res,200,calculate01Handicap(await body(req)));
  if(url.pathname==='/api/handicap/cricket'&&req.method==='POST')return json(res,200,cricketSpotMarks(await body(req)));

  if(url.pathname==='/api/competitions'&&req.method==='GET')return json(res,200,await listCompetitions());
  if(url.pathname==='/api/competitions'&&req.method==='POST')return json(res,201,await createCompetition(await body(req)));
  m=matchPath(url,/^\/api\/competitions\/([^/]+)$/);if(m&&req.method==='PATCH')return json(res,200,await updateCompetition(m[0],await body(req)));
  m=matchPath(url,/^\/api\/competitions\/([^/]+)\/participants$/);if(m&&req.method==='POST'){const input=await body(req);return json(res,200,await addCompetitionParticipants(m[0],input.playerIds||[]))}
  m=matchPath(url,/^\/api\/competitions\/([^/]+)\/generate$/);if(m&&req.method==='POST')return json(res,200,await generateCompetitionMatches(m[0]));
  m=matchPath(url,/^\/api\/competitions\/([^/]+)\/standings$/);if(m&&req.method==='GET')return json(res,200,await standings(m[0]));

  if(url.pathname==='/api/matches'&&req.method==='GET')return json(res,200,await listMatches(url.searchParams.get('competitionId')));
  m=matchPath(url,/^\/api\/matches\/([^/]+)$/);if(m&&req.method==='PATCH')return json(res,200,await updateMatch(m[0],await body(req)));
  m=matchPath(url,/^\/api\/matches\/([^/]+)\/bullshooter-sync$/);if(m&&req.method==='POST'){
    const matches=await listMatches(),mt=matches.find(x=>x.id===m[0]);if(!mt)return json(res,404,{error:'Match not found.'});const [a,b]=await Promise.all([getPlayer(mt.playerAId),getPlayer(mt.playerBId)]);if(!a?.bullshooter?.id||!b?.bullshooter?.id)return json(res,400,{error:'Both players need BullShooter IDs.'});
    const [pa,pb]=await Promise.all([importBullshooterProfile(a.bullshooter.id),importBullshooterProfile(b.bullshooter.id)]);await Promise.all([attachBullshooterProfile(a.id,pa),attachBullshooterProfile(b.id,pb)]);
    const candidateA=[...(pa.recent01Games||[]),...(pa.recentCricketGames||[])].filter(g=>String(g.opponentId||'')===String(b.bullshooter.id));
    const candidateB=[...(pb.recent01Games||[]),...(pb.recentCricketGames||[])].filter(g=>String(g.opponentId||'')===String(a.bullshooter.id));
    return json(res,200,{matchId:mt.id,playerA:{id:a.id,name:a.name,bullshooterId:a.bullshooter.id},playerB:{id:b.id,name:b.name,bullshooterId:b.bullshooter.id},candidatesA:candidateA,candidatesB:candidateB,note:'Experimental: review candidates before importing them as sanctioned Camarillo games.'});
  }

  if(url.pathname==='/api/feats'&&req.method==='GET')return json(res,200,await listFeats());
  if(url.pathname==='/api/feats'&&req.method==='POST')return json(res,201,await recordFeat(await body(req)));

  if(url.pathname==='/api/settings'&&req.method==='GET')return json(res,200,await getSettings());
  if(url.pathname==='/api/settings'&&req.method==='PATCH')return json(res,200,await updateSettings(await body(req)));
  if(url.pathname==='/api/export/database'&&req.method==='GET')return json(res,200,await exportDatabase());
  if(url.pathname==='/api/sheets/push'&&req.method==='POST'){const settings=await getSettings(),payload=await exportDatabase();try{const result=await pushDatabaseToSheets(settings.sheetsWebhookUrl,payload);await logSyncRun({type:'google-sheets',status:'success',message:result.message||'Database pushed'});return json(res,200,result)}catch(error){await logSyncRun({type:'google-sheets',status:'error',message:error.message});throw error}}

  let file=url.pathname==='/'?'/index.html':url.pathname;const target=path.normalize(path.join(PUBLIC,file));if(!target.startsWith(PUBLIC))return json(res,403,{error:'Forbidden'});try{const data=await fs.readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream'});res.end(data)}catch{const data=await fs.readFile(path.join(PUBLIC,'index.html'));res.writeHead(200,{'content-type':'text/html'});res.end(data)}
}catch(error){console.error(error);json(res,500,{error:error.message||'Unexpected server error'})}});
server.listen(PORT,()=>console.log(`Camarillo Darts V0.7.1 running at http://localhost:${PORT}`));
