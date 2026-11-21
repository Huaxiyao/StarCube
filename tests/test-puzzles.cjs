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

assert.equal(Puzzles.list.length, 7);
console.log('PASS All 7 WCA puzzle definitions are registered');

// 2x2 / 4x4 / 5x5 color conservation & SVG rect counts
for (const [id, n, minMoves] of [['222', 2, 9], ['444', 4, 40], ['555', 5, 55]]) {
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

// Pyraminx
const py = Puzzles.generateScramble('pyram');
assert.ok(py && py.facelets.startsWith('PYRAM:'));
const pyRaw = py.facelets.slice(6);
assert.equal(pyRaw.length, 36);
const pyCounts = countChars(pyRaw, ['F', 'L', 'R', 'D']);
for (const face of ['F', 'L', 'R', 'D']) assert.equal(pyCounts[face], 9, 'Pyraminx color count ' + face);
const pySvg = Puzzles.buildNetSvg(fakeDocument(), py.facelets, 'pyram');
assert.equal(pySvg.children.length, 36);
console.log('PASS Pyraminx scramble & 36-triangle net preserve exact color counts');

// Skewb
const sk = Puzzles.generateScramble('skewb');
assert.ok(sk && sk.facelets.startsWith('SKEWB:'));
const skRaw = sk.facelets.slice(6);
assert.equal(skRaw.length, 30);
const skCounts = countChars(skRaw, ['U', 'L', 'F', 'R', 'B', 'D']);
for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) assert.equal(skCounts[face], 5, 'Skewb color count ' + face);
const skSvg = Puzzles.buildNetSvg(fakeDocument(), sk.facelets, 'skewb');
assert.equal(skSvg.children.length, 30);
console.log('PASS Skewb scramble & 30-polygon net preserve exact color counts');
