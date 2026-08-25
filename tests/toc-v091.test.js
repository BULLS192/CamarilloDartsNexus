import assert from 'node:assert/strict';
import {parsePagerPages} from '../src/dartstoc.js';

const encoded=`<td><a href="javascript:__doPostBack(&#39;ctl00$ContentPlaceHolder1$GridBestKnownOverall&#39;,&#39;Page$2&#39;)">2</a><a href="javascript:__doPostBack(&#39;ctl00$ContentPlaceHolder1$GridBestKnownOverall&#39;,&#39;Page$10&#39;)">10</a><a href="javascript:__doPostBack(&#39;ctl00$ContentPlaceHolder1$GridBestKnownOverall&#39;,&#39;Page$11&#39;)">...</a></td>`;
assert.deepEqual(parsePagerPages(encoded),[2,10,11]);

const literal=`<a href="javascript:__doPostBack('ctl00$ContentPlaceHolder1$GridBestKnownOverall','Page$3')">3</a>`;
assert.deepEqual(parsePagerPages(literal),[3]);
console.log('TOC V0.9.1 encoded pagination regression test passed');
