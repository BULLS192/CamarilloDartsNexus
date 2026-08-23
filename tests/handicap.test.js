import assert from 'node:assert/strict';
import { calculate01Handicap, cricketSpotMarks } from '../src/ratings.js';
let x=calculate01Handicap({base:501,strongPPD:30,weakPPD:20,strength:.7,mode:'forward'});assert.equal(x.strongStart,501);assert.equal(x.weakStart,384);
x=calculate01Handicap({base:501,strongPPD:30,weakPPD:20,strength:.7,mode:'reverse-equivalent'});assert.equal(x.strongStart,676);assert.equal(x.weakStart,501);
x=calculate01Handicap({base:501,strongPPD:30,weakPPD:20,strength:.7,mode:'reverse-lite'});assert.equal(x.strongStart,618);assert.equal(x.weakStart,501);
assert.equal(cricketSpotMarks({strongMPR:3.2,weakMPR:2.2,strength:.7}).marks,4);
console.log('Handicap tests passed');
