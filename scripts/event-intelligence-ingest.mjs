import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeEvents, normalizeEvent, sourceRecord } from '../src/event-intelligence.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=path.join(ROOT,'data','event-intelligence');
const SOURCES=path.join(DATA,'sources.json');
const EVENTS=path.join(DATA,'events.json');

async function readJson(file,fallback){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}
}
async function writeJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(value,null,2)+'\n','utf8');
}

const [command,...args]=process.argv.slice(2);

if(command==='add-source'){
  const [url,name='',visibility='unknown',collectionMode='public_web',region='']=args;
  if(!url) throw new Error('Usage: npm run intel:add-source -- <url> [name] [visibility] [collectionMode] [region]');
  const db=await readJson(SOURCES,{version:1,sources:[]});
  const record=sourceRecord({url,name,visibility,collectionMode,region});
  const idx=db.sources.findIndex(x=>x.id===record.id||x.url===record.url);
  if(idx>=0) db.sources[idx]={...db.sources[idx],...record}; else db.sources.push(record);
  db.updatedAt=new Date().toISOString();
  await writeJson(SOURCES,db);
  console.log(JSON.stringify({ok:true,source:record,totalSources:db.sources.length},null,2));
  process.exit(0);
}

if(command==='list-sources'){
  const db=await readJson(SOURCES,{version:1,sources:[]});
  console.log(JSON.stringify(db,null,2));
  process.exit(0);
}

if(command==='ingest-file'){
  const [inputFile]=args;
  if(!inputFile) throw new Error('Usage: npm run intel:ingest -- <json-file>');
  const incomingRaw=JSON.parse(await fs.readFile(path.resolve(inputFile),'utf8'));
  const incoming=Array.isArray(incomingRaw)?incomingRaw:(incomingRaw.events||[]);
  const db=await readJson(EVENTS,{version:1,events:[]});
  const result=mergeEvents(db.events||[],incoming.map(normalizeEvent));
  const next={version:1,updatedAt:new Date().toISOString(),events:result.events};
  await writeJson(EVENTS,next);
  console.log(JSON.stringify({ok:true,added:result.added.length,updated:result.updated.length,totalEvents:result.events.length},null,2));
  process.exit(0);
}

if(command==='list-events'){
  const db=await readJson(EVENTS,{version:1,events:[]});
  console.log(JSON.stringify(db,null,2));
  process.exit(0);
}

console.log(`NEXUS Event Intelligence\n\nCommands:\n  add-source <url> [name] [visibility] [collectionMode] [region]\n  list-sources\n  ingest-file <json-file>\n  list-events\n`);
