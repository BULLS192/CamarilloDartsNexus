import crypto from 'node:crypto';

function clean(value=''){
  return String(value ?? '').replace(/\s+/g,' ').trim();
}

function slug(value=''){
  return clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}

export function normalizeEvent(input={}){
  const title=clean(input.title || input.name || 'Untitled dart event');
  const venue=clean(input.venue || input.locationName || '');
  const city=clean(input.city || '');
  const state=clean(input.state || input.region || '');
  const startAt=clean(input.startAt || input.dateTime || input.date || '');
  const sourceUrl=clean(input.sourceUrl || input.url || '');
  const sourceId=clean(input.sourceId || '');
  const sourceName=clean(input.sourceName || '');
  const rawText=clean(input.rawText || input.text || input.description || '');
  const gameType=clean(input.gameType || input.format || '');
  const frequency=clean(input.frequency || 'one-off').toLowerCase();
  const entryFee=input.entryFee === '' || input.entryFee == null ? null : Number(input.entryFee);
  const canonical=[slug(title),slug(venue),slug(city),slug(state),startAt.slice(0,10)].join('|');
  const fingerprint=crypto.createHash('sha256').update(canonical).digest('hex').slice(0,24);
  return {
    id: clean(input.id) || `evt_${fingerprint}`,
    fingerprint,
    title,
    gameType,
    frequency,
    startAt,
    venue,
    address: clean(input.address || ''),
    city,
    state,
    country: clean(input.country || 'USA'),
    entryFee: Number.isFinite(entryFee) ? entryFee : null,
    payout: clean(input.payout || ''),
    organizer: clean(input.organizer || ''),
    contact: clean(input.contact || ''),
    sourceId,
    sourceName,
    sourceType: clean(input.sourceType || 'facebook_group'),
    sourceUrl,
    sourcePostUrl: clean(input.sourcePostUrl || sourceUrl),
    rawText,
    status: clean(input.status || 'candidate').toLowerCase(),
    confidence: Math.max(0,Math.min(1,Number(input.confidence ?? 0.5))),
    firstSeenAt: clean(input.firstSeenAt || new Date().toISOString()),
    lastSeenAt: clean(input.lastSeenAt || new Date().toISOString()),
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(clean).filter(Boolean))] : []
  };
}

export function mergeEvents(existing=[], incoming=[]){
  const byFingerprint=new Map(existing.map(event=>[event.fingerprint || normalizeEvent(event).fingerprint,event]));
  const added=[]; const updated=[];
  for(const raw of incoming){
    const event=normalizeEvent(raw);
    const prior=byFingerprint.get(event.fingerprint);
    if(!prior){byFingerprint.set(event.fingerprint,event);added.push(event);continue;}
    const merged={...prior,...Object.fromEntries(Object.entries(event).filter(([,v])=>v!==''&&v!==null)),id:prior.id||event.id,firstSeenAt:prior.firstSeenAt||event.firstSeenAt,lastSeenAt:event.lastSeenAt};
    byFingerprint.set(event.fingerprint,merged);updated.push(merged);
  }
  return {events:[...byFingerprint.values()],added,updated};
}

export function sourceRecord(input={}){
  const url=clean(input.url || input.sourceUrl || '');
  if(!url) throw new Error('Source URL is required.');
  const sourceId=clean(input.id) || `src_${crypto.createHash('sha1').update(url).digest('hex').slice(0,12)}`;
  return {
    id: sourceId,
    name: clean(input.name || url),
    platform: clean(input.platform || 'facebook'),
    sourceType: clean(input.sourceType || 'facebook_group'),
    url,
    visibility: clean(input.visibility || 'unknown').toLowerCase(),
    collectionMode: clean(input.collectionMode || 'public_web').toLowerCase(),
    cadence: clean(input.cadence || 'weekly').toLowerCase(),
    active: input.active !== false,
    region: clean(input.region || ''),
    organizationScope: Array.isArray(input.organizationScope) ? input.organizationScope.map(clean).filter(Boolean) : [],
    notes: clean(input.notes || ''),
    lastCheckedAt: clean(input.lastCheckedAt || ''),
    lastSuccessAt: clean(input.lastSuccessAt || ''),
    lastError: clean(input.lastError || '')
  };
}
