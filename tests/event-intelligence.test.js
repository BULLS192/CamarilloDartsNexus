import assert from 'node:assert/strict';
import { mergeEvents, normalizeEvent, sourceRecord } from '../src/event-intelligence.js';

const a=normalizeEvent({
  title:' Tuesday Blind Draw ',
  startAt:'2026-09-15T19:30:00-05:00',
  venue:'Example Bar',
  city:'Houston',
  state:'TX',
  entryFee:'10'
});
const b=normalizeEvent({
  title:'Tuesday   Blind Draw',
  startAt:'2026-09-15T20:00:00-05:00',
  venue:'EXAMPLE BAR',
  city:'Houston',
  state:'TX',
  payout:'Added money'
});

assert.equal(a.fingerprint,b.fingerprint,'same event/date/location should deduplicate');
assert.equal(a.entryFee,10);
assert.equal(a.status,'candidate');

const merged=mergeEvents([a],[b]);
assert.equal(merged.events.length,1);
assert.equal(merged.added.length,0);
assert.equal(merged.updated.length,1);
assert.equal(merged.events[0].payout,'Added money');
assert.equal(merged.events[0].firstSeenAt,a.firstSeenAt);

const source=sourceRecord({url:'https://www.facebook.com/groups/example',name:'Example',visibility:'public'});
assert.match(source.id,/^src_/);
assert.equal(source.cadence,'weekly');
assert.equal(source.collectionMode,'public_web');

console.log('event-intelligence.test.js: PASS');
