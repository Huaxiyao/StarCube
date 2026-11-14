'use strict';

var Cube = require('cubejs');

var SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
// Check distance by state, not by the length of a solver's equivalent formula.
var TOO_SIMPLE_STATES = new Set([SOLVED]);
['U', 'R', 'F', 'D', 'L', 'B'].forEach(function (face) {
  ['', "'", '2'].forEach(function (suffix) {
    TOO_SIMPLE_STATES.add(new Cube().move(face + suffix).asString());
  });
});

function generateScramble() {
  if (new Cube().asString() !== SOLVED) {
    throw new Error('facelet 基准串校验失败');
  }
  var lastError = '打乱自检失败';
  for (var attempt = 0; attempt < 3; attempt++) {
    var cube = Cube.random();
    var facelets = cube.asString();
    if (typeof facelets !== 'string' || facelets.length !== 54) continue;
    if (TOO_SIMPLE_STATES.has(facelets)) {
      lastError = '打乱状态过于简单';
      continue;
    }

    var solution = null;
    try {
      solution = cube.solve();
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      continue;
    }
    if (!solution) continue;

    var moves = solution.trim().split(/\s+/).filter(Boolean);
    if (moves.length === 0 || moves.length > 22) continue;

    var algorithm = Cube.inverse(solution).replace(/\s+/g, ' ').trim();
    var check = new Cube().move(algorithm);
    if (check.asString() !== facelets) continue;

    return { algorithm: algorithm, facelets: facelets };
  }
  throw new Error(lastError);
}

var api = {
  init: function () { Cube.initSolver(); },
  scramble: generateScramble
};

self.StarCubeSolver = api;

if (typeof self.document === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = function (event) {
    var data = event.data || {};
    if (data.cmd === 'init') {
      try {
        api.init();
        self.postMessage({ cmd: 'ready' });
      } catch (err) {
        self.postMessage({ cmd: 'error', message: err && err.message ? err.message : String(err) });
      }
      return;
    }
    if (data.cmd === 'scramble') {
      try {
        var result = api.scramble();
        self.postMessage({ cmd: 'scramble', requestId: data.requestId, algorithm: result.algorithm, facelets: result.facelets });
      } catch (err) {
        self.postMessage({ cmd: 'error', requestId: data.requestId, message: err && err.message ? err.message : String(err) });
      }
    }
  };
}
