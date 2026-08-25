import assert from 'node:assert/strict';
import { parseEdcPublishedHtml, parseEdcPublishedCsv, pickPreferredEdcRecord, normalizeEdcName } from '../src/edc.js';
import { computeDisciplineRatings, externalDisciplineStats } from '../src/ratings.js';
const html=`<!doctype html><html><head><style>.preferred{font-weight:700}</style></head><body><table>
<tr><th>Player</th><th>MPR</th><th>PPD</th><th>EVP Rating</th><th>Games</th></tr>
<tr><td>Alex Smith</td><td>2.50</td><td>20.00</td><td>45.00</td><td>120</td></tr>
<tr><td class="preferred">Alex Smith</td><td class="preferred">2.60</td><td class="preferred">20.50</td><td class="preferred">46.50</td><td class="preferred">40</td></tr>
<tr><td class="preferred">Alex Smith</td><td class="preferred">2.70</td><td class="preferred">21.00</td><td class="preferred">48.00</td><td class="preferred">80</td></tr>
<tr><td>Jamie Doe</td><td>2.00</td><td>18.00</td><td>38.00</td><td>20</td></tr>
<tr><td>Jamie Doe</td><td>2.10</td><td>18.50</td><td>39.50</td><td>60</td></tr>
</table></body></html>`;
const parsed=parseEdcPublishedHtml(html);assert.equal(parsed.records.length,5);assert.equal(parsed.headerIndex,1);
const alex=parsed.records.filter(r=>r.normalizedName===normalizeEdcName('Alex Smith'));assert.equal(pickPreferredEdcRecord(alex).games,80);assert.equal(pickPreferredEdcRecord(alex).evpRating,48);
const jamie=parsed.records.filter(r=>r.normalizedName===normalizeEdcName('Jamie Doe'));assert.equal(pickPreferredEdcRecord(jamie).games,60);assert.equal(jamie[0].calculatedEvpRating,38);
const csv=`Player,MPR,PPD,Rating,Games\nTaylor Roe,2.4,19.5,43.5,75\n`;const csvParsed=parseEdcPublishedCsv(csv);assert.equal(csvParsed.records.length,1);assert.equal(csvParsed.records[0].evpRating,43.5);assert.equal(csvParsed.records[0].games,75);
const edcOnly={edc:{ppd:22.5,mpr:2.8},camarillo:{}};const edcExternal=externalDisciplineStats(edcOnly);assert.equal(edcExternal.establishedPPD,22.5);assert.equal(edcExternal.establishedMPR,2.8);assert.equal(edcExternal.ppdSource,'edc');assert.equal(edcExternal.mprSource,'edc');const edcRating=computeDisciplineRatings(edcOnly);assert.equal(edcRating.handicapPPD,22.5);assert.equal(edcRating.handicapMPR,2.8);
const both={bullshooter:{ppd:24,last50PPD:25,last20PPD:26,last10PPD:27,mpr:3,last50MPR:3.1,last20MPR:3.2,last10MPR:3.3},edc:{ppd:22,mpr:2.8},camarillo:{}};const bothExternal=externalDisciplineStats(both);assert.equal(bothExternal.ppdSource,'bullshooter');assert.equal(bothExternal.mprSource,'bullshooter');assert.ok(Number.isFinite(bothExternal.ppdSourceSpread));assert.ok(Number.isFinite(bothExternal.mprSourceSpread));
console.log('EDC adapter tests passed');
