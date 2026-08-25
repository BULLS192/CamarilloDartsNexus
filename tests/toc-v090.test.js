import assert from 'node:assert/strict';
import {parseHiddenInputs,parseBestKnownRows,parsePagerPages,normalizeName,tocCombinedRating,scoreCandidate,compareExternalRatings} from '../src/dartstoc.js';

const html=`<!doctype html><html><body>
<form>
<input type="hidden" name="__VIEWSTATE" value="abc&amp;123">
<input name='__EVENTVALIDATION' type='hidden' value='ev1'>
<table id="ContentPlaceHolder1_GridBestKnownOverall">
<tr><th>Player Name</th><th>Sex</th><th>Rating</th><th>PPD</th><th>PPD Source</th><th>MPR</th><th>MPR Source</th><th>Vendor</th><th>Vendor State</th><th>Showdown</th><th>TOC 2026</th></tr>
<tr><td><a href="player.aspx?MPID=899476">LAINE LYZAK</a></td><td>F</td><td>63.162</td><td>28.582</td><td><a href="PPDStats.aspx?MPID=899476">Tournament</a></td><td>3.458</td><td><a href="MPRStats.aspx?MPID=899476">Tournament*</a></td><td>Star City Amusement</td><td>TX</td><td>Yes</td><td>Yes</td></tr>
<tr><td>A J CARLEE</td><td>M</td><td>42.020</td><td>19.690</td><td>1WHA25*</td><td>2.233</td><td>1WHA25*</td><td>Pioneer Vending</td><td>KY</td><td>No</td><td>No</td></tr>
<tr><td colspan="11"><a href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$GridBestKnownOverall','Page$2')">2</a><a href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$GridBestKnownOverall','Page$3')">3</a></td></tr>
</table></form></body></html>`;

const hidden=parseHiddenInputs(html);
assert.equal(hidden.__VIEWSTATE,'abc&123');
assert.equal(hidden.__EVENTVALIDATION,'ev1');

const rows=parseBestKnownRows(html,1);
assert.equal(rows.length,2);
assert.equal(rows[0].tocId,'mpid_899476');
assert.equal(rows[0].mpid,'899476');
assert.equal(rows[0].playerName,'LAINE LYZAK');
assert.equal(rows[0].vendorState,'TX');
assert.equal(rows[0].showdown,true);
assert.equal(rows[0].tocEligible,true);
assert.equal(rows[0].tocSeason,'2026');
assert.equal(rows[0].ratingComputed,63.162);
assert.equal(rows[0].ratingValidationDelta,0);
assert.match(rows[0].ppdSourceUrl,/PPDStats\.aspx\?MPID=899476/);
assert.equal(rows[1].showdown,false);
assert.equal(rows[1].tocEligible,false);

assert.deepEqual(parsePagerPages(html),[2,3]);
assert.equal(normalizeName('José Smith Jr.'),'JOSE SMITH');
assert.equal(tocCombinedRating(28.582,3.458),63.162);

const scored=scoreCandidate({name:'Laine Lyzak',state:'TX',gender:'F'},rows[0]);
assert.equal(scored.score,100);
assert.match(scored.method,/exact-name/);

const comparison=compareExternalRatings({bullshooter:{last50PPD:28.48,last50MPR:3.44}},rows[0]);
assert.equal(comparison.confidence,'high');
assert.equal(comparison.bullshooter.label,'BullShooter Last 50');
assert.ok(comparison.ppdDelta<0.2);

console.log('TOC V0.9 parser/matching tests passed');
