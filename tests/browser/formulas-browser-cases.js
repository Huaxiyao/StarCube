(async () => {
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  try {
    targetId = (await cdp('Target.createTarget', { url: 'about:blank' }, null)).targetId;
    active = (await cdp('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId;
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await cdp('Page.navigate', { url });
    await ready();
    await viewport(1280, 800);
    const before = await state();
    const seriesButton = index => '#formulaSeriesList button:nth-child(' + index + ')';
    const caseButton = index => '#formulaCases .formula-case:nth-child(' + index + ')';
    const modeButton = mode => '[data-formula-mode="' + mode + '"]';
    const moveButton = index => '#formulaMoves button:nth-child(' + index + ')';
    const settled = `document.querySelector('#formulaStepDetail').textContent.startsWith('下一步')`;
    const angleExpression = `Number.parseFloat(document.querySelector('.formula-rotating-layer').style.transform.match(/-?[0-9.]+/)?.[0])`;
    const coords = position => Array.from(position.matchAll(/\* (-?\d+)/g), match => Number(match[1]));

    function sceneState() {
      return ev(`Array.from(document.querySelectorAll('.formula-piece')).map(piece =>
        [piece.style.transform, Array.from(piece.children, side =>
          [side.style.getPropertyValue('--face-tilt'), side.firstChild?.dataset.formulaColor || ''])])
        .sort((a, b) => a[0].localeCompare(b[0]))`);
    }

    await check('offline-series-index-pll-library-and-animated-turn', async () => {
      await click('#navFormulas');
      const series = await ev(`Array.from(document.querySelectorAll('.formula-series-code'), node => node.textContent)`);
      assert.deepEqual(series, ['F2L', 'OLL', 'PLL', 'COLL', 'ZBLL']);
      assert.equal(await ev(`document.querySelector('#formulaLibrary').hidden`), true);
      await wait(180);
      await shot('desktop-series');
      await click(seriesButton(3));
      assert.equal(await ev(`document.querySelector('#formulaLibraryTitle').textContent`), 'PLL · 顶层换位');
      const entries = await ev(`Array.from(document.querySelectorAll('.formula-case-name'), node => node.textContent)`);
      assert.deepEqual(entries, ['T Perm', 'Jb Perm', 'Y Perm', 'Ua Perm']);
      assert.equal(await ev('navigator.onLine'), false);
      await wait(180);
      await shot('desktop-library');
      await click(caseButton(1));
      assert.equal(await ev(`document.querySelector('#formulaTitle').textContent`), 'T Perm');
      assert.equal(await ev(`document.querySelectorAll('.formula-sticker').length`), 54);
      const initial = await sceneState();
      await shot('desktop-detail');
      await click('#formulaNext');
      await until(`document.querySelector('.formula-rotating-layer').childElementCount === 9 && ${angleExpression} > 15`);
      const angle = await ev(angleExpression);
      assert.ok(angle > 15 && angle < 90, 'Right layer rotates clockwise through an intermediate angle');
      await until(settled);
      const firstStep = await sceneState();
      assert.notDeepEqual(firstStep, initial);
      await click('#formulaPrev');
      await until(settled);
      assert.deepEqual(await sceneState(), initial);
      await click(moveButton(1));
      assert.deepEqual(await sceneState(), firstStep);
      await click('#formulaPlay');
      await until(`document.querySelector('#formulaPlay').textContent === '暂停'`);
      await click('#formulaPlay');
      await until(settled);
      const paused = await sceneState();
      await wait(600);
      assert.deepEqual(await sceneState(), paused);
      await click('#formulaBack');
      assert.equal(await ev('document.activeElement.className'), 'formula-case');
      return { series, entries, sampledAngle: angle, stickers: 54 };
    });

    await check('four-pll-cases-solve-and-setup-matches-practice', async () => {
      if (await ev(`!document.querySelector('#formulaDetail').hidden`)) await click('#formulaBack');
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const counts = [];
      for (let index = 1; index <= 4; index++) {
        await click(caseButton(index));
        const initial = await sceneState();
        const count = await ev(`document.querySelector('#formulaMoves').childElementCount`);
        counts.push(count);
        await click(moveButton(count));
        const solved = await sceneState();
        assert.notDeepEqual(solved, initial);
        const faces = new Map();
        for (const [, sides] of solved) {
          for (const [orientation, color] of sides) {
            if (!color) continue;
            if (!faces.has(orientation)) faces.set(orientation, []);
            faces.get(orientation).push(color);
          }
        }
        assert.equal(faces.size, 6);
        assert.equal(new Set([...faces.values()].map(colors => colors[0])).size, 6);
        for (const colors of faces.values()) {
          assert.equal(colors.length, 9);
          assert.equal(new Set(colors).size, 1);
        }
        initial.forEach(([position, sides], i) => {
          const [, y] = coords(position);
          if (y !== -1) assert.deepEqual(sides, solved[i][1], 'Lower layers are already solved in a PLL case');
          const topSticker = sides.find(([orientation]) => orientation === 'rotateX(90deg)')[1];
          if (topSticker) assert.equal(topSticker, 'U', 'Top face starts with a single color');
        });
        await click(modeButton('setup'));
        assert.deepEqual(await sceneState(), solved);
        await click(moveButton(count));
        assert.deepEqual(await sceneState(), initial);
        await click(modeButton('practice'));
        assert.deepEqual(await sceneState(), initial);
        assert.equal(await ev(`document.querySelector('#formulaMoves').hidden`), true);
        await click('#formulaHint');
        assert.match(await ev(`document.querySelector('#formulaStepDetail').textContent`), /^下一步 [URFDLB]/);
        await click('#formulaNext');
        assert.match(await ev(`document.querySelector('#formulaStepDetail').textContent`), /^做完一步后/);
        await click('#formulaBack');
      }
      return { counts };
    });

    await check('each-series-has-a-practice-case-with-the-correct-goal', async () => {
      await click('#formulaLibraryBack');
      assert.equal(await ev(`document.activeElement.querySelector('.formula-series-code').textContent`), 'PLL');
      const examples = [[1, 'F2L'], [2, 'OLL'], [4, 'COLL'], [5, 'ZBLL']];
      for (const [index, name] of examples) {
        await click(seriesButton(index));
        assert.match(await ev(`document.querySelector('#formulaLibraryTitle').textContent`), new RegExp('^' + name));
        assert.equal(await ev(`document.querySelector('#formulaCases').childElementCount`), 1);
        await click(caseButton(1));
        const start = await sceneState();
        const length = await ev(`document.querySelector('#formulaMoves').childElementCount`);
        await click(moveButton(length));
        const finish = await sceneState();
        await click(modeButton('setup'));
        const solved = await sceneState();
        const setupLength = await ev(`document.querySelector('#formulaMoves').childElementCount`);
        await click(moveButton(setupLength));
        assert.deepEqual(await sceneState(), start);
        await click(modeButton('practice'));
        assert.deepEqual(await sceneState(), start);
        assert.notDeepEqual(finish, start);
        if (name === 'ZBLL') {
          assert.deepEqual(finish, solved);
        } else {
          assert.notDeepEqual(finish, solved, name + ' ends before the full cube is solved');
          finish.forEach(([position, sides], i) => {
            const [x, y, z] = coords(position);
            if (y !== -1 || (name === 'COLL' && x !== 0 && z !== 0)) {
              assert.deepEqual(sides, solved[i][1], 'Resolved pieces in ' + name);
            }
            const topColor = sides.find(([orientation]) => orientation === 'rotateX(90deg)')[1];
            if (topColor && (name === 'OLL' || name === 'COLL')) assert.equal(topColor, 'U');
          });
        }
        await click('#formulaBack');
        await click('#formulaLibraryBack');
        assert.equal(await ev(`document.activeElement.querySelector('.formula-series-code').textContent`), name);
      }
      return { checkedSeries: examples.map(([, name]) => name) };
    });

    await check('touch-orbit-responsive-and-timer-isolation', async () => {
      if (await ev(`!document.querySelector('#formulaDetail').hidden`)) await click('#formulaBack');
      if (await ev(`!document.querySelector('#formulaLibrary').hidden`)) await click('#formulaLibraryBack');
      await viewport(390, 844);
      await shot('phone-series');
      await touchTap(seriesButton(3));
      await until(`!document.querySelector('#formulaLibrary').hidden`);
      await touchTap(caseButton(1));
      await until(`!document.querySelector('#formulaDetail').hidden`);
      const base = await ev(`document.querySelector('.formula-cube').style.transform`);
      const start = await point('#formulaOrbit');
      await touch('touchStart', start);
      await touch('touchMove', { ...start, x: start.x + 42, y: start.y + 16 });
      await touch('touchEnd', start);
      assert.notEqual(await ev(`document.querySelector('.formula-cube').style.transform`), base);
      // The button is already on screen. Avoid scrolling it to the viewport center
      // between a touch drag and a tap while Chromium settles the compositor hit areas.
      const resetPoint = await ev(`(() => {
        const button = document.querySelector('#formulaCameraReset');
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return {x, y, visible: document.elementFromPoint(x, y) === button};
      })()`);
      assert.ok(resetPoint.visible, 'Reset view is reachable without scrolling after a drag');
      await touch('touchStart', resetPoint);
      await touch('touchEnd', resetPoint);
      await until(`document.querySelector('.formula-cube').style.transform === ${JSON.stringify(base)}`, active, 1500);
      await ev('window.scrollTo(0,0)');
      await shot('phone-detail');
      for (const width of [320, 375, 414, 768, 1280]) {
        await viewport(width, 844);
        assert.ok(await ev('document.documentElement.scrollWidth <= innerWidth'), 'No horizontal overflow at ' + width);
        assert.ok(await ev(`document.querySelector('#formulaNext').getBoundingClientRect().height >= 44`));
      }
      await tap();
      assert.equal((await state()).count, before.count);
      await click('#navTimer');
      const after = await state();
      assert.equal(after.count, before.count);
      assert.equal(after.status, before.status);
      assert.equal(after.scramble, before.scramble);
      await click('#inspectionToggle');
      await hold();
      assert.equal((await state()).status, '计时中');
      await tap();
      await ready();
      assert.equal((await state()).count, before.count + 1);
      assert.deepEqual(runtimeErrors, []);
      return { widths: [320, 375, 390, 414, 768, 1280], timerCount: after.count };
    });

    const summary = { passed: results.filter(result => result.passed).length, total: results.length };
    const htmlSha256 = crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex');
    fs.writeFileSync(path.join(outDir, 'browser-regression-results.json'), JSON.stringify({ htmlSha256, summary, results, runtimeErrors }, null, 2) + '\n');
    if (summary.passed !== summary.total) process.exitCode = 1;
  } finally {
    if (targetId) await cdp('Target.closeTarget', { targetId }, null).catch(() => {});
    ws.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
