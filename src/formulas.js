(function (root) {
  'use strict';

  const sune = "R U R' U R U2 R'";
  const ua = "R U' R U R U R U' R' U' R2";

  // PLL notation: cubeskills.com/uploads/pdf/tutorials/pll-algorithms.pdf and jperm.net/algs/pll.
  const pllCases = [
    {
      name: 'T Perm',
      summary: '相邻角块换位',
      recognize: '先找左侧顶层两端的同色角。这个局面会互换右侧的两个角块，以及一对棱块。',
      algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'"
    },
    {
      name: 'Jb Perm',
      summary: '相邻角块换位',
      recognize: '先找左侧顶层的整条同色色带，正面右边还有一对同色块。',
      algorithm: "R U R' F' R U R' U' R' F R2 U' R' U'"
    },
    {
      name: 'Y Perm',
      summary: '对角角块换位',
      recognize: '四个侧面的顶层都找不到同色角对。这个局面要互换两个对角位置的角块。',
      algorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'"
    },
    {
      name: 'Ua Perm',
      summary: '三个棱块循环换位',
      recognize: '后侧顶层已经对齐，四个角块也都在正确位置。留意其余三个侧面的顶层中间块。',
      algorithm: ua
    }
  ];

  const complete = '顶层已完成，魔方已复原。';
  const series = [
    {
      name: 'F2L', title: '前两层', description: '把角块和棱块配成一对，再插进目标槽位。',
      completion: '前两层已完成，可以接着做 OLL。',
      cases: [{
        name: '右前槽插入', summary: '已配对角棱',
        recognize: '先找顶层已经配对的角块和棱块，再把这一对插进右前槽。',
        algorithm: "U R U' R'", target: sune // CubeSkills, F2L Algorithms – All Four Slot Angles
      }]
    },
    {
      name: 'OLL', title: '顶层定向', description: '翻正顶层块，使顶面统一成同一种颜色。',
      completion: '顶面颜色已统一，可以接着做 PLL。',
      cases: [{
        name: 'OLL 27 · 小鱼', summary: '顶层黄十字，只有一个黄角朝上',
        recognize: '顶面已有黄十字，观察左前角朝上的黄色和另外三个角的朝向。',
        algorithm: sune, target: ua // J Perm, 3×3 OLL
      }]
    },
    {
      name: 'PLL', title: '顶层换位', description: '顶面同色后，调整顶层块的位置。',
      completion: complete, cases: pllCases
    },
    {
      name: 'COLL', title: '顶层角块归位', description: '顶层棱块已定向时，同时翻正并归位四个角块。',
      completion: '顶层四个角块已归位，接下来只需调整棱块位置。',
      cases: [{
        name: 'COLL · H 型', summary: '黄十字已成，四角都未翻正',
        recognize: '顶面是黄十字，四个顶角的黄色都在侧面。观察侧面两端角块的配色。',
        algorithm: "R U R' U R U' R' U R U2 R'", target: ua // J Perm, COLL
      }]
    },
    {
      name: 'ZBLL', title: '一步还原顶层', description: '顶层棱块已定向时，用一条公式完成整个顶层。',
      completion: complete,
      cases: [{
        name: 'ZBLL U 1', summary: '相邻两个黄角朝上',
        recognize: '在顶面黄十字之外，靠前的两个角也朝上。再用侧面配色确认顶层块的位置。',
        algorithm: "R U' R' U' R U2 R' U' R' D' R U2 R' D R" // SpeedCubeDB, ZBLL U 1
      }]
    }
  ];

  // Screen coordinates: x right, y down, z toward the viewer. Sticker order matches URFDLB.
  const faces = {
    U: { name: '上层', axis: 'Y', side: -1, turn: -1, tilt: 'rotateX(90deg)', position: (r, c) => [c - 1, -1, r - 1] },
    R: { name: '右层', axis: 'X', side: 1, turn: 1, tilt: 'rotateY(90deg)', position: (r, c) => [1, r - 1, 1 - c] },
    F: { name: '前层', axis: 'Z', side: 1, turn: 1, tilt: 'rotateY(0deg)', position: (r, c) => [c - 1, r - 1, 1] },
    D: { name: '下层', axis: 'Y', side: 1, turn: 1, tilt: 'rotateX(-90deg)', position: (r, c) => [c - 1, 1, 1 - r] },
    L: { name: '左层', axis: 'X', side: -1, turn: -1, tilt: 'rotateY(-90deg)', position: (r, c) => [-1, r - 1, c - 1] },
    B: { name: '后层', axis: 'Z', side: -1, turn: -1, tilt: 'rotateY(180deg)', position: (r, c) => [1 - c, r - 1, -1] }
  };

  function element(doc, tag, className, content) {
    const node = doc.createElement(tag);
    node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function inverse(move) {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move[0] : move + "'";
  }

  function moveDescription(move) {
    const direction = move.endsWith('2') ? '转 180°' : move.endsWith("'") ? '逆时针转 90°' : '顺时针转 90°';
    return faces[move[0]].name + direction;
  }

  function pattern(doc, facelets, showSlot) {
    const grid = element(doc, 'span', 'formula-case-pattern');
    grid.setAttribute('aria-hidden', 'true');
    function sticker(index, row, col) {
      const tile = doc.createElement('i');
      tile.dataset.formulaColor = facelets[index];
      tile.style.gridArea = row + ' / ' + col;
      grid.append(tile);
    }
    if (showSlot) {
      grid.classList.add('formula-slot-pattern');
      for (let i = 0; i < 9; i++) {
        const row = 1 + Math.floor(i / 3);
        const col = 1 + i % 3;
        sticker(i, row, col);
        sticker(18 + i, row + 3, col);  // Front
        sticker(9 + i, row + 3, col + 3); // Right
      }
      return grid;
    }
    for (let i = 0; i < 9; i++) sticker(i, 2 + Math.floor(i / 3), 2 + i % 3);
    for (let i = 0; i < 3; i++) {
      sticker(47 - i, 1, 2 + i);       // Back
      sticker(11 - i, 2 + i, 5);       // Right
      sticker(18 + i, 5, 2 + i);       // Front
      sticker(36 + i, 2 + i, 1);       // Left
    }
    return grid;
  }

  function createScene(host) {
    const doc = host.ownerDocument;
    const cube = element(doc, 'div', 'formula-cube');
    const layer = element(doc, 'div', 'formula-rotating-layer');
    const pieces = [];
    const surfaces = [];
    cube.setAttribute('aria-hidden', 'true');
    cube.append(layer);
    host.append(cube);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const node = element(doc, 'div', 'formula-piece');
          const coords = [x, y, z].map(value => 'calc(var(--cube-unit) * ' + value + ')');
          node.style.transform = 'translate3d(' + coords.join(',') + ')';
          const sides = {};
          for (const [letter, face] of Object.entries(faces)) {
            const side = element(doc, 'div', 'formula-face');
            side.style.setProperty('--face-tilt', face.tilt);
            sides[letter] = side;
            node.append(side);
          }
          pieces.push({ x, y, z, node, sides });
          cube.append(node);
        }
      }
    }
    for (const [letter, face] of Object.entries(faces)) {
      for (let i = 0; i < 9; i++) {
        const [x, y, z] = face.position(Math.floor(i / 3), i % 3);
        const piece = pieces.find(candidate => candidate.x === x && candidate.y === y && candidate.z === z);
        const sticker = element(doc, 'span', 'formula-sticker');
        piece.sides[letter].append(sticker);
        surfaces.push(sticker);
      }
    }

    let pitch, yaw, drag;
    function orbit() {
      pitch = Math.max(-78, Math.min(78, pitch));
      cube.style.transform = 'rotateX(' + pitch + 'deg) rotateY(' + yaw + 'deg)';
    }
    function resetCamera() {
      pitch = -27;
      yaw = -34;
      orbit();
    }
    resetCamera();
    host.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pitch, yaw };
      host.setPointerCapture(event.pointerId);
    });
    host.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      yaw = drag.yaw + (event.clientX - drag.x) * 0.55;
      pitch = drag.pitch - (event.clientY - drag.y) * 0.55;
      orbit();
    });
    function stopDrag(event) {
      if (drag?.id === event.pointerId) drag = null;
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => host.addEventListener(type, stopDrag));
    host.addEventListener('keydown', event => {
      const turns = { ArrowLeft: [0, -12], ArrowRight: [0, 12], ArrowUp: [-12, 0], ArrowDown: [12, 0] };
      const turn = turns[event.key];
      if (!turn) return;
      event.preventDefault();
      pitch += turn[0];
      yaw += turn[1];
      orbit();
    });

    function show(facelets) {
      for (const piece of pieces) {
        if (piece.node.parentNode === layer) cube.append(piece.node);
      }
      layer.style.transform = '';
      surfaces.forEach((node, index) => { node.dataset.formulaColor = facelets[index]; });
    }

    function rotate(move, progress) {
      const face = faces[move[0]];
      if (!layer.firstChild) {
        for (const piece of pieces) {
          if (piece[face.axis.toLowerCase()] === face.side) layer.append(piece.node);
        }
      }
      const degrees = move.endsWith('2') ? 180 : move.endsWith("'") ? -90 : 90;
      layer.style.transform = 'rotate' + face.axis + '(' + (degrees * face.turn * progress) + 'deg)';
    }

    return { show, rotate, resetCamera };
  }

  function create(view, computeFacelets) {
    const doc = view.ownerDocument;
    const byId = id => view.querySelector('#formula' + id);
    const seriesIndex = byId('SeriesIndex');
    const seriesTitle = byId('SeriesTitle');
    const library = byId('Library');
    const libraryTitle = byId('LibraryTitle');
    const detail = byId('Detail');
    const pages = [seriesIndex, library, detail];
    const title = byId('Title');
    const description = byId('Description');
    const status = byId('Status');
    const instruction = byId('StepDetail');
    const movesList = byId('Moves');
    const prev = byId('Prev');
    const next = byId('Next');
    const play = byId('Play');
    const hint = byId('Hint');
    const speed = byId('Speed');
    const speedControl = byId('SpeedControl');
    const modeHelp = byId('ModeHelp');
    const restart = byId('Restart');
    const modes = Array.from(byId('Modes').querySelectorAll('button'));
    const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
    let selectedSeriesButton, selected, scene, mode, moves, states, buttons, step;
    let turn = null;
    let playing = false;
    let delay = 0;
    let hintVisible = false;

    function render() {
      const practicing = mode === 'practice';
      const current = turn ? turn.to : step;
      const highlighted = turn ? turn.moveIndex : step;
      const forward = current < moves.length;
      status.textContent = '第 ' + current + ' / ' + moves.length + ' 步';
      if (turn && !practicing) {
        instruction.textContent = turn.move + ' · ' + moveDescription(turn.move);
      } else if (forward) {
        const upcoming = moves[current];
        instruction.textContent = practicing && !hintVisible
          ? '做完一步后点「下一步」，对照魔方的状态。'
          : '下一步 ' + upcoming + ' · ' + moveDescription(upcoming);
      } else {
        instruction.textContent = mode === 'setup' ? '已摆好局面，可以切换到「实体跟练」。' : selected.completion;
      }
      buttons.forEach((button, index) => {
        if (index + 1 === highlighted) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      prev.disabled = current === 0;
      next.disabled = !forward;
      play.hidden = practicing;
      play.textContent = playing ? '暂停' : forward ? '播放' : '重播';
      hint.hidden = !practicing || !forward;
      movesList.hidden = practicing;
      speedControl.hidden = practicing;
      restart.disabled = current === 0 && !playing;
    }

    function showStep(index) {
      step = index;
      hintVisible = false;
      scene.show(states[index]);
      render();
    }

    function finishTurn() {
      if (!turn) return;
      cancelAnimationFrame(turn.frame);
      const to = turn.to;
      turn = null;
      showStep(to);
    }

    function pause() {
      clearTimeout(delay);
      playing = false;
      if (moves) render();
    }

    function scheduleNext() {
      if (step === moves.length) {
        pause();
        return;
      }
      delay = setTimeout(() => animateStep(step + 1), reducedMotion.matches ? Number(speed.value) : 140);
    }

    function animateStep(to) {
      const backwards = to < step;
      const move = moves[Math.min(step, to)];
      if (reducedMotion.matches) {
        showStep(to);
        if (playing) scheduleNext();
        return;
      }
      const started = performance.now();
      const duration = Number(speed.value);
      const motion = { to, move: backwards ? inverse(move) : move, moveIndex: Math.max(step, to), frame: 0 };
      turn = motion;
      render();
      function frame(now) {
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        if (progress >= 1) {
          finishTurn();
          if (playing) scheduleNext();
        } else {
          const eased = progress * progress * (3 - 2 * progress);
          scene.rotate(move, backwards ? -eased : eased);
          motion.frame = requestAnimationFrame(frame);
        }
      }
      motion.frame = requestAnimationFrame(frame);
    }

    function navigate(index) {
      pause();
      finishTurn();
      showStep(index);
    }

    function stepBy(offset) {
      pause();
      finishTurn();
      const index = step + offset;
      if (index >= 0 && index <= moves.length) animateStep(index);
    }

    function changeMode(nextMode) {
      pause();
      finishTurn();
      mode = nextMode;
      const setup = mode === 'setup';
      modeHelp.hidden = mode === 'demo';
      modeHelp.textContent = setup
        ? '从已复原的实体魔方开始，黄面朝上、绿面朝前。'
        : '把实体魔方摆成这个局面，然后凭记忆练习。';
      moves = setup ? selected.setup : selected.moves;
      const prefix = setup ? [] : selected.setup;
      states = Array.from({ length: moves.length + 1 }, (_, index) =>
        computeFacelets(prefix.concat(moves.slice(0, index)).join(' ')));
      buttons = moves.map((move, index) => {
        const button = element(doc, 'button', 'formula-move', move);
        button.type = 'button';
        button.setAttribute('aria-label', '第 ' + (index + 1) + ' 步 ' + move);
        button.addEventListener('click', () => navigate(index + 1));
        return button;
      });
      movesList.replaceChildren(...buttons);
      modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.formulaMode === mode)));
      showStep(0);
    }

    function showPage(page, focus) {
      pages.forEach(panel => { panel.hidden = panel !== page; });
      root.scrollTo(0, 0);
      focus.focus();
    }

    function openCase(entry, collection) {
      if (!scene) scene = createScene(byId('Orbit'));
      scene.resetCamera();
      title.textContent = entry.name;
      description.textContent = entry.recognize;
      byId('Back').textContent = '← 返回 ' + collection.name;
      selected = entry;
      changeMode('demo');
      showPage(detail, title);
    }

    function caseCard(entry, collection) {
      const moves = entry.algorithm.split(' ');
      // F2L, OLL and COLL deliberately end at the next practice stage.
      const target = entry.target ? entry.target.split(' ') : [];
      const setup = target.concat(moves.slice().reverse().map(inverse));
      const button = element(doc, 'button', 'formula-case');
      const label = doc.createElement('span');
      const arrow = element(doc, 'span', '', '›');
      arrow.setAttribute('aria-hidden', 'true');
      label.append(
        element(doc, 'strong', 'formula-case-name', entry.name),
        element(doc, 'span', 'formula-case-meta', entry.summary + ' · ' + moves.length + ' 步')
      );
      button.type = 'button';
      button.append(pattern(doc, computeFacelets(setup.join(' ')), collection.name === 'F2L'), label, arrow);
      const exercise = { ...entry, moves, setup, button, completion: collection.completion };
      button.addEventListener('click', () => openCase(exercise, collection));
      return button;
    }

    function openSeries(collection, button) {
      selectedSeriesButton = button;
      libraryTitle.textContent = collection.name + ' · ' + collection.title;
      byId('LibraryDescription').textContent = collection.description;
      byId('Cases').replaceChildren(...collection.cases.map(entry => caseCard(entry, collection)));
      showPage(library, libraryTitle);
    }

    for (const collection of series) {
      const button = element(doc, 'button', 'formula-series-card');
      const text = doc.createElement('span');
      text.append(
        element(doc, 'strong', 'formula-series-name', collection.title),
        element(doc, 'span', 'formula-series-description', collection.description)
      );
      const meta = element(doc, 'span', 'formula-series-meta', collection.cases.length + ' 条');
      const arrow = element(doc, 'span', 'formula-series-arrow', '›');
      arrow.setAttribute('aria-hidden', 'true');
      meta.append(arrow);
      button.type = 'button';
      button.append(element(doc, 'span', 'formula-series-code', collection.name), text, meta);
      button.addEventListener('click', () => openSeries(collection, button));
      byId('SeriesList').append(button);
    }

    byId('LibraryBack').addEventListener('click', () => showPage(seriesIndex, selectedSeriesButton));
    byId('Back').addEventListener('click', () => {
      pause();
      finishTurn();
      showPage(library, selected.button);
    });
    const cameraReset = byId('CameraReset');
    cameraReset.addEventListener('click', () => scene.resetCamera());
    cameraReset.addEventListener('pointerup', event => {
      // A touch immediately after orbiting may deliver pointer events without a click.
      if (event.pointerType === 'touch' && doc.elementFromPoint(event.clientX, event.clientY) === cameraReset) {
        scene.resetCamera();
      }
    });
    modes.forEach(button => button.addEventListener('click', () => {
      if (button.dataset.formulaMode !== mode) changeMode(button.dataset.formulaMode);
    }));
    prev.addEventListener('click', () => stepBy(-1));
    next.addEventListener('click', () => stepBy(1));
    restart.addEventListener('click', () => navigate(0));
    hint.addEventListener('click', () => { hintVisible = true; render(); });
    play.addEventListener('click', () => {
      if (playing) {
        pause();
        return;
      }
      finishTurn();
      if (step === moves.length) showStep(0);
      playing = true;
      animateStep(step + 1);
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) {
        pause();
        finishTurn();
      }
    });

    return {
      pause() { pause(); finishTurn(); },
      focus() {
        const heading = !seriesIndex.hidden ? seriesTitle : !library.hidden ? libraryTitle : title;
        heading.focus({ preventScroll: true });
      }
    };
  }

  root.StarCubeFormulas = { create };
})(window);
