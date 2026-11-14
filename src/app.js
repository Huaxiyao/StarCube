(function () {
  'use strict';

  var Stats = window.StarCubeStats;
  var Review = window.StarCubeReview;
  var HOLD_MS = 300;
  var TOUCH_MOVE_PX = 10;
  var GEN_TIMEOUT = 5000;
  var INIT_TIMEOUT = 30000;
  var RECORDS_KEY = 'starcube.records.v1';
  var SETTINGS_KEY = 'starcube.settings.v1';
  var SELECTION_KEY = 'starcube.currentGroup.v1';
  var SOLVED_COLORS = { U: '#F2F2F2', R: '#C62828', F: '#2E7D32', D: '#F2C230', L: '#E06C00', B: '#1565C0' };
  var FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var NET_FACE_POS = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };
  var CELL = 15;
  var GAP = 1;
  var NET_W = 12 * CELL + 11 * GAP;
  var NET_H = 9 * CELL + 8 * GAP;
  var C = {
    normal: 'var(--text)',
    dim: 'var(--muted)',
    white: 'var(--text)',
    hold: 'var(--yellow)',
    ready: 'var(--green-bright)',
    bad: 'var(--red-text)'
  };
  var ALG_RE = /^[URFDLB](2|')?$/;

  function $(id) { return document.getElementById(id); }

  var el = {
    app: $('app'), navTimer: $('navTimer'), navReview: $('navReview'),
    timerView: $('timerView'), reviewView: $('reviewView'), recentReview: $('recentReview'),
    timerGroupName: $('timerGroupName'), coreAo5: $('coreAo5'), coreAo12: $('coreAo12'),
    corePb: $('corePb'), coreCount: $('coreCount'), coreGlobalPb: $('coreGlobalPb'),
    recentList: $('recentList'), recentEmpty: $('recentEmpty'),
    status: $('status'),
    switchBtn: $('inspectionToggle'),
    storageBanner: $('storageBanner'),
    scrambleText: $('scrambleText'),
    scrambleHint: $('scrambleHint'),
    retryBtn: $('retryBtn'),
    newScrambleBtn: $('newScramble'),
    exportBtn: $('exportData'),
    importBtn: $('importData'),
    importFile: $('importFile'),
    feedback: $('dataFeedback'),
    historyMore: $('historyMore'),
    net: $('net'),
    pad: $('pad'),
    timer: $('timer'),
    pbBadge: $('pbBadge'),
    subStatus: $('subStatus'),
    cancelBtn: $('cancelInspection'),
    ao5: $('ao5'),
    ao12: $('ao12'),
    ao50: $('ao50'),
    ao100: $('ao100'),
    avg: $('avg'),
    count: $('count'),
    pb: $('pb'),
    globalPb: $('globalPb'),
    groupSelect: $('groupSelect'),
    groupNew: $('groupNew'),
    groupRename: $('groupRename'),
    groupForm: $('groupForm'),
    groupName: $('groupName'),
    groupSave: $('groupSave'),
    groupCancel: $('groupCancel'),
    groupError: $('groupError'),
    groupLabel: $('groupNameLabel'),
    bestAo5: $('bestAo5'),
    actions: $('actions'),
    plusBtn: $('penaltyPlus'),
    dnfBtn: $('penaltyDnf'),
    deleteBtn: $('deleteLatest'),
    historyToggle: $('historyToggle'),
    historyBody: $('historyBody'),
    historyList: $('historyList'),
    historyEmpty: $('historyEmpty'),
    historyCount: $('historyCount'),
    reviewToggle: $('reviewToggle'), reviewBody: $('reviewBody'), reviewRange: $('reviewRange'),
    reviewChart: $('reviewChart'), reviewSummary: $('reviewSummary'), reviewEmpty: $('reviewEmpty'),
    reviewContent: $('reviewContent'), reviewAverage: $('reviewAverage'), reviewBest: $('reviewBest'),
    reviewRecord: $('reviewRecord'), reviewInspect: $('reviewInspect'), reviewSelected: $('reviewSelected'),
    recordDialog: $('recordDialog'), recordClose: $('recordClose'), recordTitle: $('recordTitle'),
    recordResult: $('recordResult'), recordRaw: $('recordRaw'), recordDate: $('recordDate'),
    recordScramble: $('recordScramble'), recordGroup: $('recordGroup'), recordAo5: $('recordAo5'),
    recordOk: $('recordOk'), recordPlus: $('recordPlus'), recordDnf: $('recordDnf'), recordFeedback: $('recordFeedback'),
    solverSrc: $('solver-src')
  };

  var state = 'BOOT';
  var currentView = 'timer';
  var records = [];
  var allRecords = [];
  var groups = [];
  var currentGroupId = window.StarCubeStore.defaultGroupId;
  var editingGroup = null;
  var groupsVersion = -1;
  var settings = { inspection: true };
  var nextId = 1;
  var memoryMode = false;
  var historyOpen = window.innerWidth >= 720;
  var store = null;
  var dataNotice = '';
  var dataVersion = 0;
  var statsVersion = -1;
  var historyVersion = -1;
  var historyDetailButtons = [];
  var recentVersion = -1;
  var recentDetailButtons = [];
  var historyLimit = 50;
  var netKey = undefined;
  var pendingStorageRefresh = false;
  var storageRefreshTimer = 0;
  var importing = false;
  var reviewOpen = true;
  var reviewLimit = 50;
  var reviewVersion = -1;
  var reviewData = null;
  var reviewSelectedUid = null;
  var selectedRecordUid = null;
  var recordReturnFocus = null;

  var currentScramble = null;
  var scrambleUsed = false;
  var generating = false;
  var genFailed = false;
  var genTimer = 0;
  var requestSerial = 0;
  var pendingRequestId = null;
  var activeScramble = null;

  var engineMode = 'worker';
  var engineReady = false;
  var engineFallback = false;
  var engineDead = false;
  var solverSource = '';
  var worker = null;
  var blobUrl = '';
  var initTimer = 0;

  var press = null;
  var holdTimer = 0;
  var readyFrom = '';
  var pointerId = null;
  var pointerGesture = null;
  var touchContacts = new Set();
  var touchGestureBlocked = false;
  var groupPointerSelection = false;
  var inspectStart = 0;
  var inspectionRaf = 0;
  var runStart = 0;
  var runPenalty = 'ok';
  var usedScramble = '';
  var runRaf = 0;

  function loadData() {
    var storage = null;
    try {
      storage = window.localStorage;
      var settingsRaw = storage.getItem(SETTINGS_KEY);
      var parsedSettings = settingsRaw ? JSON.parse(settingsRaw) : null;
      if (parsedSettings && typeof parsedSettings.inspection === 'boolean') settings.inspection = parsedSettings.inspection;
    } catch (err) {
      console.warn('设置读取失败，使用默认设置', err);
    }
    store = window.StarCubeStore.create({ storage: storage });
    try { currentGroupId = window.sessionStorage.getItem(SELECTION_KEY) || currentGroupId; } catch (err) {}
    readStore();
    el.groupForm.hidden = true;
  }

  function dataChanged() {
    dataVersion++;
    records = allRecords.filter(function (record) { return record.groupId === currentGroupId; });
    historyLimit = Math.max(50, historyLimit);
    nextId = allRecords.reduce(function (max, record) {
      return Math.max(max, record.id);
    }, 0) + 1;
    if (!Number.isSafeInteger(nextId)) {
      var ids = new Set(allRecords.map(function (record) { return record.id; }));
      nextId = 1;
      while (ids.has(nextId)) nextId++;
    }
  }

  function readStore() {
    var loaded = store.load();
    allRecords = loaded.records;
    groups = loaded.groups;
    if (!groups.some(function (group) { return group.id === currentGroupId; })) currentGroupId = window.StarCubeStore.defaultGroupId;
    memoryMode = !loaded.writable;
    dataNotice = loaded.notice || '';
    pendingStorageRefresh = false;
    dataChanged();
  }

  function saveRecord(record) {
    if (!record.uid) {
      record.uid = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
        'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    if (!memoryMode) {
      try { store.put(record); readStore(); return; }
      catch (err) {
        if (err.code === 'RECORD_DELETED') {
          readStore();
          el.feedback.textContent = '该成绩已在另一页面删除，列表已更新。';
          return;
        }
        setMemoryMode('记录写入失败');
      }
    }
    var index = allRecords.findIndex(function (item) { return item.uid === record.uid; });
    if (index < 0) allRecords.push(record); else allRecords[index] = record;
    allRecords.sort(window.StarCubeStore.compareRecords);
    dataChanged();
  }

  function persistSettings() {
    if (memoryMode) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      setMemoryMode('设置写入失败');
    }
  }

  function setMemoryMode(reason) {
    if (!memoryMode) console.warn('浏览器存储不可用，切换到内存模式：' + reason);
    memoryMode = true;
    dataNotice = reason + '；请导出备份，避免关闭页面后丢失本次成绩。';
  }

  function latestRecord() {
    return records.length ? records[records.length - 1] : null;
  }

  function canStart() {
    if (currentView !== 'timer' || importing || editingGroup !== null || selectedRecordUid) return false;
    if (state !== 'IDLE' && state !== 'STOPPED') return false;
    if (engineDead) return true;
    if (!engineReady || generating || genFailed) return false;
    if (!currentScramble || scrambleUsed) return false;
    return true;
  }

  function setTimer(text, color, empty) {
    el.timer.textContent = text;
    el.timer.style.color = color;
    el.timer.classList.toggle('is-empty', !!empty);
  }

  function render() {
    if (pendingStorageRefresh && !press && !activeScramble && state !== 'RUNNING' && !memoryMode) readStore();
    renderViews();
    renderStatus();
    renderScramblePanel();
    renderTimerAndPad();
    renderStats();
    renderHistory();
    renderRecent();
    renderActions();
    renderControls();
    renderGroups();
    renderReview();
    renderRecordDialog();
    el.storageBanner.textContent = (memoryMode ? '成绩不会被保存：' : '') + dataNotice;
    el.storageBanner.hidden = !memoryMode && !dataNotice;
  }

  function renderViews() {
    el.app.dataset.view = currentView;
    el.timerView.hidden = currentView !== 'timer';
    el.reviewView.hidden = currentView !== 'review';
    el.navTimer.setAttribute('aria-pressed', String(currentView === 'timer'));
    el.navReview.setAttribute('aria-pressed', String(currentView === 'review'));
  }

  function switchView(view) {
    if (!canChangeGroup() || editingGroup !== null || (view !== 'timer' && view !== 'review')) return;
    if (currentView !== view) {
      currentView = view;
      // Showing the panel precedes chart measurement. Hidden panels release their
      // expensive DOM through their normal render paths; model state stays live.
      render();
      window.scrollTo(0, 0);
    }
    if (view === 'timer') el.pad.focus({ preventScroll: true }); else el.reviewView.focus({ preventScroll: true });
  }

  function returnTimerFocus(event) {
    // Mouse/touch actions hand the next Space back to the timer. Keyboard and
    // assistive-technology clicks (detail = 0) retain normal control semantics.
    if (event && event.detail > 0 && currentView === 'timer' && canChangeGroup() && editingGroup === null) {
      el.pad.focus({ preventScroll: true });
    }
  }

  function renderStatus() {
    var text = '';
    var tone = '';
    if (state === 'RUNNING') {
      text = '计时中';
      tone = 'active';
    } else if (state === 'INSPECTING') {
      text = '观察中';
      tone = 'active';
    } else if (state === 'READY') {
      text = '按住';
      tone = 'active';
    } else if (engineDead) {
      text = '打乱不可用';
      tone = 'warn';
    } else if (!engineReady) {
      text = '初始化中…';
    } else if (generating) {
      text = '生成中…';
    } else if (genFailed) {
      text = '生成失败';
      tone = 'warn';
    } else if (state === 'IDLE') {
      text = '就绪';
    } else if (state === 'STOPPED') {
      text = '已停止';
    } else {
      text = '初始化中…';
    }
    el.status.textContent = text;
    el.status.dataset.tone = tone;
  }

  function renderScramblePanel() {
    var text = '—';
    var message = false;
    var hint = '';
    var showRetry = false;
    var facelets = null;

    if (activeScramble) {
      text = activeScramble.algorithm;
      facelets = activeScramble.facelets;
      hint = '本次打乱 · 已固定';
    } else if (engineDead) {
      text = '打乱不可用';
      message = true;
      hint = '仍可计时，记录中打乱显示 —';
    } else if (!engineReady || state === 'BOOT') {
      text = '打乱引擎初始化中…';
      message = true;
      hint = engineFallback ? '主线程初始化，可能卡顿数秒' : '首次初始化约需数秒';
    } else if (generating) {
      text = '生成中…';
      message = true;
      hint = '随机状态打乱生成中';
    } else if (genFailed) {
      text = '生成失败';
      message = true;
      hint = '打乱未就绪，按 N 或点击重试';
      showRetry = true;
    } else if (currentScramble) {
      text = currentScramble.algorithm;
      facelets = currentScramble.facelets;
      var canN = (state === 'IDLE' || state === 'STOPPED') && !scrambleUsed && !generating;
      hint = '随机状态 · ' + currentScramble.algorithm.split(' ').length + ' 步';
    }

    el.scrambleText.textContent = text;
    el.scrambleText.classList.toggle('is-message', message);
    el.scrambleHint.textContent = hint;
    el.retryBtn.hidden = !showRetry;
    el.newScrambleBtn.disabled = !!press || !!activeScramble || !engineReady || engineDead || generating ||
      (state !== 'IDLE' && state !== 'STOPPED');
    renderNet(facelets);
  }

  function renderNet(facelets) {
    if (facelets === netKey) return;
    netKey = facelets;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + NET_W + ' ' + NET_H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');

    var valid = typeof facelets === 'string' && /^[URFDLB]{54}$/.test(facelets);
    for (var f = 0; f < FACE_ORDER.length; f++) {
      var face = FACE_ORDER[f];
      var pos = NET_FACE_POS[face];
      var segment = valid ? facelets.slice(f * 9, f * 9 + 9) : null;
      for (var i = 0; i < 9; i++) {
        var col = i % 3;
        var row = Math.floor(i / 3);
        var rect = document.createElementNS(SVG_NS, 'rect');
        var x = (pos[0] + col) * (CELL + GAP);
        var y = (pos[1] + row) * (CELL + GAP);
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(CELL));
        rect.setAttribute('height', String(CELL));
        rect.setAttribute('rx', '1');
        rect.setAttribute('ry', '1');
        rect.setAttribute('fill', valid ? SOLVED_COLORS[segment.charAt(i)] : 'var(--line-soft)');
        svg.appendChild(rect);
      }
    }
    el.net.replaceChildren(svg);
  }

  function inspectionColor(elapsed, holding) {
    if (holding) return C.hold;
    if (elapsed >= 12000) return C.bad;
    if (elapsed >= 8000) return C.hold;
    return C.normal;
  }

  function updateInspectionDisplay() {
    if (!inspectStart) return;
    var elapsed = performance.now() - inspectStart;
    var seconds = Math.max(0, Math.ceil(elapsed / 1000));
    var holding = !!press && !press.suppressed && !press.ready;
    var penalty = Stats.inspectionPenalty(elapsed, true);
    el.pad.dataset.penalty = penalty;
    var mark = penalty === 'dnf' ? ' · DNF' : penalty === '+2' ? ' · +2' : '';
    setTimer(String(seconds), inspectionColor(elapsed, holding));
    if (holding) {
      el.subStatus.textContent = '按住，保持到变绿' + mark;
      return;
    }
    el.subStatus.textContent = '观察中' + mark + ' · 按住 0.3 秒起表';
  }

  function inspectionFrame() {
    if (state !== 'INSPECTING' && state !== 'READY') {
      inspectionRaf = 0;
      return;
    }
    if (state === 'INSPECTING') updateInspectionDisplay();
    if (state === 'READY') renderReadyHint();
    inspectionRaf = requestAnimationFrame(inspectionFrame);
  }

  function renderReadyHint() {
    var penalty = settings.inspection && inspectStart > 0 ? Stats.inspectionPenalty(performance.now() - inspectStart, true) : 'ok';
    el.pad.dataset.penalty = penalty;
    el.subStatus.textContent = '准备好了 · 松开起表' + (penalty === 'dnf' ? ' · DNF' : penalty === '+2' ? ' · +2' : '');
  }

  function idleHintText() {
    if (state === 'BOOT') return '打乱引擎初始化中…';
    if (engineDead) return '打乱不可用，仍可计时';
    if (generating) return (state === 'STOPPED' ? (memoryMode ? '已留在本页 · ' : '已保存 · ') : '') + '下一条打乱生成中…';
    if (genFailed) return '打乱生成失败，按 N 或点击重试';
    if (state === 'STOPPED') {
      return (memoryMode ? '已留在本页 · ' : '已保存 · ') + (settings.inspection ? '空格 / 轻点进入观察' : '按住 0.3 秒开始下一次');
    }
    return settings.inspection ? '空格 / 轻点进入 15 秒观察' : '按住 0.3 秒起表';
  }

  function renderTimerAndPad() {
    var latest = latestRecord();
    var holding = !!press && !press.suppressed && !press.ready;
    el.pad.dataset.state = holding && state !== 'INSPECTING' ? 'holding' : state.toLowerCase();
    if (state !== 'INSPECTING') el.pad.dataset.penalty = 'ok';
    el.cancelBtn.hidden = !(settings.inspection && (state === 'INSPECTING' || state === 'READY'));
    el.pbBadge.hidden = true;

    if (state === 'RUNNING') {
      setTimer(Stats.formatMs(performance.now() - runStart), C.white);
      el.subStatus.textContent = '空格 / 轻点停表';
      return;
    }
    if (state === 'READY') {
      setTimer('0.000', C.ready);
      renderReadyHint();
      return;
    }
    if (state === 'INSPECTING') {
      updateInspectionDisplay();
      return;
    }
    if (holding) {
      setTimer('0.000', C.hold);
      el.subStatus.textContent = '按住准备 · 保持 0.3 秒';
      return;
    }

    if (latest) {
      setTimer(Stats.formatResult(latest), latest.penalty === 'dnf' ? C.bad : C.normal);
    } else {
      setTimer('0.000', C.dim);
    }

    if (latest && records.length >= 2 && latest.penalty !== 'dnf' &&
        (state === 'IDLE' || state === 'STOPPED')) {
      var pb = Stats.personalBest(records);
      if (pb && Stats.effectiveMs(latest) === pb.value) {
        el.pbBadge.hidden = false;
      }
    }
    el.subStatus.textContent = idleHintText();
  }

  function setStatValue(node, value) {
    if (value === null) {
      node.textContent = '—';
      node.classList.remove('is-dnf');
      return;
    }
    if (value === 'DNF') {
      node.textContent = 'DNF';
      node.classList.add('is-dnf');
      return;
    }
    node.textContent = Stats.formatMs(value);
    node.classList.remove('is-dnf');
  }

  function renderStats() {
    if (statsVersion === dataVersion) return;
    statsVersion = dataVersion;
    setStatValue(el.ao5, Stats.aoN(records, 5));
    setStatValue(el.ao12, Stats.aoN(records, 12));
    setStatValue(el.ao50, Stats.aoN(records, 50));
    setStatValue(el.ao100, Stats.aoN(records, 100));
    setStatValue(el.avg, Stats.overallAverage(records));
    el.count.textContent = String(records.length);

    var pb = Stats.personalBest(records);
    if (pb) {
      el.pb.textContent = Stats.formatMs(pb.value) + (pb.record.penalty === '+2' ? '+' : '');
      el.pb.classList.remove('is-dnf');
    } else {
      el.pb.textContent = '—';
      el.pb.classList.remove('is-dnf');
    }
    setStatValue(el.bestAo5, Stats.bestAo5(records));
    var globalBest = Stats.personalBest(allRecords);
    setStatValue(el.globalPb, globalBest ? globalBest.value : null);
    [[el.coreAo5, el.ao5], [el.coreAo12, el.ao12], [el.corePb, el.pb],
      [el.coreCount, el.count], [el.coreGlobalPb, el.globalPb]].forEach(function (pair) {
      pair[0].textContent = pair[1].textContent;
      pair[0].classList.toggle('is-dnf', pair[1].textContent === 'DNF');
    });
  }

  function formatAt(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    function pad(value) { return String(value).padStart(2, '0'); }
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
      pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function renderHistory() {
    el.historyCount.textContent = String(records.length);
    el.historyEmpty.hidden = records.length > 0;
    el.historyMore.hidden = !historyOpen || records.length <= historyLimit;
    el.historyMore.textContent = '再显示 50 条 · 已显示 ' + Math.min(historyLimit, records.length) + ' / ' + records.length;
    if (currentView !== 'review' || !historyOpen) {
      if (historyVersion !== -1) { el.historyList.replaceChildren(); historyDetailButtons = []; historyVersion = -1; }
      return;
    }
    if (historyVersion === dataVersion) return;
    historyVersion = dataVersion;
    var scrollTop = el.historyBody.scrollTop;
    var fragment = document.createDocumentFragment();
    historyDetailButtons = [];
    for (var i = records.length - 1; i >= Math.max(0, records.length - historyLimit); i--) {
      var record = records[i];
      var item = document.createElement('li');
      item.className = 'history-item';

      var top = document.createElement('div');
      top.className = 'history-top';

      var id = document.createElement('span');
      id.className = 'history-id';
      id.textContent = '#' + (i + 1);

      var result = document.createElement('button');
      result.type = 'button';
      result.className = 'history-result history-detail' + (record.penalty === 'dnf' ? ' is-dnf' : '');
      result.setAttribute('data-record-uid', record.uid);
      result.setAttribute('aria-label', '第 ' + (i + 1) + ' 次，' + Stats.formatResult(record) + '，查看详情与罚时');
      result.disabled = !canChangeGroup() || editingGroup !== null;
      historyDetailButtons.push(result);
      result.textContent = Stats.formatResult(record);

      top.appendChild(id);
      top.appendChild(result);
      if (i === records.length - 1) {
        var newest = document.createElement('span');
        newest.className = 'history-latest';
        newest.textContent = '最新';
        top.appendChild(newest);
      }

      var at = document.createElement('span');
      at.className = 'history-at';
      at.textContent = formatAt(record.at);
      top.appendChild(at);

      var scramble = document.createElement('div');
      scramble.className = 'history-scramble';
      scramble.textContent = record.scramble || '—';

      item.appendChild(top);
      item.appendChild(scramble);
      fragment.appendChild(item);
    }
    el.historyList.replaceChildren(fragment);
    el.historyBody.scrollTop = scrollTop;
  }

  function renderRecent() {
    el.recentEmpty.hidden = records.length > 0;
    if (recentVersion === dataVersion) return;
    recentVersion = dataVersion;
    var fragment = document.createDocumentFragment();
    recentDetailButtons = [];
    for (var i = records.length - 1; i >= Math.max(0, records.length - 5); i--) {
      var record = records[i];
      var item = document.createElement('li');
      item.className = 'recent-item';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-result' + (record.penalty === 'dnf' ? ' is-dnf' : '');
      button.setAttribute('data-record-uid', record.uid);
      button.setAttribute('aria-label', '第 ' + (i + 1) + ' 次，' + Stats.formatResult(record) + '，查看详情与罚时');
      var number = document.createElement('span'); number.className = 'recent-number'; number.textContent = '#' + (i + 1);
      var value = document.createElement('span'); value.className = 'recent-value'; value.textContent = Stats.formatResult(record);
      var time = document.createElement('span'); time.className = 'recent-at'; time.textContent = formatAt(record.at);
      button.append(number, value, time);
      recentDetailButtons.push(button);
      item.appendChild(button);
      fragment.appendChild(item);
    }
    el.recentList.replaceChildren(fragment);
  }

  function renderActions() {
    var latest = latestRecord();
    var show = (state === 'STOPPED' || state === 'IDLE') && !press && !activeScramble && !importing && !!latest;
    el.actions.hidden = !show;
    if (!show) return;
    var plus = latest.penalty === '+2';
    var dnf = latest.penalty === 'dnf';
    el.plusBtn.classList.toggle('is-active', plus);
    el.plusBtn.setAttribute('aria-pressed', String(plus));
    el.dnfBtn.classList.toggle('is-active', dnf);
    el.dnfBtn.setAttribute('aria-pressed', String(dnf));
  }

  function renderControls() {
    el.switchBtn.setAttribute('aria-checked', String(settings.inspection));
    var canToggle = canChangeGroup() && editingGroup === null;
    historyDetailButtons.forEach(function (button) { button.disabled = !canToggle; });
    recentDetailButtons.forEach(function (button) { button.disabled = !canToggle; });
    [el.navTimer, el.navReview, el.recentReview].forEach(function (button) {
      button.disabled = !canToggle;
      button.title = canToggle ? '' : '请先完成当前操作';
    });
    el.switchBtn.disabled = !canToggle;
    el.switchBtn.title = canToggle ? '切换 15 秒观察' : '观察开关仅在就绪或停止后可切换';
    el.importBtn.disabled = !canToggle || memoryMode;
    el.exportBtn.disabled = state === 'RUNNING' || state === 'INSPECTING' || state === 'READY' || !!press || importing;
  }

  function canChangeGroup() {
    return (state === 'IDLE' || state === 'STOPPED') && !press && !activeScramble && !importing && !selectedRecordUid;
  }

  function renderGroups() {
    if (groupsVersion !== dataVersion) {
      groupsVersion = dataVersion;
      var fragment = document.createDocumentFragment();
      groups.forEach(function (group, index) {
        var option = document.createElement('option');
        option.value = group.id;
        var sameName = groups.filter(function (other) { return other.name === group.name; }).length > 1;
        option.textContent = group.name + (sameName ? ' · ' + (index + 1) : '');
        fragment.appendChild(option);
      });
      el.groupSelect.replaceChildren(fragment);
    }
    el.groupSelect.value = currentGroupId;
    var selected = groups.find(function (group) { return group.id === currentGroupId; });
    el.groupSelect.title = selected ? selected.name : '';
    el.timerGroupName.textContent = selected ? selected.name : '';
    var disabled = !canChangeGroup() || editingGroup !== null;
    el.groupSelect.disabled = disabled;
    el.groupNew.disabled = disabled;
    el.groupRename.disabled = disabled;
  }

  function selectGroup(id) {
    if (!canChangeGroup() || editingGroup !== null || !groups.some(function (group) { return group.id === id; })) {
      el.groupSelect.value = currentGroupId; return;
    }
    currentGroupId = id;
    try { window.sessionStorage.setItem(SELECTION_KEY, id); }
    catch (err) { el.feedback.textContent = '本页无法记住训练选择；刷新后可能恢复默认训练。'; }
    historyLimit = 50;
    reviewSelectedUid = null;
    el.historyBody.scrollTop = 0;
    dataChanged();
    render();
  }

  function openGroupEditor(rename) {
    if (!canChangeGroup() || editingGroup !== null) return;
    editingGroup = rename ? currentGroupId : '';
    el.groupLabel.textContent = rename ? '重命名训练' : '新建训练';
    el.groupName.value = rename ? groups.find(function (g) { return g.id === currentGroupId; }).name : '';
    el.groupError.textContent = '';
    el.groupForm.hidden = false;
    render();
    el.groupName.focus();
  }

  function closeGroupEditor() {
    editingGroup = null;
    el.groupForm.hidden = true;
    render();
    el.groupSelect.focus();
  }

  function saveGroup(event) {
    event.preventDefault();
    if (editingGroup === null || !canChangeGroup()) return;
    var group;
    try {
      var name = window.StarCubeStore.validateName(el.groupName.value);
      var existing = groups.find(function (g) { return g.id === editingGroup; });
      group = existing ? Object.assign({}, existing, { name: name }) :
        { id: window.StarCubeStore.newUid(), origin: window.StarCubeStore.newUid(), name: name };
      if (!memoryMode) {
        try { store.putGroup(group); readStore(); }
        catch (err) {
          if (err.code === 'GROUP_CONFLICT') throw err;
          setMemoryMode('训练分组写入失败');
        }
      }
      var index = groups.findIndex(function (g) { return g.id === group.id; });
      if (index < 0) groups.push(group); else groups[index] = group;
      closeGroupEditor();
      selectGroup(group.id);
      if (currentView === 'timer') el.pad.focus(); else el.groupSelect.focus();
      el.feedback.textContent = '已保存训练「' + group.name + '」' + (memoryMode ? '，请导出备份保存本页数据。' : '。');
    } catch (err) { el.groupError.textContent = err.message; el.groupName.focus(); }
  }

  function reviewValue(value) { return value === null ? '—' : value === 'DNF' ? 'DNF' : Stats.formatMs(value); }

  function renderReview() {
    el.reviewInspect.disabled = !canChangeGroup() || editingGroup !== null || !records.length;
    if (currentView !== 'review' || !reviewOpen) {
      if (reviewVersion !== -1) { el.reviewChart.replaceChildren(); el.reviewRecord.replaceChildren(); reviewVersion = -1; }
      return;
    }
    if (reviewVersion === dataVersion) return;
    reviewVersion = dataVersion;
    reviewData = Review.build(records, reviewLimit);
    var data = reviewData;
    el.reviewContent.hidden = !data.shown;
    el.reviewEmpty.hidden = !!data.shown;
    el.reviewSummary.textContent = data.shown ? '第 ' + (data.startIndex + 1) + '–' + data.total + ' 次 · 有效 ' + data.validCount + ' · DNF ' + data.dnfCount + ' · +2 ' + data.plus2Count : '本组还没有成绩';
    el.reviewAverage.textContent = reviewValue(data.average);
    el.reviewBest.textContent = reviewValue(data.best);
    if (!data.points.some(function (p) { return p.uid === reviewSelectedUid; })) {
      reviewSelectedUid = data.shown ? data.points[data.shown - 1].uid : null;
    }
    var options = document.createDocumentFragment();
    data.points.forEach(function (p) {
      var option = document.createElement('option');
      option.value = p.uid;
      option.textContent = '#' + p.number + ' · ' + Stats.formatResult(records[p.number - 1]) + ' · Ao5 ' + reviewValue(p.ao5);
      options.appendChild(option);
    });
    el.reviewRecord.replaceChildren(options);
    el.reviewRecord.value = reviewSelectedUid || '';
    drawReviewChart();
  }

  function drawReviewChart() {
    if (currentView !== 'review' || !reviewOpen) return;
    el.reviewChart.replaceChildren();
    if (!reviewData || !reviewData.shown) { el.reviewSelected.textContent = ''; return; }
    var points = reviewData.points;
    var width = Math.max(280, el.reviewChart.clientWidth || 760), height = Math.max(236, el.reviewChart.clientHeight || 236);
    var left = 74, right = width - 14, top = 22, bottom = height - 62, dnfY = height - 38;
    var values = [];
    points.forEach(function (p) { if (p.value !== null) values.push(p.value); if (typeof p.ao5 === 'number') values.push(p.ao5); });
    var minimum = values.length ? Math.min.apply(null, values) : 0;
    var maximum = values.length ? Math.max.apply(null, values) : 1000;
    var padding = Math.max(500, (maximum - minimum) * 0.12);
    minimum = Math.max(0, minimum - padding); maximum += padding;
    function x(i) { return points.length === 1 ? (left + right) / 2 : left + i * (right - left) / (points.length - 1); }
    function y(value) { return bottom - (value - minimum) / (maximum - minimum) * (bottom - top); }
    function mark(tag, attrs, text) {
      var node = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
      if (text !== undefined) node.textContent = text;
      el.reviewChart.appendChild(node); return node;
    }
    el.reviewChart.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    mark('title', { id: 'reviewChartTitle' }, '本组成绩趋势：单次实线，Ao5 虚线，越低越快');
    mark('desc', {}, '横轴为本组次数，纵轴为用时。DNF 在下方单独以叉号标记，不计为零。每次具体数值可在下方选择成绩查看。');
    for (var t = 0; t < 4; t++) {
      var value = minimum + (maximum - minimum) * t / 3, yy = y(value);
      mark('line', { x1: left, x2: right, y1: yy, y2: yy, 'class': 'review-grid' });
      mark('text', { x: left - 8, y: yy + 4, 'text-anchor': 'end', 'class': 'review-axis' }, Stats.formatMs(value));
    }
    mark('text', { x: left - 8, y: dnfY + 4, 'text-anchor': 'end', 'class': 'review-axis' }, 'DNF');
    mark('text', { x: x(0), y: height - 8, 'text-anchor': points.length === 1 ? 'middle' : 'start', 'class': 'review-axis' }, '#' + points[0].number);
    if (points.length > 1) mark('text', { x: right, y: height - 8, 'text-anchor': 'end', 'class': 'review-axis' }, '#' + points[points.length - 1].number);
    ['value', 'ao5'].forEach(function (key) {
      var path = '', connected = false;
      points.forEach(function (p, i) {
        if (typeof p[key] !== 'number') { connected = false; return; }
        path += (connected ? ' L' : ' M') + x(i).toFixed(2) + ',' + y(p[key]).toFixed(2); connected = true;
      });
      mark('path', { d: path.trim(), 'class': key === 'value' ? 'review-single' : 'review-ao5', 'data-series': key });
    });
    points.forEach(function (p, i) {
      if (typeof p.ao5 === 'number') mark('circle', { cx: x(i), cy: y(p.ao5), r: 2.5, 'class': 'review-ao5-dot' });
      if (p.value === null) {
        mark('path', { d: 'M' + (x(i)-3) + ',' + (dnfY-3) + 'l6,6m-6,0l6,-6', 'class': 'review-dnf', 'data-dnf': p.uid });
      } else mark('circle', { cx: x(i), cy: y(p.value), r: 2.5, 'class': 'review-dot' });
      if (p.uid === reviewSelectedUid) {
        var selectedY = p.value === null ? dnfY : y(p.value);
        mark('line', { x1: x(i), x2: x(i), y1: top, y2: dnfY + 8, 'class': 'review-cursor' });
        mark('circle', { cx: x(i), cy: selectedY, r: 6, 'class': 'review-selection' });
        el.reviewSelected.textContent = '#' + p.number + ' · ' + Stats.formatResult(records[p.number - 1]) + ' · Ao5 ' + reviewValue(p.ao5);
      }
    });
    if (!values.length) mark('text', { x: (left + right) / 2, y: 100, 'text-anchor': 'middle', 'class': 'review-axis' }, '暂无有效用时');
  }

  function openRecord(uid, trigger) {
    if (!canChangeGroup() || editingGroup !== null) return;
    if (!memoryMode) readStore();
    if (!records.some(function (record) { return record.uid === uid; })) { render(); return; }
    selectedRecordUid = uid;
    recordReturnFocus = trigger || document.activeElement;
    el.recordFeedback.textContent = '';
    render();
    el.recordDialog.showModal();
    el.recordClose.focus();
  }

  function closeRecord() {
    selectedRecordUid = null;
    if (el.recordDialog.open) el.recordDialog.close();
    render();
    var target = recordReturnFocus;
    recordReturnFocus = null;
    // The timer view returns directly to the next solve. Review keeps its browsing
    // position, or falls back to the history heading when an edited row was replaced.
    if (currentView === 'timer') el.pad.focus({ preventScroll: true });
    else if (target && target.isConnected && !target.disabled) target.focus();
    else el.historyToggle.focus();
  }

  function renderRecordDialog() {
    if (!selectedRecordUid) return;
    var index = records.findIndex(function (record) { return record.uid === selectedRecordUid; });
    if (index < 0) {
      el.feedback.textContent = '该成绩已不在当前训练中，详情已关闭。';
      closeRecord(); return;
    }
    var record = records[index];
    var group = groups.find(function (item) { return item.id === currentGroupId; });
    el.recordTitle.textContent = '第 ' + (index + 1) + ' 次成绩';
    el.recordGroup.textContent = group ? group.name : '';
    el.recordResult.textContent = Stats.formatResult(record);
    el.recordResult.classList.toggle('is-dnf', record.penalty === 'dnf');
    el.recordRaw.textContent = Stats.formatMs(record.ms);
    el.recordDate.textContent = new Date(record.at).toLocaleString('zh-CN', { hour12: false });
    el.recordScramble.textContent = record.scramble || '—';
    el.recordAo5.textContent = reviewValue(Stats.aoN(records.slice(Math.max(0, index - 4), index + 1), 5));
    [el.recordOk, el.recordPlus, el.recordDnf].forEach(function (button, i) {
      var active = record.penalty === ['ok', '+2', 'dnf'][i];
      button.setAttribute('aria-pressed', String(active)); button.classList.toggle('is-active', active);
    });
  }

  function setRecordPenalty(penalty) {
    if (!selectedRecordUid || !['ok', '+2', 'dnf'].includes(penalty) || press || activeScramble || importing || (state !== 'IDLE' && state !== 'STOPPED')) return;
    var uid = selectedRecordUid;
    if (!memoryMode) readStore();
    var record = records.find(function (item) { return item.uid === uid; });
    if (!record) { render(); return; }
    saveRecord(Object.assign({}, record, { penalty: penalty }));
    render();
    if (selectedRecordUid) el.recordFeedback.textContent = memoryMode ? '已在本页修改；请导出备份保存。' : '已保存，统计与曲线已更新。';
  }

  function activeIsReady() {
    return !!activeScramble && (engineDead || (!generating && !genFailed && !scrambleUsed &&
      currentScramble && activeScramble.requestId === currentScramble.requestId));
  }

  function freezeScramble() {
    activeScramble = currentScramble ? { algorithm: currentScramble.algorithm, facelets: currentScramble.facelets,
      requestId: currentScramble.requestId } : { algorithm: '—', facelets: null, requestId: null };
    activeScramble.groupId = currentGroupId;
  }

  function armHold() {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      holdTimer = 0;
      if (!press || press.suppressed || press.ready) return;
      if (state !== 'IDLE' && state !== 'STOPPED' && state !== 'INSPECTING') return;
      if (!activeIsReady()) { abortPress(); return; }
      press.ready = true;
      readyFrom = state;
      state = 'READY';
      render();
    }, HOLD_MS);
  }

  function beginPress(source) {
    if (state === 'RUNNING') {
      stopRun();
      press = { source: source, suppressed: true, ready: false };
      renderControls();
      return;
    }
    if (press) return;
    if (state === 'BOOT' || state === 'READY') return;

    if (state === 'INSPECTING') {
      press = { source: source, suppressed: false, ready: false };
      armHold();
      renderTimerAndPad();
      return;
    }
    if (state === 'IDLE' || state === 'STOPPED') {
      if (!canStart()) return;
      freezeScramble();
      if (settings.inspection) {
        press = { source: source, suppressed: true, ready: false };
        startInspection(performance.now());
      } else {
        press = { source: source, suppressed: false, ready: false };
        armHold();
        render();
      }
    }
  }

  function endPress(source) {
    if (!press || press.source !== source) return;
    var current = press;
    press = null;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
    if (current.ready) {
      startRun();
      return;
    }
    if (state !== 'INSPECTING') activeScramble = null;
    render();
  }

  function abortPress() {
    var oldPointer = pointerId;
    pointerId = null;
    pointerGesture = null;
    if (oldPointer !== null) { try { el.pad.releasePointerCapture(oldPointer); } catch (err) {} }
    if (!press) return;
    var current = press;
    press = null;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = 0;
    }
    if (current.ready && state === 'READY') {
      state = readyFrom || 'IDLE';
      readyFrom = '';
    }
    if (state !== 'INSPECTING' && state !== 'RUNNING') activeScramble = null;
    render();
  }

  function startInspection(now) {
    state = 'INSPECTING';
    inspectStart = now;
    cancelAnimationFrame(inspectionRaf);
    inspectionRaf = requestAnimationFrame(inspectionFrame);
    render();
  }

  function cancelInspection() {
    if (state !== 'INSPECTING' && state !== 'READY') return;
    cancelAnimationFrame(inspectionRaf);
    inspectionRaf = 0;
    inspectStart = 0;
    readyFrom = '';
    activeScramble = null;
    if (press) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = 0;
      }
      press = null;
    }
    state = 'IDLE';
    render();
  }

  function startRun() {
    if (state !== 'READY' || !activeIsReady()) {
      cancelInspection();
      return;
    }
    var now = performance.now();
    var penalty = 'ok';
    if (settings.inspection && inspectStart > 0) {
      penalty = Stats.inspectionPenalty(now - inspectStart, true);
    }
    state = 'RUNNING';
    runStart = now;
    runPenalty = penalty;
    scrambleUsed = true;
    usedScramble = activeScramble.algorithm;
    inspectStart = 0;
    readyFrom = '';
    cancelAnimationFrame(inspectionRaf);
    inspectionRaf = 0;
    press = null;
    render();
    cancelAnimationFrame(runRaf);
    runRaf = requestAnimationFrame(runFrame);
  }

  function runFrame() {
    if (state !== 'RUNNING') {
      runRaf = 0;
      return;
    }
    el.timer.textContent = Stats.formatMs(performance.now() - runStart);
    el.timer.style.color = C.white;
    runRaf = requestAnimationFrame(runFrame);
  }

  function stopRun() {
    if (state !== 'RUNNING') return;
    var ms = Math.max(0, Math.round(performance.now() - runStart));
    cancelAnimationFrame(runRaf);
    runRaf = 0;
    var record = {
      id: nextId++,
      groupId: activeScramble.groupId,
      ms: ms,
      penalty: runPenalty,
      scramble: usedScramble || '—',
      at: new Date().toISOString()
    };
    saveRecord(record);
    state = 'STOPPED';
    runStart = 0;
    runPenalty = 'ok';
    usedScramble = '';
    activeScramble = null;
    render();
    requestScramble(true);
  }

  function isValidAlgorithm(algorithm) {
    var moves = algorithm.split(' ');
    if (moves.length < 1 || moves.length > 22) return false;
    for (var i = 0; i < moves.length; i++) {
      if (!ALG_RE.test(moves[i])) return false;
    }
    return true;
  }

  function acceptScramble(data) {
    if (!generating || pendingRequestId === null || !data || data.requestId !== pendingRequestId ||
        activeScramble || (press && !(state === 'STOPPED' && press.suppressed)) ||
        (state !== 'BOOT' && state !== 'IDLE' && state !== 'STOPPED')) return;
    if (genTimer) {
      clearTimeout(genTimer);
      genTimer = 0;
    }
    var algorithm = String((data && data.algorithm) || '').replace(/\s+/g, ' ').trim();
    var facelets = String((data && data.facelets) || '');
    if (!isValidAlgorithm(algorithm) || !/^[URFDLB]{54}$/.test(facelets)) {
      onGenFailure(new Error('打乱数据校验失败'));
      return;
    }
    for (var faceIndex = 0; faceIndex < FACE_ORDER.length; faceIndex++) {
      var letter = FACE_ORDER[faceIndex];
      if (facelets.charAt(faceIndex * 9 + 4) !== letter || facelets.split(letter).length - 1 !== 9) {
        onGenFailure(new Error('打乱配色数据校验失败'));
        return;
      }
    }
    generating = false;
    genFailed = false;
    currentScramble = { algorithm: algorithm, facelets: facelets, requestId: pendingRequestId };
    pendingRequestId = null;
    scrambleUsed = false;
    if (state === 'BOOT') state = 'IDLE';
    render();
  }

  function onGenFailure(err, requestId) {
    if (requestId !== undefined && requestId !== pendingRequestId) return;
    if (activeScramble || (press && !(state === 'STOPPED' && press.suppressed)) || !generating) return;
    if (genTimer) {
      clearTimeout(genTimer);
      genTimer = 0;
    }
    console.warn('打乱生成失败：' + (err && err.message ? err.message : err));
    generating = false;
    pendingRequestId = null;
    genFailed = true;
    currentScramble = null;
    scrambleUsed = false;
    if (state === 'BOOT') state = 'IDLE';
    render();
  }

  function requestScramble(force) {
    if (engineDead || generating || !engineReady || press || activeScramble) return;
    if (state === 'RUNNING' || state === 'INSPECTING' || state === 'READY') return;
    if (!force && scrambleUsed) return;
    generating = true;
    var requestId = ++requestSerial;
    pendingRequestId = requestId;
    genFailed = false;
    render();
    genTimer = setTimeout(function () {
      genTimer = 0;
      if (!generating || pendingRequestId !== requestId) return;
      console.warn('打乱生成超时');
      generating = false;
      pendingRequestId = null;
      genFailed = true;
      currentScramble = null;
      scrambleUsed = false;
      if (state === 'BOOT') state = 'IDLE';
      render();
    }, GEN_TIMEOUT);

    if (engineMode === 'worker') {
      if (!worker) {
        onGenFailure(new Error('Worker 不可用'));
        return;
      }
      try {
        worker.postMessage({ cmd: 'scramble', requestId: requestId });
      } catch (err) {
        onGenFailure(err);
      }
      return;
    }

    setTimeout(function () {
      if (!generating || pendingRequestId !== requestId) return;
      try {
        var result = self.StarCubeSolver.scramble();
        if (!generating || pendingRequestId !== requestId) return;
        result.requestId = requestId;
        acceptScramble(result);
      } catch (err) {
        onGenFailure(err);
      }
    }, 0);
  }

  function handleWorkerMessage(event) {
    var data = event.data || {};
    if (data.cmd === 'ready') {
      if (engineReady || engineMode !== 'worker') return;
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = 0;
      }
      engineReady = true;
      engineMode = 'worker';
      render();
      requestScramble(false);
      return;
    }
    if (data.cmd === 'scramble') {
      acceptScramble(data);
      return;
    }
    if (data.cmd === 'error') {
      if (!engineReady) {
        fallbackToMain(data.message || 'Worker 初始化失败');
      } else {
        onGenFailure(new Error(data.message || 'Worker 运行错误'), data.requestId);
      }
    }
  }

  function handleWorkerError(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!engineReady) {
      fallbackToMain('Worker 启动失败');
    } else {
      onGenFailure(new Error('Worker 运行错误'));
    }
  }

  function fallbackToMain(reason) {
    if (engineReady || engineMode === 'main' || engineMode === 'dead') return;
    console.warn('Worker 不可用，改用主线程：' + reason);
    engineMode = 'main';
    engineFallback = true;
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = 0;
    }
    if (worker) {
      try { worker.terminate(); } catch (err) {}
      worker = null;
    }
    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch (err) {}
      blobUrl = '';
    }
    render();

    setTimeout(function () {
      if (engineMode !== 'main' || engineReady) return;
      try {
        new Function(solverSource)();
        if (!self.StarCubeSolver || typeof self.StarCubeSolver.init !== 'function') {
          throw new Error('求解器加载失败');
        }
        self.StarCubeSolver.init();
        engineReady = true;
        engineFallback = false;
        render();
        requestScramble(false);
      } catch (err) {
        console.warn('主线程初始化失败：' + (err && err.message ? err.message : err));
        engineMode = 'dead';
        engineDead = true;
        engineReady = false;
        engineFallback = false;
        generating = false;
        currentScramble = null;
        if (state === 'BOOT') state = 'IDLE';
        render();
      }
    }, 60);
  }

  function bootSolver() {
    solverSource = el.solverSrc ? el.solverSrc.textContent : '';
    if (!solverSource || solverSource.length < 1000) {
      engineMode = 'dead';
      engineDead = true;
      if (state === 'BOOT') state = 'IDLE';
      render();
      return;
    }
    var url;
    try {
      url = URL.createObjectURL(new Blob([solverSource], { type: 'text/javascript' }));
    } catch (err) {
      fallbackToMain('Blob 创建失败');
      return;
    }
    try {
      worker = new Worker(url);
    } catch (err) {
      try { URL.revokeObjectURL(url); } catch (revokeErr) {}
      fallbackToMain('Worker 创建失败');
      return;
    }
    blobUrl = url;
    worker.onmessage = handleWorkerMessage;
    worker.onerror = handleWorkerError;
    worker.onmessageerror = handleWorkerError;
    try {
      worker.postMessage({ cmd: 'init' });
    } catch (err) {
      fallbackToMain('Worker 通信失败');
      return;
    }
    initTimer = setTimeout(function () {
      initTimer = 0;
      if (!engineReady) fallbackToMain('初始化超时');
    }, INIT_TIMEOUT);
  }

  function togglePenalty(kind) {
    if (currentView !== 'timer' || selectedRecordUid) return;
    if ((state !== 'STOPPED' && state !== 'IDLE') || press || activeScramble || importing || !records.length) return;
    var uid = latestRecord().uid;
    if (!memoryMode) readStore();
    var existing = records.find(function (item) { return item.uid === uid; });
    if (!existing) { render(); return; }
    var record = Object.assign({}, existing);
    if (kind === '+2') {
      record.penalty = record.penalty === '+2' ? 'ok' : '+2';
    } else {
      record.penalty = record.penalty === 'dnf' ? 'ok' : 'dnf';
    }
    saveRecord(record);
    render();
  }

  function deleteLatest() {
    if (currentView !== 'timer' || selectedRecordUid) return;
    if ((state !== 'STOPPED' && state !== 'IDLE') || press || activeScramble || importing || !records.length) return;
    var uid = latestRecord().uid;
    if (!memoryMode) {
      try { store.remove(uid); readStore(); render(); return; }
      catch (err) { setMemoryMode('删除结果未能保存'); }
    }
    allRecords = allRecords.filter(function (item) { return item.uid !== uid; });
    dataChanged();
    render();
  }

  function toggleInspection() {
    if (selectedRecordUid) return;
    if ((state !== 'IDLE' && state !== 'STOPPED') || press || activeScramble) return;
    settings.inspection = !settings.inspection;
    persistSettings();
    render();
  }

  function newScramble() {
    if (currentView !== 'timer' || selectedRecordUid) return;
    if (press || activeScramble) return;
    if (state !== 'IDLE' && state !== 'STOPPED') return;
    if (engineDead || !engineReady || generating) return;
    if (genFailed) {
      requestScramble(true);
      return;
    }
    if (!currentScramble) {
      requestScramble(true);
      return;
    }
    if (scrambleUsed) return;
    requestScramble(true);
  }

  function trackTouchStart(event) {
    if (event.pointerType !== 'touch') return;
    touchContacts.add(event.pointerId);
    if (touchContacts.size > 1) {
      touchGestureBlocked = true;
      abandonPointerGesture();
    }
  }

  function releaseTouchContact(event) {
    if (event.pointerType !== 'touch') return;
    touchContacts.delete(event.pointerId);
    if (!touchContacts.size) touchGestureBlocked = false;
  }

  function abandonPointerGesture() {
    var oldPointer = pointerId;
    pointerId = null;
    pointerGesture = null;
    // A cancelled first touch must not leave the observation it just started
    // running. A later cancelled preparation preserves an existing observation.
    if (state === 'INSPECTING' && press && press.source === 'pointer' && press.suppressed) cancelInspection();
    else if (press && press.source === 'pointer') abortPress();
    if (oldPointer !== null) { try { el.pad.releasePointerCapture(oldPointer); } catch (err) {} }
  }

  function abortInput() {
    touchContacts.clear();
    touchGestureBlocked = false;
    abortPress();
  }

  function getPointerPress(event) {
    trackTouchStart(event);
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'touch' && (touchGestureBlocked || touchContacts.size > 1)) return;
    if (currentView !== 'timer' || selectedRecordUid || importing || editingGroup !== null) return;
    if (pointerId !== null) return;
    if (press && press.source !== 'pointer') return;
    pointerId = event.pointerId;
    pointerGesture = { x: event.clientX || 0, y: event.clientY || 0, type: event.pointerType };
    try { el.pad.setPointerCapture(event.pointerId); } catch (err) {}
    if (event.pointerType === 'mouse' && event.cancelable) event.preventDefault();
    beginPress('pointer');
  }

  function movePointer(event) {
    if (pointerId !== event.pointerId || !pointerGesture || pointerGesture.type === 'mouse') return;
    var dx = (event.clientX || 0) - pointerGesture.x, dy = (event.clientY || 0) - pointerGesture.y;
    if (dx * dx + dy * dy >= TOUCH_MOVE_PX * TOUCH_MOVE_PX) abandonPointerGesture();
  }

  function releasePointer(event) {
    releaseTouchContact(event);
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    pointerGesture = null;
    endPress('pointer');
    try { el.pad.releasePointerCapture(event.pointerId); } catch (err) {}
  }

  function cancelPointer(event) {
    if (event.type === 'pointercancel') releaseTouchContact(event);
    if (pointerId !== event.pointerId) return;
    abandonPointerGesture();
  }

  function exportData() {
    if (el.exportBtn.disabled) return;
    if (!memoryMode) readStore();
    var payload = { format: 'starcube', version: 3, exportedAt: new Date().toISOString(),
      groups: groups, records: allRecords, backups: store.backups() };
    try {
      var url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = 'starcube-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      el.feedback.textContent = '已导出全部 ' + groups.length + ' 个训练、' + allRecords.length + ' 条成绩及可恢复的原始备份。';
    } catch (err) { el.feedback.textContent = '导出失败：' + err.message; }
    render();
  }

  function importData() {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    if (el.importBtn.disabled || importing) { el.importFile.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) {
      el.feedback.textContent = '文件超过 10 MB，请拆分后导入。';
      el.importFile.value = '';
      return;
    }
    importing = true;
    el.feedback.textContent = '正在校验备份…';
    render();
    file.text().then(function (raw) {
      var result = store.importRecords(raw);
      readStore();
      el.feedback.textContent = '已导入 ' + result.added + ' 条，跳过 ' + result.skipped + ' 条重复或已删除成绩' +
        (result.conflicts ? '，保留 ' + result.conflicts + ' 条编号冲突成绩' : '') +
        '；新增 ' + result.groupsAdded + ' 个训练' +
        (result.groupConflicts ? '，另存 ' + result.groupConflicts + ' 个 ID 冲突训练' : '') +
        (result.recoveredGroups ? '，恢复 ' + result.recoveredGroups + ' 个缺失分组' : '') + '（同名训练保留独立身份）。';
    }).catch(function (err) {
      if (err.partial) readStore();
      el.feedback.textContent = '导入失败：' + err.message;
    }).finally(function () {
      importing = false;
      el.importFile.value = '';
      render();
    });
  }

  function bindEvents() {
    function editableTarget(event) {
      var target = event.target;
      return event.isComposing || (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)));
    }
    window.addEventListener('keydown', function (event) {
      if (selectedRecordUid) return;
      // A timer stop must still work when a control retained focus after a touch start.
      if (state === 'RUNNING' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.code === 'Space' || event.key === ' ')) {
        event.preventDefault();
        if (!event.repeat) beginPress('key');
        return;
      }
      if (currentView !== 'timer') return;
      if (editableTarget(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (event.repeat) return;
        beginPress('key');
        return;
      }
      if (event.key === 'Escape') {
        if (state === 'INSPECTING' || state === 'READY') {
          event.preventDefault();
          cancelInspection();
        }
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        newScramble();
        return;
      }
      if (event.key === '1' || event.key === '2') {
        event.preventDefault();
        if (event.repeat) return;
        togglePenalty(event.key === '1' ? '+2' : 'dnf');
      }
    });

    window.addEventListener('keyup', function (event) {
      if (selectedRecordUid) return;
      if (editableTarget(event) && !(press && press.source === 'key')) return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        endPress('key');
      }
    });

    window.addEventListener('blur', abortInput);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) abortInput();
    });

    window.addEventListener('pointerdown', trackTouchStart, true);
    el.pad.addEventListener('pointerdown', getPointerPress);
    el.pad.addEventListener('pointermove', movePointer);
    el.pad.addEventListener('pointerup', releasePointer);
    el.pad.addEventListener('pointercancel', cancelPointer);
    el.pad.addEventListener('lostpointercapture', cancelPointer);
    el.pad.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', cancelPointer);

    el.navTimer.addEventListener('click', function () { switchView('timer'); });
    el.navReview.addEventListener('click', function () { switchView('review'); });
    el.recentReview.addEventListener('click', function () { switchView('review'); });
    el.recentList.addEventListener('click', function (event) {
      if (currentView !== 'timer') return;
      var button = event.target.closest('[data-record-uid]');
      if (button) openRecord(button.getAttribute('data-record-uid'), button);
    });
    el.switchBtn.addEventListener('click', function (event) { toggleInspection(); returnTimerFocus(event); });
    el.groupSelect.addEventListener('pointerdown', function () { groupPointerSelection = true; });
    el.groupSelect.addEventListener('keydown', function () { groupPointerSelection = false; });
    el.groupSelect.addEventListener('change', function () {
      selectGroup(el.groupSelect.value);
      if (groupPointerSelection) returnTimerFocus({ detail: 1 });
      groupPointerSelection = false;
    });
    el.groupNew.addEventListener('click', function () { openGroupEditor(false); });
    el.groupRename.addEventListener('click', function () { openGroupEditor(true); });
    el.groupForm.addEventListener('submit', saveGroup);
    el.groupCancel.addEventListener('click', closeGroupEditor);
    el.groupName.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeGroupEditor(); }
    });
    el.plusBtn.addEventListener('click', function (event) { togglePenalty('+2'); returnTimerFocus(event); });
    el.dnfBtn.addEventListener('click', function (event) { togglePenalty('dnf'); returnTimerFocus(event); });
    el.deleteBtn.addEventListener('click', function (event) { deleteLatest(); returnTimerFocus(event); });
    el.cancelBtn.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    el.cancelBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      cancelInspection();
      returnTimerFocus(event);
    });
    el.retryBtn.addEventListener('click', function (event) {
      if (!engineDead && engineReady && !generating) requestScramble(true);
      returnTimerFocus(event);
    });
    el.newScrambleBtn.addEventListener('click', function (event) { newScramble(); returnTimerFocus(event); });
    el.exportBtn.addEventListener('click', exportData);
    el.importBtn.addEventListener('click', function () { if (!el.importBtn.disabled) el.importFile.click(); });
    el.importFile.addEventListener('change', importData);
    el.historyToggle.addEventListener('click', function () {
      if (currentView !== 'review') return;
      historyOpen = !historyOpen;
      el.historyBody.hidden = !historyOpen;
      el.historyToggle.setAttribute('aria-expanded', String(historyOpen));
      renderHistory();
    });
    el.historyMore.addEventListener('click', function () {
      if (currentView !== 'review' || !historyOpen) return;
      historyLimit += 50;
      historyVersion = -1;
      renderHistory();
    });
    el.historyList.addEventListener('click', function (event) {
      if (currentView !== 'review') return;
      var button = event.target.closest('[data-record-uid]');
      if (button) openRecord(button.getAttribute('data-record-uid'), button);
    });
    el.reviewToggle.addEventListener('click', function () {
      if (currentView !== 'review') return;
      reviewOpen = !reviewOpen;
      el.reviewBody.hidden = !reviewOpen;
      el.reviewToggle.setAttribute('aria-expanded', String(reviewOpen));
      renderReview();
    });
    el.reviewRange.addEventListener('change', function () {
      reviewLimit = el.reviewRange.value === '100' ? 100 : 50;
      reviewVersion = -1; renderReview();
    });
    el.reviewRecord.addEventListener('change', function () {
      reviewSelectedUid = el.reviewRecord.value; drawReviewChart();
    });
    el.reviewInspect.addEventListener('click', function () { if (currentView === 'review' && reviewOpen) openRecord(reviewSelectedUid, el.reviewInspect); });
    el.reviewChart.addEventListener('click', function (event) {
      if (!reviewData || !reviewData.shown) return;
      var rect = el.reviewChart.getBoundingClientRect();
      var width = Math.max(280, el.reviewChart.clientWidth || 760);
      var horizontal = (event.clientX - rect.left) * width / rect.width;
      var i = Math.round((horizontal - 74) / (width - 88) * (reviewData.shown - 1));
      i = Math.max(0, Math.min(reviewData.shown - 1, i));
      reviewSelectedUid = reviewData.points[i].uid;
      el.reviewRecord.value = reviewSelectedUid; drawReviewChart();
    });
    window.addEventListener('resize', function () { if (currentView === 'review' && reviewOpen) drawReviewChart(); });
    el.recordClose.addEventListener('click', closeRecord);
    el.recordDialog.addEventListener('cancel', function (event) { event.preventDefault(); closeRecord(); });
    el.recordDialog.addEventListener('close', function () { if (!el.recordDialog.open && selectedRecordUid) closeRecord(); });
    el.recordOk.addEventListener('click', function () { setRecordPenalty('ok'); });
    el.recordPlus.addEventListener('click', function () { setRecordPenalty('+2'); });
    el.recordDnf.addEventListener('click', function () { setRecordPenalty('dnf'); });
    window.addEventListener('storage', function (event) {
      var key = event.key;
      if (key && key !== RECORDS_KEY && key.indexOf('starcube.records.v2.item.') !== 0 &&
          key.indexOf('starcube.records.v2.deleted.') !== 0 && key.indexOf(window.StarCubeStore.keys.groupPrefix) !== 0) return;
      pendingStorageRefresh = true;
      clearTimeout(storageRefreshTimer);
      storageRefreshTimer = setTimeout(function () { render(); }, 40);
    });
  }

  loadData();
  el.historyBody.hidden = !historyOpen;
  el.historyToggle.setAttribute('aria-expanded', String(historyOpen));
  el.reviewBody.hidden = !reviewOpen;
  el.reviewToggle.setAttribute('aria-expanded', String(reviewOpen));
  bindEvents();
  render();
  bootSolver();
})();
