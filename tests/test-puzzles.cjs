'use strict';

const assert = require('node:assert/strict');
const Puzzles = require('../src/puzzles.js');

function fakeDocument() {
  return {
    createElementNS(ns, tag) {
      return {
        tagName: tag.toUpperCase(),
        attributes: {},
        children: [],
        setAttribute(k, v) { this.attributes[k] = String(v); },
        appendChild(c) { this.children.push(c); return c; }
      };
    }
  };
}

function countChars(str, chars) {
  const counts = {};
  for (const ch of chars) counts[ch] = 0;
  for (const ch of str) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

function makeSeededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

assert.equal(Puzzles.list.length, 7);
for (const p of Puzzles.list) {
  assert.ok(p.scrambleMode === 'random-state' || p.scrambleMode === 'random-move');
}
console.log('PASS All 7 WCA puzzle definitions are registered with scrambleMode');

// 1. 2x2 WCA 4b3b random-state (>= 4 optimal moves, <= 11, no consecutive same face)
for (let i = 0; i < 20; i++) {
  const res = Puzzles.generateScramble('222');
  const moves = res.algorithm.split(' ');
  assert.ok(moves.length >= 4 && moves.length <= 11, '2x2 move count in [4,11]: ' + res.algorithm);
  for (let m = 1; m < moves.length; m++) {
    assert.notEqual(moves[m][0], moves[m - 1][0], '2x2 no consecutive same face');
  }
  assert.ok(Puzzles.optimalMoves('222', res.algorithm) >= 4, '2x2 WCA 4b3b optimal >= 4');
  assert.equal(res.facelets.length, 24);
  const counts = countChars(res.facelets, ['U', 'R', 'F', 'D', 'L', 'B']);
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) assert.equal(counts[face], 4);
}
const svg2 = Puzzles.buildNetSvg(fakeDocument(), Puzzles.generateScramble('222').facelets, '222');
assert.equal(svg2.children.length, 24);
console.log('PASS 2x2 generates 20 valid WCA 4b3b random-state scrambles (optimal >= 4) and 24-sticker net');

// 2. 4x4 / 5x5 color conservation & SVG rect counts
for (const [id, n, minMoves] of [['444', 4, 40], ['555', 5, 55]]) {
  const res = Puzzles.generateScramble(id);
  assert.ok(res && res.algorithm.split(' ').length >= minMoves, id + ' scramble length');
  assert.equal(res.facelets.length, 6 * n * n, id + ' facelets length');
  const counts = countChars(res.facelets, ['U', 'R', 'F', 'D', 'L', 'B']);
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
    assert.equal(counts[face], n * n, id + ' preserves color count for ' + face);
  }
  const svg = Puzzles.buildNetSvg(fakeDocument(), res.facelets, id);
  assert.equal(svg.children.length, 6 * n * n, id + ' SVG rect count');
  console.log('PASS ' + id + ' scramble & net preserve exact color counts (' + (6 * n * n) + ' stickers)');
}

// 3. Pyraminx WCA 4b3f random-state (>= 6 optimal moves including tips)
for (let i = 0; i < 20; i++) {
  const py = Puzzles.generateScramble('pyram');
  assert.ok(py && py.facelets.startsWith('PYRAM:'));
  const moves = py.algorithm.split(' ');
  const mainMoves = moves.filter(m => /^[ULRB]/.test(m));
  for (let m = 1; m < mainMoves.length; m++) {
    assert.notEqual(mainMoves[m][0], mainMoves[m - 1][0], 'Pyraminx no consecutive same axis');
  }
  assert.ok(Puzzles.optimalMoves('pyram', py.algorithm) >= 6, 'Pyraminx WCA 4b3f optimal >= 6: ' + py.algorithm);
  const pyRaw = py.facelets.slice(6);
  assert.equal(pyRaw.length, 36);
  const pyCounts = countChars(pyRaw, ['F', 'L', 'R', 'D']);
  for (const face of ['F', 'L', 'R', 'D']) assert.equal(pyCounts[face], 9, 'Pyraminx color count ' + face);
}
const pySvg = Puzzles.buildNetSvg(fakeDocument(), Puzzles.generateScramble('pyram').facelets, 'pyram');
assert.equal(pySvg.children.length, 36);
console.log('PASS Pyraminx generates 20 valid WCA 4b3f random-state scrambles (optimal >= 6) and 36-triangle net');

// 4. Skewb WCA 4b3c random-state (>= 7 optimal moves)
for (let i = 0; i < 20; i++) {
  const sk = Puzzles.generateScramble('skewb');
  assert.ok(sk && sk.facelets.startsWith('SKEWB:'));
  const moves = sk.algorithm.split(' ');
  assert.ok(moves.length >= 7 && moves.length <= 11, 'Skewb move count in [7,11]: ' + sk.algorithm);
  for (let m = 1; m < moves.length; m++) {
    assert.notEqual(moves[m][0], moves[m - 1][0], 'Skewb no consecutive same axis');
  }
  assert.ok(Puzzles.optimalMoves('skewb', sk.algorithm) >= 7, 'Skewb WCA 4b3c optimal >= 7: ' + sk.algorithm);
  const skRaw = sk.facelets.slice(6);
  assert.equal(skRaw.length, 30);
  const skCounts = countChars(skRaw, ['U', 'L', 'F', 'R', 'B', 'D']);
  for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) assert.equal(skCounts[face], 5, 'Skewb color count ' + face);
}
const skSvg = Puzzles.buildNetSvg(fakeDocument(), Puzzles.generateScramble('skewb').facelets, 'skewb');
assert.equal(skSvg.children.length, 30);
console.log('PASS Skewb generates 20 valid WCA 4b3c random-state scrambles (optimal >= 7) and 30-polygon net');

// 5. Deterministic seeded generation for 2x2 / Pyraminx / Skewb
for (const id of ['222', 'pyram', 'skewb']) {
  const a = Puzzles.generateScramble(id, makeSeededRng(20261122));
  const b = Puzzles.generateScramble(id, makeSeededRng(20261122));
  assert.equal(a.algorithm, b.algorithm, id + ' deterministic algorithm with same seeded rng');
  assert.equal(a.facelets, b.facelets, id + ' deterministic facelets with same seeded rng');
}
console.log('PASS Seeded random-state generation is deterministic for 2x2, Pyraminx, and Skewb');
