(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var PUZZLES = [
    { id: '333', name: '3×3', fullName: '3×3 三阶', usesWorker: true, netType: 'nxn', size: 3 },
    { id: '222', name: '2×2', fullName: '2×2 二阶', usesWorker: false, netType: 'nxn', size: 2 },
    { id: '444', name: '4×4', fullName: '4×4 四阶', usesWorker: false, netType: 'nxn', size: 4 },
    { id: '555', name: '5×5', fullName: '5×5 五阶', usesWorker: false, netType: 'nxn', size: 5 },
    { id: '333oh', name: '3×3 单手', fullName: '3×3 单手', usesWorker: true, netType: 'nxn', size: 3 },
    { id: 'pyram', name: '金字塔', fullName: '金字塔 Pyraminx', usesWorker: false, netType: 'pyram', size: 3 },
    { id: 'skewb', name: '斜转', fullName: '斜转 Skewb', usesWorker: false, netType: 'skewb', size: 3 }
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

  function randomInt(max) {
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

  function generateNxNScramble(size) {
    var mods = ['', "'", '2'];
    var moves = [];
    if (size === 2) {
      var faces2 = ['R', 'U', 'F'];
      var len2 = 9 + randomInt(3);
      var last2 = '';
      for (var i = 0; i < len2; i++) {
        var f2;
        do { f2 = faces2[randomInt(faces2.length)]; } while (f2 === last2);
        last2 = f2;
        moves.push(f2 + mods[randomInt(3)]);
      }
    } else {
      // 4x4 (44 moves) / 5x5 (60 moves) 符合 WCA 轴向防冗余规则
      var len = size === 4 ? 44 : 60;
      var axes = [
        size === 4 ? ['U', 'D', 'Uw'] : ['U', 'D', 'Uw', 'Dw'],
        size === 4 ? ['R', 'L', 'Rw'] : ['R', 'L', 'Rw', 'Lw'],
        size === 4 ? ['F', 'B', 'Fw'] : ['F', 'B', 'Fw', 'Bw']
      ];
      var lastAxis = -1;
      var usedInAxis = {};
      for (var k = 0; k < len; k++) {
        var axis, pool, moveBase;
        var tries = 0;
        do {
          axis = randomInt(3);
          pool = axes[axis];
          moveBase = pool[randomInt(pool.length)];
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
        moves.push(moveBase + mods[randomInt(3)]);
      }
    }
    var state = createNxN(size);
    moves.forEach(function (mv) { applyNxNMove(state, size, mv); });
    return {
      algorithm: moves.join(' '),
      facelets: nxnToFacelets(state, size),
      puzzle: size === 2 ? '222' : size === 4 ? '444' : '555'
    };
  }

  /* ======================== 金字塔 Pyraminx 状态机 ======================== */
  // 4 面（F=绿, L=橙, R=红, D=黄），每面 9 个三角块（0 顶角，1-3 中层，4-8 底层）
  function createPyraminx() {
    return {
      F: ['F','F','F','F','F','F','F','F','F'],
      L: ['L','L','L','L','L','L','L','L','L'],
      R: ['R','R','R','R','R','R','R','R','R'],
      D: ['D','D','D','D','D','D','D','D','D']
    };
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
      cycle3(s.F, 1, s.L, 6, s.D, 5);
      cycle3(s.F, 5, s.L, 7, s.D, 1);
      cycle3(s.F, 6, s.L, 3, s.D, 2);
    } else if (face === 'R') {
      cycle3(s.F, 3, s.D, 6, s.R, 5);
      cycle3(s.F, 7, s.D, 7, s.R, 1);
      cycle3(s.F, 6, s.D, 3, s.R, 2);
    } else if (face === 'B') {
      cycle3(s.L, 1, s.R, 7, s.D, 1);
      cycle3(s.L, 5, s.R, 6, s.D, 2);
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

  function generatePyraminxScramble() {
    var axes = ['U', 'L', 'R', 'B'];
    var tips = ['u', 'l', 'r', 'b'];
    var moves = [];
    var last = '';
    for (var i = 0; i < 11; i++) {
      var a;
      do { a = axes[randomInt(4)]; } while (a === last);
      last = a;
      moves.push(a + (randomInt(2) ? "'" : ''));
    }
    for (var j = 0; j < tips.length; j++) {
      var r = randomInt(3);
      if (r === 1) moves.push(tips[j]);
      else if (r === 2) moves.push(tips[j] + "'");
    }
    var state = createPyraminx();
    moves.forEach(function (mv) { applyPyramMove(state, mv); });
    return {
      algorithm: moves.join(' '),
      facelets: 'PYRAM:' + state.F.join('') + state.L.join('') + state.R.join('') + state.D.join(''),
      puzzle: 'pyram'
    };
  }

  /* ======================== 斜转 Skewb 状态机 ======================== */
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

  function rotateSkewbCW(s, axis) {
    if (axis === 'R') {
      cycle3(s.R, 0, s.B, 0, s.D, 0);
      cycle3(s.R, 3, s.B, 4, s.D, 3);
      cycle3(s.R, 2, s.B, 3, s.D, 2);
      cycle3(s.R, 4, s.B, 1, s.D, 4);
      cycle3(s.F, 3, s.U, 2, s.L, 4);
    } else if (axis === 'L') {
      cycle3(s.L, 0, s.D, 0, s.F, 0);
      cycle3(s.L, 3, s.D, 4, s.F, 4);
      cycle3(s.L, 2, s.D, 1, s.F, 1);
      cycle3(s.L, 4, s.D, 3, s.F, 3);
      cycle3(s.U, 4, s.R, 4, s.B, 3);
    } else if (axis === 'U') {
      cycle3(s.U, 0, s.B, 0, s.L, 0);
      cycle3(s.U, 1, s.B, 2, s.L, 1);
      cycle3(s.U, 2, s.B, 1, s.L, 4);
      cycle3(s.U, 4, s.B, 3, s.L, 2);
      cycle3(s.F, 1, s.R, 2, s.D, 4);
    } else if (axis === 'B') {
      cycle3(s.B, 0, s.L, 0, s.D, 0);
      cycle3(s.B, 3, s.L, 4, s.D, 4);
      cycle3(s.B, 2, s.L, 1, s.D, 3);
      cycle3(s.B, 4, s.L, 3, s.D, 1);
      cycle3(s.U, 1, s.F, 4, s.R, 3);
    }
  }

  function applySkewbMove(s, token) {
    var prime = token.endsWith("'");
    var base = prime ? token.slice(0, -1) : token;
    var turns = prime ? 2 : 1;
    for (var t = 0; t < turns; t++) rotateSkewbCW(s, base);
  }

  function generateSkewbScramble() {
    var axes = ['U', 'L', 'R', 'B'];
    var moves = [];
    var last = '';
    for (var i = 0; i < 11; i++) {
      var a;
      do { a = axes[randomInt(4)]; } while (a === last);
      last = a;
      moves.push(a + (randomInt(2) ? "'" : ''));
    }
    var state = createSkewb();
    moves.forEach(function (mv) { applySkewbMove(state, mv); });
    return {
      algorithm: moves.join(' '),
      facelets: 'SKEWB:' + state.U.join('') + state.L.join('') + state.F.join('') + state.R.join('') + state.B.join('') + state.D.join(''),
      puzzle: 'skewb'
    };
  }

  function generateScramble(puzzleId) {
    var id = normalizePuzzle(puzzleId);
    if (id === '222') return generateNxNScramble(2);
    if (id === '444') return generateNxNScramble(4);
    if (id === '555') return generateNxNScramble(5);
    if (id === 'pyram') return generatePyraminxScramble();
    if (id === 'skewb') return generateSkewbScramble();
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
    buildNetSvg: buildNetSvg
  };

  root.StarCubePuzzles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
