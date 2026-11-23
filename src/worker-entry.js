'use strict';

(function (root) {
  var min2phase = require('min2phase');

  var SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  var FACE_LIST = ['U', 'R', 'F', 'D', 'L', 'B'];
  var MOVE_RE = /^[URFDLB](?:2|')?$/;

  // Kociemba 贴纸索引定义（U:0-8, R:9-17, F:18-26, D:27-35, L:36-44, B:45-53）
  var CORNER_FACELETS = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51]
  ];
  var EDGE_FACELETS = [
    [5, 10],
    [7, 19],
    [3, 37],
    [1, 46],
    [32, 16],
    [28, 25],
    [30, 43],
    [34, 52],
    [23, 12],
    [21, 41],
    [50, 39],
    [48, 14]
  ];

  function createSolvedGrid() {
    var s = {};
    for (var f = 0; f < FACE_LIST.length; f++) {
      var face = FACE_LIST[f];
      s[face] = [
        [face, face, face],
        [face, face, face],
        [face, face, face]
      ];
    }
    return s;
  }

  function rotateFaceCW(grid) {
    return [
      [grid[2][0], grid[1][0], grid[0][0]],
      [grid[2][1], grid[1][1], grid[0][1]],
      [grid[2][2], grid[1][2], grid[0][2]]
    ];
  }

  function rotateLayerCW(state, face) {
    var i, tmp;
    state[face] = rotateFaceCW(state[face]);
    if (face === 'U') {
      for (i = 0; i < 3; i++) {
        tmp = state.F[0][i];
        state.F[0][i] = state.R[0][i];
        state.R[0][i] = state.B[0][i];
        state.B[0][i] = state.L[0][i];
        state.L[0][i] = tmp;
      }
    } else if (face === 'D') {
      for (i = 0; i < 3; i++) {
        tmp = state.F[2][i];
        state.F[2][i] = state.L[2][i];
        state.L[2][i] = state.B[2][i];
        state.B[2][i] = state.R[2][i];
        state.R[2][i] = tmp;
      }
    } else if (face === 'R') {
      for (i = 0; i < 3; i++) {
        tmp = state.F[i][2];
        state.F[i][2] = state.D[i][2];
        state.D[i][2] = state.B[2 - i][0];
        state.B[2 - i][0] = state.U[i][2];
        state.U[i][2] = tmp;
      }
    } else if (face === 'L') {
      for (i = 0; i < 3; i++) {
        tmp = state.F[i][0];
        state.F[i][0] = state.U[i][0];
        state.U[i][0] = state.B[2 - i][2];
        state.B[2 - i][2] = state.D[i][0];
        state.D[i][0] = tmp;
      }
    } else if (face === 'F') {
      for (i = 0; i < 3; i++) {
        tmp = state.U[2][i];
        state.U[2][i] = state.L[2 - i][2];
        state.L[2 - i][2] = state.D[0][2 - i];
        state.D[0][2 - i] = state.R[i][0];
        state.R[i][0] = tmp;
      }
    } else if (face === 'B') {
      for (i = 0; i < 3; i++) {
        tmp = state.U[0][i];
        state.U[0][i] = state.R[i][2];
        state.R[i][2] = state.D[2][2 - i];
        state.D[2][2 - i] = state.L[2 - i][0];
        state.L[2 - i][0] = tmp;
      }
    }
  }

  function apply3x3Algorithm(algorithm) {
    var state = createSolvedGrid();
    var tokens = String(algorithm || '').trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!MOVE_RE.test(token)) return '';
      var face = token.charAt(0);
      var suffix = token.slice(1);
      var turns = suffix === '2' ? 2 : suffix === "'" ? 3 : 1;
      for (var t = 0; t < turns; t++) rotateLayerCW(state, face);
    }
    var out = '';
    for (var f = 0; f < FACE_LIST.length; f++) {
      var g = state[FACE_LIST[f]];
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 3; c++) out += g[r][c];
      }
    }
    return out;
  }

  // 过滤已复原及任意 1 步状态（WCA 4b3：至少需要 2 步复原）
  var TOO_SIMPLE_STATES = new Set([SOLVED]);
  FACE_LIST.forEach(function (face) {
    ['', "'", '2'].forEach(function (suffix) {
      TOO_SIMPLE_STATES.add(apply3x3Algorithm(face + suffix));
    });
  });

  function hashSeed(text) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(max, rng) {
    if (typeof rng === 'function') {
      return Math.floor(rng() * max) % max;
    }
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
      var arr = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / max) * max;
      var value;
      do {
        crypto.getRandomValues(arr);
        value = arr[0];
      } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  }

  function permutationParity(arr) {
    var inv = 0;
    for (var i = 0; i < arr.length; i++) {
      for (var j = i + 1; j < arr.length; j++) {
        if (arr[i] > arr[j]) inv ^= 1;
      }
    }
    return inv;
  }

  function randomFacelets(rng) {
    var cp = [0, 1, 2, 3, 4, 5, 6, 7];
    var ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    var i, j, tmp;
    for (i = 7; i > 0; i--) {
      j = randomInt(i + 1, rng);
      tmp = cp[i]; cp[i] = cp[j]; cp[j] = tmp;
    }
    for (i = 11; i > 0; i--) {
      j = randomInt(i + 1, rng);
      tmp = ep[i]; ep[i] = ep[j]; ep[j] = tmp;
    }
    if (permutationParity(cp) !== permutationParity(ep)) {
      tmp = ep[10]; ep[10] = ep[11]; ep[11] = tmp;
    }

    var co = new Array(8);
    var coSum = 0;
    for (i = 0; i < 7; i++) {
      co[i] = randomInt(3, rng);
      coSum += co[i];
    }
    co[7] = (3 - (coSum % 3)) % 3;

    var eo = new Array(12);
    var eoSum = 0;
    for (i = 0; i < 11; i++) {
      eo[i] = randomInt(2, rng);
      eoSum += eo[i];
    }
    eo[11] = eoSum % 2;

    var f = SOLVED.split('');
    for (var c = 0; c < 8; c++) {
      var cj = cp[c];
      var cori = co[c];
      for (var n = 0; n < 3; n++) {
        f[CORNER_FACELETS[c][(n + cori) % 3]] = FACE_LIST[Math.floor(CORNER_FACELETS[cj][n] / 9)];
      }
    }
    for (var e = 0; e < 12; e++) {
      var ej = ep[e];
      var eori = eo[e];
      for (var k = 0; k < 2; k++) {
        f[EDGE_FACELETS[e][(k + eori) % 2]] = FACE_LIST[Math.floor(EDGE_FACELETS[ej][k] / 9)];
      }
    }
    return f.join('');
  }

  var customRandomFacelets = null;

  function generateScramble(options) {
    if (apply3x3Algorithm('') !== SOLVED) {
      throw new Error('facelet 基准串校验失败');
    }
    var seed = options && options.seed != null && options.seed !== '' ? String(options.seed) : '';
    var rng = seed ? mulberry32(hashSeed(seed)) : null;
    var lastError = '打乱自检失败';

    for (var attempt = 0; attempt < 5; attempt++) {
      var facelets = customRandomFacelets ? customRandomFacelets(rng) : randomFacelets(rng);
      if (typeof facelets !== 'string' || facelets.length !== 54) {
        lastError = '随机状态格式异常';
        continue;
      }
      if (TOO_SIMPLE_STATES.has(facelets)) {
        lastError = '打乱状态过于简单';
        continue;
      }

      var raw = null;
      try {
        raw = new min2phase.Search().solution(facelets, 21, 1e9, 0, min2phase.INVERSE_SOLUTION);
      } catch (err) {
        lastError = err && err.message ? err.message : String(err);
        continue;
      }
      if (typeof raw !== 'string') continue;
      var algorithm = raw.replace(/\s+/g, ' ').trim();
      if (!algorithm || algorithm.indexOf('Error') === 0) {
        lastError = algorithm || '打乱求解失败';
        continue;
      }

      var moves = algorithm.split(' ');
      if (moves.length === 0 || moves.length > 22) continue;
      var validMoves = true;
      for (var m = 0; m < moves.length; m++) {
        if (!MOVE_RE.test(moves[m])) {
          validMoves = false;
          break;
        }
      }
      if (!validMoves) continue;
      if (apply3x3Algorithm(algorithm) !== facelets) {
        lastError = '打乱状态校验失败';
        continue;
      }

      return { algorithm: algorithm, facelets: facelets };
    }
    throw new Error(lastError);
  }

  var api = {
    init: function () { min2phase.initFull(); },
    scramble: generateScramble,
    _setRandomFacelets: function (fn) {
      customRandomFacelets = typeof fn === 'function' ? fn : null;
    }
  };

  root.StarCubeSolver = api;

  if (typeof root.document === 'undefined' && typeof root.postMessage === 'function') {
    root.onmessage = function (event) {
      var data = event.data || {};
      if (data.cmd === 'init') {
        try {
          api.init();
          root.postMessage({ cmd: 'ready' });
        } catch (err) {
          root.postMessage({ cmd: 'error', message: err && err.message ? err.message : String(err) });
        }
        return;
      }
      if (data.cmd === 'scramble') {
        try {
          var result = api.scramble(data.seed ? { seed: data.seed } : undefined);
          root.postMessage({ cmd: 'scramble', requestId: data.requestId, algorithm: result.algorithm, facelets: result.facelets });
        } catch (err) {
          root.postMessage({ cmd: 'error', requestId: data.requestId, message: err && err.message ? err.message : String(err) });
        }
        return;
      }
      if (data.cmd === 'scrambleBatch') {
        try {
          var seeds = Array.isArray(data.seeds) ? data.seeds : [];
          var results = seeds.map(function (seed) {
            return api.scramble({ seed: seed });
          });
          root.postMessage({ cmd: 'scrambleBatch', requestId: data.requestId, results: results });
        } catch (err) {
          root.postMessage({ cmd: 'error', requestId: data.requestId, message: err && err.message ? err.message : String(err) });
        }
      }
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
