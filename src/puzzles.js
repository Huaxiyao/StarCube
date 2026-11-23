(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var PUZZLES = [
    { id: '333', name: '3×3', fullName: '3×3 三阶', usesWorker: true, scrambleMode: 'random-state', netType: 'nxn', size: 3 },
    { id: '222', name: '2×2', fullName: '2×2 二阶', usesWorker: false, scrambleMode: 'random-state', netType: 'nxn', size: 2 },
    { id: '444', name: '4×4', fullName: '4×4 四阶', usesWorker: false, scrambleMode: 'random-move', netType: 'nxn', size: 4 },
    { id: '555', name: '5×5', fullName: '5×5 五阶', usesWorker: false, scrambleMode: 'random-move', netType: 'nxn', size: 5 },
    { id: '333oh', name: '3×3 单手', fullName: '3×3 单手', usesWorker: true, scrambleMode: 'random-state', netType: 'nxn', size: 3 },
    { id: 'pyram', name: '金字塔', fullName: '金字塔 Pyraminx', usesWorker: false, scrambleMode: 'random-state', netType: 'pyram', size: 3 },
    { id: 'skewb', name: '斜转', fullName: '斜转 Skewb', usesWorker: false, scrambleMode: 'random-state', netType: 'skewb', size: 3 }
  ];

  var PUZZLE_MAP = Object.create(null);
  PUZZLES.forEach(function (p) { PUZZLE_MAP[p.id] = p; });

  var COLORS = {
    U: '#ffffff',
    R: '#dc2626',
    F: '#16a34a',
    D: '#facc15',
    L: '#f97316',
    B: '#2563eb'
  };

  var FACE_LIST = ['U', 'R', 'F', 'D', 'L', 'B'];
  var NET_POS = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

  function normalizePuzzle(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PUZZLE_MAP, id) ? id : '333';
  }

  function getPuzzle(id) {
    return PUZZLE_MAP[normalizePuzzle(id)];
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

  /* ======================== N×N 正阶魔方状态机 ======================== */
  function createNxN(n) {
    var state = {};
    FACE_LIST.forEach(function (f) {
      var grid = [];
      for (var r = 0; r < n; r++) {
        var row = [];
        for (var c = 0; c < n; c++) row.push(f);
        grid.push(row);
      }
      state[f] = grid;
    });
    return state;
  }

  function rotateFaceCW(grid) {
    var n = grid.length;
    var next = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(grid[n - 1 - c][r]);
      next.push(row);
    }
    return next;
  }

  function rotateNxNLayerCW(state, n, face, layer) {
    var i, tmp;
    if (layer === 0) state[face] = rotateFaceCW(state[face]);
    if (face === 'U') {
      for (i = 0; i < n; i++) {
        tmp = state.F[layer][i];
        state.F[layer][i] = state.R[layer][i];
        state.R[layer][i] = state.B[layer][i];
        state.B[layer][i] = state.L[layer][i];
        state.L[layer][i] = tmp;
      }
    } else if (face === 'D') {
      var r = n - 1 - layer;
      for (i = 0; i < n; i++) {
        tmp = state.F[r][i];
        state.F[r][i] = state.L[r][i];
        state.L[r][i] = state.B[r][i];
        state.B[r][i] = state.R[r][i];
        state.R[r][i] = tmp;
      }
    } else if (face === 'R') {
      var c = n - 1 - layer;
      var bc = layer;
      for (i = 0; i < n; i++) {
        tmp = state.F[i][c];
        state.F[i][c] = state.D[i][c];
        state.D[i][c] = state.B[n - 1 - i][bc];
        state.B[n - 1 - i][bc] = state.U[i][c];
        state.U[i][c] = tmp;
      }
    } else if (face === 'L') {
      var lc = layer;
      var lbc = n - 1 - layer;
      for (i = 0; i < n; i++) {
        tmp = state.F[i][lc];
        state.F[i][lc] = state.U[i][lc];
        state.U[i][lc] = state.B[n - 1 - i][lbc];
        state.B[n - 1 - i][lbc] = state.D[i][lc];
        state.D[i][lc] = tmp;
      }
    } else if (face === 'F') {
      var ur = n - 1 - layer;
      var dr = layer;
      var rc = layer;
      var lcol = n - 1 - layer;
      for (i = 0; i < n; i++) {
        tmp = state.U[ur][i];
        state.U[ur][i] = state.L[n - 1 - i][lcol];
        state.L[n - 1 - i][lcol] = state.D[dr][n - 1 - i];
        state.D[dr][n - 1 - i] = state.R[i][rc];
        state.R[i][rc] = tmp;
      }
    } else if (face === 'B') {
      var bur = layer;
      var bdr = n - 1 - layer;
      var brc = n - 1 - layer;
      var blc = layer;
      for (i = 0; i < n; i++) {
        tmp = state.U[bur][i];
        state.U[bur][i] = state.R[i][brc];
        state.R[i][brc] = state.D[bdr][n - 1 - i];
        state.D[bdr][n - 1 - i] = state.L[n - 1 - i][blc];
        state.L[n - 1 - i][blc] = tmp;
      }
    }
  }

  function applyNxNMove(state, n, token) {
    var m = /^([URFDLB])(w)?([2'])?$/.exec(token);
    if (!m) return;
    var face = m[1];
    var wide = !!m[2];
    var mod = m[3] || '';
    var turns = mod === '2' ? 2 : mod === "'" ? 3 : 1;
    var depth = wide ? 2 : 1;
    for (var t = 0; t < turns; t++) {
      for (var d = 0; d < depth; d++) rotateNxNLayerCW(state, n, face, d);
    }
  }

  function nxnToFacelets(state, n) {
    var out = '';
    FACE_LIST.forEach(function (f) {
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) out += state[f][r][c];
      }
    });
    return out;
  }

  /* ======================== 2×2 WCA Random-State（≥ 4 步） ======================== */
  var C2_CORNERS = [
    ['U', 1, 1, 'R', 0, 0, 'F', 0, 1],
    ['U', 1, 0, 'F', 0, 0, 'L', 0, 1],
    ['U', 0, 0, 'L', 0, 0, 'B', 0, 1],
    ['U', 0, 1, 'B', 0, 0, 'R', 0, 1],
    ['D', 0, 1, 'F', 1, 1, 'R', 1, 0],
    ['D', 0, 0, 'L', 1, 1, 'F', 1, 0],
    ['D', 1, 1, 'R', 1, 1, 'B', 1, 0]
  ];
  var C2_MOVES = ['R', 'R2', "R'", 'U', 'U2', "U'", 'F', 'F2', "F'"];
  var C2_INV = [2, 1, 0, 5, 4, 3, 8, 7, 6];
  var c2Tables = null;

  function cloneNxN(state) {
    var out = {};
    for (var i = 0; i < FACE_LIST.length; i++) {
      var f = FACE_LIST[i];
      out[f] = state[f].map(function (row) { return row.slice(); });
    }
    return out;
  }

  function encodePerm(arr, n) {
    var idx = 0;
    for (var i = 0; i < n - 1; i++) {
      var cnt = 0;
      for (var j = i + 1; j < n; j++) {
        if (arr[j] < arr[i]) cnt++;
      }
      idx = idx * (n - i) + cnt;
    }
    return idx;
  }

  function decodePerm(idx, n, out) {
    var pool = [];
    var facts = [1];
    var i;
    for (i = 0; i < n; i++) {
      pool.push(i);
      if (i > 0) facts.push(facts[i - 1] * i);
    }
    for (i = 0; i < n - 1; i++) {
      var f = facts[n - 1 - i];
      var q = Math.floor(idx / f);
      idx %= f;
      out[i] = pool.splice(q, 1)[0];
    }
    out[n - 1] = pool[0];
  }

  function encodeEvenPerm(arr, n) {
    var idx = 0;
    for (var i = 0; i < n - 2; i++) {
      var cnt = 0;
      for (var j = i + 1; j < n; j++) {
        if (arr[j] < arr[i]) cnt++;
      }
      idx = idx * (n - i) + cnt;
    }
    return idx;
  }

  function encodeOriMod3(arr, n) {
    var idx = 0;
    for (var i = 0; i < n - 1; i++) idx = idx * 3 + arr[i];
    return idx;
  }

  function decodeOriMod3(idx, n, out) {
    var sum = 0;
    for (var i = n - 2; i >= 0; i--) {
      out[i] = idx % 3;
      sum += out[i];
      idx = Math.floor(idx / 3);
    }
    out[n - 1] = (3 - (sum % 3)) % 3;
  }

  function runBFS1D(size, moveTable, moveCount) {
    var dist = new Uint8Array(size);
    for (var k = 0; k < size; k++) dist[k] = 255;
    dist[0] = 0;
    var q = new Uint16Array(size);
    var head = 0, tail = 1;
    while (head < tail) {
      var cur = q[head++];
      var d = dist[cur];
      for (var m = 0; m < moveCount; m++) {
        var nx = moveTable[cur * moveCount + m];
        if (dist[nx] === 255) {
          dist[nx] = d + 1;
          q[tail++] = nx;
        }
      }
    }
    return dist;
  }

  function init2x2Solver() {
    if (c2Tables) return c2Tables;
    var cornerHome = Object.create(null);
    var baseGrid = createNxN(2);
    var i, c;
    for (i = 0; i < 7; i++) {
      c = C2_CORNERS[i];
      baseGrid[c[0]][c[1]][c[2]] = i + ':0';
      baseGrid[c[3]][c[4]][c[5]] = i + ':1';
      baseGrid[c[6]][c[7]][c[8]] = i + ':2';
      cornerHome[i + ':0'] = [i, 0];
      cornerHome[i + ':1'] = [i, 1];
      cornerHome[i + ':2'] = [i, 2];
    }
    var singlePerm = [];
    var singleOri = [];
    for (var m = 0; m < 9; m++) {
      var g = cloneNxN(baseGrid);
      applyNxNMove(g, 2, C2_MOVES[m]);
      var p = [], o = [];
      for (i = 0; i < 7; i++) {
        c = C2_CORNERS[i];
        var h = cornerHome[g[c[0]][c[1]][c[2]]];
        p.push(h[0]);
        o.push(h[1]);
      }
      singlePerm.push(p);
      singleOri.push(o);
    }
    var movePerm = new Uint16Array(5040 * 9);
    var moveOri = new Uint16Array(729 * 9);
    var arr = new Array(7);
    var nxt = new Array(7);
    for (var perm = 0; perm < 5040; perm++) {
      decodePerm(perm, 7, arr);
      for (m = 0; m < 9; m++) {
        var sp = singlePerm[m];
        for (i = 0; i < 7; i++) nxt[i] = arr[sp[i]];
        movePerm[perm * 9 + m] = encodePerm(nxt, 7);
      }
    }
    for (var ori = 0; ori < 729; ori++) {
      decodeOriMod3(ori, 7, arr);
      for (m = 0; m < 9; m++) {
        var sp2 = singlePerm[m], so2 = singleOri[m];
        for (i = 0; i < 7; i++) nxt[i] = (arr[sp2[i]] + so2[i]) % 3;
        moveOri[ori * 9 + m] = encodeOriMod3(nxt, 7);
      }
    }
    c2Tables = {
      movePerm: movePerm,
      moveOri: moveOri,
      prunPerm: runBFS1D(5040, movePerm, 9),
      prunOri: runBFS1D(729, moveOri, 9),
      singlePerm: singlePerm,
      singleOri: singleOri,
      cornerHome: cornerHome,
      baseGrid: baseGrid
    };
    return c2Tables;
  }

  function solve2x2Coords(p, o) {
    var t = init2x2Solver();
    var path = [];
    function search(cp, co, depth, lastFace) {
      if (cp === 0 && co === 0) return true;
      if (Math.max(t.prunPerm[cp], t.prunOri[co]) > depth) return false;
      for (var m = 0; m < 9; m++) {
        var face = Math.floor(m / 3);
        if (face === lastFace) continue;
        if (search(t.movePerm[cp * 9 + m], t.moveOri[co * 9 + m], depth - 1, face)) {
          path.push(m);
          return true;
        }
      }
      return false;
    }
    var startD = Math.max(t.prunPerm[p], t.prunOri[o]);
    for (var d = startD; d <= 11; d++) {
      path.length = 0;
      if (search(p, o, d, -1)) {
        return {
          depth: d,
          algorithm: path.map(function (m) { return C2_MOVES[C2_INV[m]]; }).join(' ')
        };
      }
    }
    return null;
  }

  function generate2x2RandomState(rng) {
    init2x2Solver();
    for (var attempt = 0; attempt < 256; attempt++) {
      var p = randomInt(5040, rng);
      var o = randomInt(729, rng);
      var solved = solve2x2Coords(p, o);
      if (!solved || solved.depth < 4) continue;
      var state = createNxN(2);
      solved.algorithm.split(' ').forEach(function (mv) { applyNxNMove(state, 2, mv); });
      return {
        algorithm: solved.algorithm,
        facelets: nxnToFacelets(state, 2),
        puzzle: '222',
        optimalMoves: solved.depth
      };
    }
    throw new Error('2×2 随机状态生成失败');
  }

  var SOLVED_555_SIMPLE = null;
  function get555SimpleStates() {
    if (SOLVED_555_SIMPLE) return SOLVED_555_SIMPLE;
    var set = new Set([nxnToFacelets(createNxN(5), 5)]);
    var faces = ['U', 'D', 'R', 'L', 'F', 'B', 'Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw'];
    var mods = ['', "'", '2'];
    for (var i = 0; i < faces.length; i++) {
      for (var j = 0; j < mods.length; j++) {
        var s = createNxN(5);
        applyNxNMove(s, 5, faces[i] + mods[j]);
        set.add(nxnToFacelets(s, 5));
      }
    }
    SOLVED_555_SIMPLE = set;
    return set;
  }

  function generateNxNScramble(size, rng, puzzleIdOverride) {
    if (size === 2) return generate2x2RandomState(rng);
    var mods = ['', "'", '2'];
    if (size === 3) {
      var moves3 = [];
      var axes3 = [['U', 'D'], ['R', 'L'], ['F', 'B']];
      var lastAxis3 = -1;
      var used3 = {};
      for (var m3 = 0; m3 < 20; m3++) {
        var ax3, face3, tries3 = 0;
        do {
          ax3 = randomInt(3, rng);
          face3 = axes3[ax3][randomInt(2, rng)];
          tries3++;
        } while (tries3 < 20 && ax3 === lastAxis3 && (used3[face3] || Object.keys(used3).length >= 2));
        if (ax3 !== lastAxis3) {
          lastAxis3 = ax3;
          used3 = {};
        }
        used3[face3] = true;
        moves3.push(face3 + mods[randomInt(3, rng)]);
      }
      var state3 = createNxN(3);
      moves3.forEach(function (mv) { applyNxNMove(state3, 3, mv); });
      return {
        algorithm: moves3.join(' '),
        facelets: nxnToFacelets(state3, 3),
        puzzle: puzzleIdOverride || '333'
      };
    }

    // 4x4 (44 moves) / 5x5 (60 moves, WCA 4b3e) 符合 WCA 轴向防冗余规则
    var len = size === 4 ? 44 : 60;
    var axes = [
      size === 4 ? ['U', 'D', 'Uw'] : ['U', 'D', 'Uw', 'Dw'],
      size === 4 ? ['R', 'L', 'Rw'] : ['R', 'L', 'Rw', 'Lw'],
      size === 4 ? ['F', 'B', 'Fw'] : ['F', 'B', 'Fw', 'Bw']
    ];
    var simple555 = size === 5 ? get555SimpleStates() : null;
    for (var attempt = 0; attempt < 5; attempt++) {
      var moves = [];
      var lastAxis = -1;
      var usedInAxis = {};
      for (var k = 0; k < len; k++) {
        var axis, pool, moveBase;
        var tries = 0;
        do {
          axis = randomInt(3, rng);
          pool = axes[axis];
          moveBase = pool[randomInt(pool.length, rng)];
          tries++;
        } while (
          tries < 30 &&
          ((axis === lastAxis && usedInAxis[moveBase]) || (axis === lastAxis && Object.keys(usedInAxis).length >= 2))
        );
        if (axis !== lastAxis) {
          lastAxis = axis;
          usedInAxis = {};
        }
        usedInAxis[moveBase] = true;
        moves.push(moveBase + mods[randomInt(3, rng)]);
      }
      var state = createNxN(size);
      moves.forEach(function (mv) { applyNxNMove(state, size, mv); });
      var facelets = nxnToFacelets(state, size);
      if (simple555 && simple555.has(facelets)) continue;
      return {
        algorithm: moves.join(' '),
        facelets: facelets,
        puzzle: puzzleIdOverride || (size === 4 ? '444' : '555')
      };
    }
    throw new Error('NxN 打乱生成失败');
  }

  /* ======================== 金字塔 Pyraminx 状态机与 Random-State（≥ 6 步） ======================== */
  // 4 面（F=绿, L=橙, R=红, D=黄），每面 9 个三角块（0 顶角，1-3 中层，4-8 底层）
  function createPyraminx() {
    return {
      F: ['F','F','F','F','F','F','F','F','F'],
      L: ['L','L','L','L','L','L','L','L','L'],
      R: ['R','R','R','R','R','R','R','R','R'],
      D: ['D','D','D','D','D','D','D','D','D']
    };
  }

  function createUniquePyraminx() {
    return {
      F: ['F0','F1','F2','F3','F4','F5','F6','F7','F8'],
      L: ['L0','L1','L2','L3','L4','L5','L6','L7','L8'],
      R: ['R0','R1','R2','R3','R4','R5','R6','R7','R8'],
      D: ['D0','D1','D2','D3','D4','D5','D6','D7','D8']
    };
  }

  function clonePyraminx(s) {
    return { F: s.F.slice(), L: s.L.slice(), R: s.R.slice(), D: s.D.slice() };
  }

  function cycle3(a, ia, b, ib, c, ic) {
    var t = a[ia];
    a[ia] = b[ib];
    b[ib] = c[ic];
    c[ic] = t;
  }

  function rotatePyramTipCW(s, tip) {
    if (tip === 'u') cycle3(s.F, 0, s.R, 0, s.L, 0);
    else if (tip === 'l') cycle3(s.F, 4, s.L, 8, s.D, 4);
    else if (tip === 'r') cycle3(s.F, 8, s.D, 8, s.R, 4);
    else if (tip === 'b') cycle3(s.L, 4, s.R, 8, s.D, 0);
  }

  function rotatePyramLayerCW(s, face) {
    rotatePyramTipCW(s, face.toLowerCase());
    if (face === 'U') {
      cycle3(s.F, 1, s.R, 1, s.L, 1);
      cycle3(s.F, 2, s.R, 2, s.L, 2);
      cycle3(s.F, 3, s.R, 3, s.L, 3);
    } else if (face === 'L') {
      cycle3(s.F, 1, s.L, 6, s.D, 6);
      cycle3(s.F, 5, s.L, 7, s.D, 5);
      cycle3(s.F, 6, s.L, 3, s.D, 1);
    } else if (face === 'R') {
      cycle3(s.F, 3, s.D, 6, s.R, 6);
      cycle3(s.F, 6, s.D, 3, s.R, 1);
      cycle3(s.F, 7, s.D, 7, s.R, 5);
    } else if (face === 'B') {
      cycle3(s.L, 1, s.R, 6, s.D, 1);
      cycle3(s.L, 5, s.R, 7, s.D, 2);
      cycle3(s.L, 6, s.R, 3, s.D, 3);
    }
  }

  function applyPyramMove(s, token) {
    var prime = token.endsWith("'");
    var base = prime ? token.slice(0, -1) : token;
    var turns = prime ? 2 : 1;
    for (var t = 0; t < turns; t++) {
      if (base === base.toLowerCase()) rotatePyramTipCW(s, base);
      else rotatePyramLayerCW(s, base);
    }
  }

  var PY_FACES = ['U', 'L', 'R', 'B'];
  var PY_TIPS = ['u', 'l', 'r', 'b'];
  var PY_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];
  var PY_INV = [1, 0, 3, 2, 5, 4, 7, 6];
  var PY_EDGES = [
    ['F', 1, 'L', 3], ['F', 3, 'R', 1], ['L', 1, 'R', 3],
    ['F', 6, 'D', 6], ['L', 6, 'D', 1], ['R', 6, 'D', 3]
  ];
  var PY_CENTERS = [
    ['F', 2, 'R', 2, 'L', 2], ['F', 5, 'L', 7, 'D', 5],
    ['F', 7, 'D', 7, 'R', 5], ['L', 5, 'R', 7, 'D', 2]
  ];
  var PY_TIP_CHECKS = [
    ['F', 0, 'F', 2], ['F', 4, 'F', 5],
    ['F', 8, 'F', 7], ['L', 4, 'L', 5]
  ];
  var pyTables = null;

  function initPyraminxSolver() {
    if (pyTables) return pyTables;
    var edgeHome = Object.create(null);
    var i, e;
    for (i = 0; i < 6; i++) {
      e = PY_EDGES[i];
      edgeHome[e[0] + e[1]] = [i, 0];
      edgeHome[e[2] + e[3]] = [i, 1];
    }
    function encodeEdges(s) {
      var ep = [], eo = [];
      for (var k = 0; k < 6; k++) {
        var edge = PY_EDGES[k];
        var h = edgeHome[s[edge[0]][edge[1]]];
        ep.push(h[0]);
        eo.push(h[1]);
      }
      var p = encodeEvenPerm(ep, 6);
      var o = 0;
      for (var j = 0; j < 5; j++) o = (o << 1) | eo[j];
      return p * 32 + o;
    }
    function encodeCenters(s) {
      var idx = 0;
      for (var k = 0; k < 4; k++) {
        var c = PY_CENTERS[k];
        var st = s[c[0]][c[1]];
        idx = idx * 3 + (st === c[0] + c[1] ? 0 : st === c[2] + c[3] ? 1 : 2);
      }
      return idx;
    }
    var edgeMove = new Uint16Array(11520 * 8);
    var edgePrun = new Uint8Array(11520);
    for (i = 0; i < 11520; i++) edgePrun[i] = 255;
    var root = createUniquePyraminx();
    edgePrun[encodeEdges(root)] = 0;
    var q = [root];
    var head = 0;
    var fIdx, t, k, nxt, m, nc;
    while (head < q.length) {
      var cur = q[head++];
      var code = encodeEdges(cur);
      var d = edgePrun[code];
      m = 0;
      for (fIdx = 0; fIdx < 4; fIdx++) {
        for (t = 1; t <= 2; t++) {
          nxt = clonePyraminx(cur);
          for (k = 0; k < t; k++) rotatePyramLayerCW(nxt, PY_FACES[fIdx]);
          nc = encodeEdges(nxt);
          edgeMove[code * 8 + m++] = nc;
          if (edgePrun[nc] === 255) {
            edgePrun[nc] = d + 1;
            q.push(nxt);
          }
        }
      }
    }
    var ctrMove = new Uint8Array(81 * 8);
    var ctrPrun = new Uint8Array(81);
    for (var c = 0; c < 81; c++) {
      var s = createUniquePyraminx();
      var tmp = c;
      var nonZero = 0;
      var dirs = [0, 0, 0, 0];
      for (i = 3; i >= 0; i--) {
        dirs[i] = tmp % 3;
        if (dirs[i]) nonZero++;
        tmp = Math.floor(tmp / 3);
      }
      ctrPrun[c] = nonZero;
      for (i = 0; i < 4; i++) {
        for (k = 0; k < dirs[i]; k++) rotatePyramLayerCW(s, PY_FACES[i]);
      }
      m = 0;
      for (fIdx = 0; fIdx < 4; fIdx++) {
        for (t = 1; t <= 2; t++) {
          nxt = clonePyraminx(s);
          for (k = 0; k < t; k++) rotatePyramLayerCW(nxt, PY_FACES[fIdx]);
          ctrMove[c * 8 + m++] = encodeCenters(nxt);
        }
      }
    }
    pyTables = {
      edgeMove: edgeMove,
      edgePrun: edgePrun,
      ctrMove: ctrMove,
      ctrPrun: ctrPrun,
      encodeEdges: encodeEdges,
      encodeCenters: encodeCenters
    };
    return pyTables;
  }

  function solvePyraminxMain(eTarget, cTarget) {
    var t = initPyraminxSolver();
    var path = [];
    function search(e, c, depth, lastAxis) {
      if (e === 0 && c === 0) return true;
      if (Math.max(t.edgePrun[e], t.ctrPrun[c]) > depth) return false;
      for (var m = 0; m < 8; m++) {
        var ax = m >> 1;
        if (ax === lastAxis) continue;
        if (search(t.edgeMove[e * 8 + m], t.ctrMove[c * 8 + m], depth - 1, ax)) {
          path.push(m);
          return true;
        }
      }
      return false;
    }
    var startD = Math.max(t.edgePrun[eTarget], t.ctrPrun[cTarget]);
    for (var d = startD; d <= 11; d++) {
      path.length = 0;
      if (search(eTarget, cTarget, d, -1)) {
        return {
          depth: d,
          moves: path.map(function (m) { return PY_MOVES[PY_INV[m]]; })
        };
      }
    }
    return null;
  }

  function generatePyraminxScramble(rng) {
    initPyraminxSolver();
    for (var attempt = 0; attempt < 256; attempt++) {
      var e = randomInt(11520, rng);
      var c = randomInt(81, rng);
      var tipRel = [randomInt(3, rng), randomInt(3, rng), randomInt(3, rng), randomInt(3, rng)];
      var tipCount = (tipRel[0] ? 1 : 0) + (tipRel[1] ? 1 : 0) + (tipRel[2] ? 1 : 0) + (tipRel[3] ? 1 : 0);
      var main = solvePyraminxMain(e, c);
      if (!main || main.depth + tipCount < 6) continue;
      // 先执行主体层转动（大层连带小角同向旋转，相对偏差保持 0），再追加小角相对偏差，避免互相抵消减少步数
      var moves = main.moves.slice();
      for (var j = 0; j < 4; j++) {
        if (tipRel[j] === 1) moves.push(PY_TIPS[j]);
        else if (tipRel[j] === 2) moves.push(PY_TIPS[j] + "'");
      }
      var state = createPyraminx();
      moves.forEach(function (mv) { applyPyramMove(state, mv); });
      return {
        algorithm: moves.join(' '),
        facelets: 'PYRAM:' + state.F.join('') + state.L.join('') + state.R.join('') + state.D.join(''),
        puzzle: 'pyram',
        optimalMoves: main.depth + tipCount
      };
    }
    throw new Error('金字塔随机状态生成失败');
  }

  /* ======================== 斜转 Skewb 状态机与 Random-State（≥ 7 步） ======================== */
  // 6 面（U,L,F,R,B,D），每面 5 贴片：0=中心菱形，1=左上角，2=右上角，3=右下角，4=左下角
  function createSkewb() {
    return {
      U: ['U','U','U','U','U'],
      L: ['L','L','L','L','L'],
      F: ['F','F','F','F','F'],
      R: ['R','R','R','R','R'],
      B: ['B','B','B','B','B'],
      D: ['D','D','D','D','D']
    };
  }

  function createUniqueSkewb() {
    return {
      U: ['U0','U1','U2','U3','U4'],
      L: ['L0','L1','L2','L3','L4'],
      F: ['F0','F1','F2','F3','F4'],
      R: ['R0','R1','R2','R3','R4'],
      B: ['B0','B1','B2','B3','B4'],
      D: ['D0','D1','D2','D3','D4']
    };
  }

  function cloneSkewb(s) {
    return { U: s.U.slice(), L: s.L.slice(), F: s.F.slice(), R: s.R.slice(), B: s.B.slice(), D: s.D.slice() };
  }

  function rotateSkewbCW(s, axis) {
    if (axis === 'U') {
      cycle3(s.B, 0, s.L, 0, s.U, 0);
      cycle3(s.B, 2, s.L, 1, s.U, 1);
      cycle3(s.B, 3, s.L, 2, s.U, 2);
      cycle3(s.B, 1, s.L, 4, s.U, 4);
      cycle3(s.R, 2, s.D, 4, s.F, 1);
    } else if (axis === 'R') {
      cycle3(s.F, 3, s.L, 4, s.U, 2);
      cycle3(s.D, 0, s.B, 0, s.R, 0);
      cycle3(s.D, 2, s.B, 3, s.R, 2);
      cycle3(s.D, 3, s.B, 4, s.R, 3);
      cycle3(s.D, 4, s.B, 1, s.R, 4);
    } else if (axis === 'L') {
      cycle3(s.B, 3, s.R, 4, s.U, 4);
      cycle3(s.D, 0, s.F, 0, s.L, 0);
      cycle3(s.D, 4, s.F, 3, s.L, 2);
      cycle3(s.D, 1, s.F, 4, s.L, 3);
      cycle3(s.D, 2, s.F, 1, s.L, 4);
    } else if (axis === 'B') {
      cycle3(s.R, 3, s.F, 4, s.U, 1);
      cycle3(s.B, 0, s.D, 0, s.L, 0);
      cycle3(s.B, 4, s.D, 1, s.L, 1);
      cycle3(s.B, 2, s.D, 3, s.L, 3);
      cycle3(s.B, 3, s.D, 4, s.L, 4);
    }
  }

  function applySkewbMove(s, token) {
    var prime = token.endsWith("'");
    var base = prime ? token.slice(0, -1) : token;
    var turns = prime ? 2 : 1;
    for (var t = 0; t < turns; t++) rotateSkewbCW(s, base);
  }

  var SK_AXES = ['U', 'L', 'R', 'B'];
  var SK_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];
  var SK_INV = [1, 0, 3, 2, 5, 4, 7, 6];
  var SK_CORNERS = [
    ['U', 3, 'F', 2, 'R', 1], ['U', 1, 'B', 2, 'L', 1],
    ['D', 3, 'B', 4, 'R', 3], ['D', 1, 'F', 4, 'L', 3],
    ['U', 4, 'L', 2, 'F', 1], ['U', 2, 'R', 2, 'B', 1],
    ['D', 2, 'R', 4, 'F', 3], ['D', 4, 'L', 4, 'B', 3]
  ];
  var SK_CENTER_FACES = ['U', 'L', 'F', 'R', 'B', 'D'];
  var skTables = null;

  function initSkewbSolver() {
    if (skTables) return skTables;
    var skCornerHome = Object.create(null);
    var skCenterOrder = Object.create(null);
    var i, c;
    for (i = 0; i < 8; i++) {
      c = SK_CORNERS[i];
      skCornerHome[c[0] + c[1]] = [i, 0];
      skCornerHome[c[2] + c[3]] = [i, 1];
      skCornerHome[c[4] + c[5]] = [i, 2];
    }
    for (i = 0; i < 6; i++) skCenterOrder[SK_CENTER_FACES[i] + '0'] = i;

    function encodeA(s) {
      var ctr = [];
      for (var k = 0; k < 6; k++) ctr.push(skCenterOrder[s[SK_CENTER_FACES[k]][0]]);
      var ctrIdx = encodeEvenPerm(ctr, 6);
      var h1 = skCornerHome[s.U[1]], h2 = skCornerHome[s.D[3]], h3 = skCornerHome[s.D[1]];
      var famA = (h1[0] - 1) * 27 + h1[1] * 9 + h2[1] * 3 + h3[1];
      return ctrIdx * 81 + famA;
    }
    function encodeB(s) {
      var h4 = skCornerHome[s.U[4]], h5 = skCornerHome[s.U[2]], h6 = skCornerHome[s.D[2]], h7 = skCornerHome[s.D[4]];
      var pIdx = encodeEvenPerm([h4[0] - 4, h5[0] - 4, h6[0] - 4, h7[0] - 4], 4);
      return pIdx * 81 + (h4[1] * 27 + h5[1] * 9 + h6[1] * 3 + h7[1]);
    }

    var moveA = new Uint16Array(29160 * 8);
    var prunA = new Uint8Array(29160);
    for (i = 0; i < 29160; i++) prunA[i] = 255;
    var rootA = createUniqueSkewb();
    prunA[encodeA(rootA)] = 0;
    var qA = [rootA];
    var head = 0;
    var axIdx, t, k, nxt, m, nc;
    while (head < qA.length) {
      var curA = qA[head++];
      var codeA = encodeA(curA);
      var dA = prunA[codeA];
      m = 0;
      for (axIdx = 0; axIdx < 4; axIdx++) {
        for (t = 1; t <= 2; t++) {
          nxt = cloneSkewb(curA);
          for (k = 0; k < t; k++) rotateSkewbCW(nxt, SK_AXES[axIdx]);
          nc = encodeA(nxt);
          moveA[codeA * 8 + m++] = nc;
          if (prunA[nc] === 255) {
            prunA[nc] = dA + 1;
            qA.push(nxt);
          }
        }
      }
    }

    var moveB = new Uint16Array(972 * 8);
    var prunB = new Uint8Array(972);
    for (i = 0; i < 972; i++) prunB[i] = 255;
    var bReqSumA = new Uint8Array(972);
    var rootB = createUniqueSkewb();
    prunB[encodeB(rootB)] = 0;
    var qB = [rootB];
    head = 0;
    while (head < qB.length) {
      var curB = qB[head++];
      var codeB = encodeB(curB);
      var dB = prunB[codeB];
      var h1 = skCornerHome[curB.U[1]], h2 = skCornerHome[curB.D[3]], h3 = skCornerHome[curB.D[1]];
      bReqSumA[codeB] = (h1[1] + h2[1] + h3[1]) % 3;
      m = 0;
      for (axIdx = 0; axIdx < 4; axIdx++) {
        for (t = 1; t <= 2; t++) {
          nxt = cloneSkewb(curB);
          for (k = 0; k < t; k++) rotateSkewbCW(nxt, SK_AXES[axIdx]);
          nc = encodeB(nxt);
          moveB[codeB * 8 + m++] = nc;
          if (prunB[nc] === 255) {
            prunB[nc] = dB + 1;
            qB.push(nxt);
          }
        }
      }
    }

    skTables = {
      moveA: moveA,
      prunA: prunA,
      moveB: moveB,
      prunB: prunB,
      bReqSumA: bReqSumA,
      encodeA: encodeA,
      encodeB: encodeB
    };
    return skTables;
  }

  function solveSkewbCoords(aTarget, bTarget) {
    var t = initSkewbSolver();
    var path = [];
    function search(a, b, depth, lastAx) {
      if (a === 0 && b === 0) return true;
      if (Math.max(t.prunA[a], t.prunB[b]) > depth) return false;
      for (var m = 0; m < 8; m++) {
        var ax = m >> 1;
        if (ax === lastAx) continue;
        if (search(t.moveA[a * 8 + m], t.moveB[b * 8 + m], depth - 1, ax)) {
          path.push(m);
          return true;
        }
      }
      return false;
    }
    var startD = Math.max(t.prunA[aTarget], t.prunB[bTarget]);
    for (var d = startD; d <= 11; d++) {
      path.length = 0;
      if (search(aTarget, bTarget, d, -1)) {
        return {
          depth: d,
          algorithm: path.map(function (m) { return SK_MOVES[SK_INV[m]]; }).join(' ')
        };
      }
    }
    return null;
  }

  function generateSkewbScramble(rng) {
    var t = initSkewbSolver();
    for (var attempt = 0; attempt < 256; attempt++) {
      var ctr = randomInt(360, rng);
      var pA = randomInt(3, rng);
      var co1 = randomInt(3, rng);
      var co2 = randomInt(3, rng);
      var pB = randomInt(12, rng);
      var co4 = randomInt(3, rng);
      var co5 = randomInt(3, rng);
      var co6 = randomInt(3, rng);
      var co7 = (pA - (co4 + co5 + co6) % 3 + 3) % 3;
      var bCode = pB * 81 + (co4 * 27 + co5 * 9 + co6 * 3 + co7);
      var co3 = (t.bReqSumA[bCode] - (co1 + co2) % 3 + 3) % 3;
      var famA = pA * 27 + (co1 * 9 + co2 * 3 + co3);
      var aCode = ctr * 81 + famA;
      var solved = solveSkewbCoords(aCode, bCode);
      if (!solved || solved.depth < 7) continue;
      var state = createSkewb();
      solved.algorithm.split(' ').forEach(function (mv) { applySkewbMove(state, mv); });
      return {
        algorithm: solved.algorithm,
        facelets: 'SKEWB:' + state.U.join('') + state.L.join('') + state.F.join('') + state.R.join('') + state.B.join('') + state.D.join(''),
        puzzle: 'skewb',
        optimalMoves: solved.depth
      };
    }
    throw new Error('斜转随机状态生成失败');
  }

  function optimalMoves(puzzleId, algorithm) {
    var id = normalizePuzzle(puzzleId);
    var tokens = String(algorithm || '').trim().split(/\s+/).filter(Boolean);
    var i, c, h;
    if (id === '222') {
      var t2 = init2x2Solver();
      var g2 = cloneNxN(t2.baseGrid);
      for (i = 0; i < tokens.length; i++) applyNxNMove(g2, 2, tokens[i]);
      var p2 = [], o2 = [];
      for (i = 0; i < 7; i++) {
        c = C2_CORNERS[i];
        h = t2.cornerHome[g2[c[0]][c[1]][c[2]]];
        p2.push(h[0]);
        o2.push(h[1]);
      }
      var res2 = solve2x2Coords(encodePerm(p2, 7), encodeOriMod3(o2, 7));
      return res2 ? res2.depth : -1;
    }
    if (id === 'pyram') {
      var tp = initPyraminxSolver();
      var sp = createUniquePyraminx();
      for (i = 0; i < tokens.length; i++) applyPyramMove(sp, tokens[i]);
      var tipMismatch = 0;
      for (i = 0; i < 4; i++) {
        var chk = PY_TIP_CHECKS[i];
        if (sp[chk[0]][chk[1]].charAt(0) !== sp[chk[2]][chk[3]].charAt(0)) tipMismatch++;
      }
      var resP = solvePyraminxMain(tp.encodeEdges(sp), tp.encodeCenters(sp));
      return resP ? resP.depth + tipMismatch : -1;
    }
    if (id === 'skewb') {
      var ts = initSkewbSolver();
      var ss = createUniqueSkewb();
      for (i = 0; i < tokens.length; i++) applySkewbMove(ss, tokens[i]);
      var resS = solveSkewbCoords(ts.encodeA(ss), ts.encodeB(ss));
      return resS ? resS.depth : -1;
    }
    return -1;
  }

  function generateScramble(puzzleId, rng) {
    var id = normalizePuzzle(puzzleId);
    if (id === '222') return generateNxNScramble(2, rng, '222');
    if (id === '444') return generateNxNScramble(4, rng, '444');
    if (id === '555') return generateNxNScramble(5, rng, '555');
    if (id === 'pyram') return generatePyraminxScramble(rng);
    if (id === 'skewb') return generateSkewbScramble(rng);
    if (typeof rng === 'function') return generateNxNScramble(3, rng, id);
    return null;
  }

  /* ======================== 通用高清 SVG 展开图渲染 ======================== */
  function buildNxNNetSvg(doc, facelets, n) {
    var cell = n >= 5 ? 7 : n === 4 ? 8.5 : n === 2 ? 15 : 11;
    var gap = n >= 5 ? 1 : 1.5;
    var faceGap = 4;
    var faceSpan = n * cell + (n - 1) * gap;
    var w = 4 * faceSpan + 3 * faceGap;
    var h = 3 * faceSpan + 2 * faceGap;
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');

    var expectedLen = 6 * n * n;
    var valid = typeof facelets === 'string' && facelets.length === expectedLen && /^[URFDLB]+$/.test(facelets);
    var perFace = n * n;
    for (var f = 0; f < FACE_LIST.length; f++) {
      var face = FACE_LIST[f];
      var pos = NET_POS[face];
      var ox = pos[0] * (faceSpan + faceGap);
      var oy = pos[1] * (faceSpan + faceGap);
      var seg = valid ? facelets.slice(f * perFace, (f + 1) * perFace) : null;
      for (var i = 0; i < perFace; i++) {
        var col = i % n;
        var row = Math.floor(i / n);
        var rect = doc.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(ox + col * (cell + gap)));
        rect.setAttribute('y', String(oy + row * (cell + gap)));
        rect.setAttribute('width', String(cell));
        rect.setAttribute('height', String(cell));
        rect.setAttribute('rx', n >= 4 ? '1' : '1.4');
        rect.setAttribute('ry', n >= 4 ? '1' : '1.4');
        rect.setAttribute('fill', valid ? COLORS[seg.charAt(i)] : 'var(--line-soft)');
        svg.appendChild(rect);
      }
    }
    return svg;
  }

  function addTri(doc, svg, x1, y1, x2, y2, x3, y3, fill) {
    var poly = doc.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', x1.toFixed(1) + ',' + y1.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' ' + x3.toFixed(1) + ',' + y3.toFixed(1));
    poly.setAttribute('fill', fill);
    poly.setAttribute('stroke', 'var(--net-stroke)');
    poly.setAttribute('stroke-width', '0.9');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(poly);
  }

  function drawPyramFace(doc, svg, cx, topY, side, colors, inverted) {
    var h = side * Math.sqrt(3) / 2;
    var step = side / 3;
    var rowH = h / 3;
    // 9 个三角的坐标按 0(顶), 1,2,3(中层左中右), 4,5,6,7,8(底层左到右) 绘制
    var tris = [
      // 0: 顶三角
      [[0, 0], [-step / 2, rowH], [step / 2, rowH]],
      // 1: 中左正三角
      [[-step / 2, rowH], [-step, 2 * rowH], [0, 2 * rowH]],
      // 2: 中倒三角
      [[-step / 2, rowH], [step / 2, rowH], [0, 2 * rowH]],
      // 3: 中右正三角
      [[step / 2, rowH], [0, 2 * rowH], [step, 2 * rowH]],
      // 4: 底左正
      [[-step, 2 * rowH], [-1.5 * step, 3 * rowH], [-0.5 * step, 3 * rowH]],
      // 5: 底中左倒
      [[-step, 2 * rowH], [0, 2 * rowH], [-0.5 * step, 3 * rowH]],
      // 6: 底中正
      [[0, 2 * rowH], [-0.5 * step, 3 * rowH], [0.5 * step, 3 * rowH]],
      // 7: 底中右倒
      [[0, 2 * rowH], [step, 2 * rowH], [0.5 * step, 3 * rowH]],
      // 8: 底右正
      [[step, 2 * rowH], [0.5 * step, 3 * rowH], [1.5 * step, 3 * rowH]]
    ];
    for (var i = 0; i < 9; i++) {
      var pts = tris[i].map(function (pt) {
        return inverted ? [cx + pt[0], topY + h - pt[1]] : [cx + pt[0], topY + pt[1]];
      });
      var code = colors ? colors.charAt(i) : '';
      addTri(doc, svg, pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], COLORS[code] || 'var(--line-soft)');
    }
  }

  function buildPyramNetSvg(doc, facelets) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 180 124');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');
    var raw = typeof facelets === 'string' && facelets.indexOf('PYRAM:') === 0 ? facelets.slice(6) : '';
    var valid = raw.length === 36;
    var side = 58;
    var h = side * Math.sqrt(3) / 2;
    // 上排左 L、中 F、右 R；下排倒置 D
    drawPyramFace(doc, svg, 32, 6, side, valid ? raw.slice(9, 18) : '', false);
    drawPyramFace(doc, svg, 90, 6, side, valid ? raw.slice(0, 9) : '', false);
    drawPyramFace(doc, svg, 148, 6, side, valid ? raw.slice(18, 27) : '', false);
    drawPyramFace(doc, svg, 90, 12 + h, side, valid ? raw.slice(27, 36) : '', true);
    return svg;
  }

  function buildSkewbNetSvg(doc, facelets) {
    var size = 34;
    var gap = 4;
    var w = 4 * size + 3 * gap;
    var h = 3 * size + 2 * gap;
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');

    var raw = typeof facelets === 'string' && facelets.indexOf('SKEWB:') === 0 ? facelets.slice(6) : '';
    var valid = raw.length === 30;
    var order = ['U', 'L', 'F', 'R', 'B', 'D'];
    for (var f = 0; f < order.length; f++) {
      var face = order[f];
      var pos = NET_POS[face];
      var ox = pos[0] * (size + gap);
      var oy = pos[1] * (size + gap);
      var seg = valid ? raw.slice(f * 5, f * 5 + 5) : '';
      var mid = size / 2;
      // 4 个角三角：1 左上, 2 右上, 3 右下, 4 左下
      addTri(doc, svg, ox, oy, ox + mid, oy, ox, oy + mid, valid ? COLORS[seg.charAt(1)] : 'var(--line-soft)');
      addTri(doc, svg, ox + size, oy, ox + mid, oy, ox + size, oy + mid, valid ? COLORS[seg.charAt(2)] : 'var(--line-soft)');
      addTri(doc, svg, ox + size, oy + size, ox + size, oy + mid, ox + mid, oy + size, valid ? COLORS[seg.charAt(3)] : 'var(--line-soft)');
      addTri(doc, svg, ox, oy + size, ox, oy + mid, ox + mid, oy + size, valid ? COLORS[seg.charAt(4)] : 'var(--line-soft)');
      // 中心菱形：0
      var diamond = doc.createElementNS(SVG_NS, 'polygon');
      diamond.setAttribute('points',
        (ox + mid) + ',' + oy + ' ' + (ox + size) + ',' + (oy + mid) + ' ' + (ox + mid) + ',' + (oy + size) + ' ' + ox + ',' + (oy + mid)
      );
      diamond.setAttribute('fill', valid ? COLORS[seg.charAt(0)] : 'var(--line-soft)');
      diamond.setAttribute('stroke', 'var(--net-stroke)');
      diamond.setAttribute('stroke-width', '0.9');
      diamond.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(diamond);
    }
    return svg;
  }

  function buildNetSvg(doc, facelets, puzzleId) {
    var puzzle = getPuzzle(puzzleId);
    if (puzzle.netType === 'pyram') return buildPyramNetSvg(doc, facelets);
    if (puzzle.netType === 'skewb') return buildSkewbNetSvg(doc, facelets);
    return buildNxNNetSvg(doc, facelets, puzzle.size);
  }

  var api = {
    list: PUZZLES,
    normalize: normalizePuzzle,
    get: getPuzzle,
    generateScramble: generateScramble,
    optimalMoves: optimalMoves,
    buildNetSvg: buildNetSvg
  };

  root.StarCubePuzzles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
