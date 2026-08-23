import assert from 'node:assert/strict';
import { combinedRating, calculate01Handicap, cricketSpotMarks, initialEstablished } from '../src/ratings.js';
assert.equal(initialEstablished(20,20,20),20);
assert.equal(combinedRating(35,4.5),100);
assert.equal(calculate01Handicap({base:501,strongPPD:30,weakPPD:20,strength:.7,mode:'reverse-lite'}).strongStart,618);
assert.equal(cricketSpotMarks({strongMPR:3.2,weakMPR:2.2,strength:.7}).marks,4);
console.log('Platform tests passed');
