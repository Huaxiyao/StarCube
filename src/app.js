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
  var THEMES = ['light', 'warm', 'dark'];
  var THEME_META = {
    light: { label: '纯净纸白', shortLabel: '纸白', colorScheme: 'light', themeColor: '#f3f4f6' },
    warm: { label: '复古暖纸', shortLabel: '暖纸', colorScheme: 'light', themeColor: '#efe6d5' },
    dark: { label: '极简曜黑', shortLabel: '曜黑', colorScheme: 'dark', themeColor: '#0c0f14' }
  };
  var TOAST_MS = 2000;
  var TOAST_LEAVE_MS = 160;
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
  var SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  var MOVE_CYCLES = {
    U: [[0, 2, 8, 6], [1, 5, 7, 3], [18, 36, 45, 9], [19, 37, 46, 10], [20, 38, 47, 11]],
    R: [[9, 11, 17, 15], [10, 14, 16, 12], [20, 2, 51, 29], [23, 5, 48, 32], [26, 8, 45, 35]],
    F: [[18, 20, 26, 24], [19, 23, 25, 21], [6, 9, 29, 44], [7, 12, 28, 41], [8, 15, 27, 38]],
    D: [[27, 29, 35, 33], [28, 32, 34, 30], [24, 15, 51, 42], [25, 16, 52, 43], [26, 17, 53, 44]],
    L: [[36, 38, 44, 42], [37, 41, 43, 39], [0, 18, 27, 53], [3, 21, 30, 50], [6, 24, 33, 47]],
    B: [[45, 47, 53, 51], [46, 50, 52, 48], [2, 36, 33, 17], [1, 39, 34, 14], [0, 42, 35, 11]]
  };

  function $(id) { return document.getElementById(id); }

  var el = {
    app: $('app'), navTimer: $('navTimer'), navReview: $('navReview'),
    timerView: $('timerView'), reviewView: $('reviewView'), recentReview: $('recentReview'),
    timerGroupName: $('timerGroupName'), coreAo5: $('coreAo5'), coreAo12: $('coreAo12'),
    corePb: $('corePb'), coreCount: $('coreCount'), coreGlobalPb: $('coreGlobalPb'),
    recentList: $('recentList'), recentEmpty: $('recentEmpty'),
    themeToggle: $('themeToggle'), themeLabel: $('themeLabel'),
    metaColorScheme: $('metaColorScheme'), metaThemeColor: $('metaThemeColor'),
    toast: $('toast'),
    status: $('status'),
    switchBtn: $('inspectionToggle'),
    storageBanner: $('storageBanner'),
    scrambleText: $('scrambleText'),
    scrambleHint: $('scrambleHint'),
    retryBtn: $('retryBtn'),
    copyScrambleBtn: $('copyScramble'),
    newScrambleBtn: $('newScramble'),
    exportBtn: $('exportData'),
    importBtn: $('importData'),
    importFile: $('importFile'),
    feedback: $('dataFeedback'),
    soundToggle: $('soundToggle'), soundPreview: $('soundPreview'), soundFeedback: $('soundFeedback'),
    backupReminder: $('backupReminder'), backupMessage: $('backupMessage'), backupLater: $('backupLater'), backupExport: $('backupExport'), backupStatus: $('backupStatus'),
    coreAo5Detail: $('coreAo5Detail'), coreAo12Detail: $('coreAo12Detail'), ao5Detail: $('ao5Detail'), ao12Detail: $('ao12Detail'),
    averageDialog: $('averageDialog'), averageClose: $('averageClose'), averageContinue: $('averageContinue'), averageTitle: $('averageTitle'), averageGroup: $('averageGroup'),
    averageResult: $('averageResult'), averageFormula: $('averageFormula'), averageRows: $('averageRows'),
    corePbDetail: $('corePbDetail'), pbDetail: $('pbDetail'), bestAo5Detail: $('bestAo5Detail'),
    coreGlobalPbDetail: $('coreGlobalPbDetail'), globalPbDetail: $('globalPbDetail'),
    undoNotice: $('undoNotice'), undoMessage: $('undoMessage'), undoDelete: $('undoDelete'),
    recordUndoNotice: $('recordUndoNotice'), recordUndoMessage: $('recordUndoMessage'), recordUndo: $('recordUndo'),
    averageUndoNotice: $('averageUndoNotice'), averageUndoMessage: $('averageUndoMessage'), averageUndo: $('averageUndo'),
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
    groupDelete: $('groupDelete'),
    groupForm: $('groupForm'),
    groupName: $('groupName'),
    groupSave: $('groupSave'),
    groupCancel: $('groupCancel'),
    groupError: $('groupError'),
    groupLabel: $('groupNameLabel'),
    groupDeleteDialog: $('groupDeleteDialog'),
    groupDeleteTitle: $('groupDeleteTitle'),
    groupDeleteClose: $('groupDeleteClose'),
    groupDeleteMessage: $('groupDeleteMessage'),
    groupDeleteTip: $('groupDeleteTip'),
    groupDeleteFeedback: $('groupDeleteFeedback'),
    groupDeleteExport: $('groupDeleteExport'),
    groupDeleteConfirm: $('groupDeleteConfirm'),
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
    historyTitle: $('historyTitle'), historyScope: $('historyScope'), historyScopeBar: $('historyScopeBar'),
    historyAll: $('historyAll'), exportHistoryCsv: $('exportHistoryCsv'), reviewHistory: $('reviewHistory'),
    reviewToggle: $('reviewToggle'), reviewBody: $('reviewBody'), reviewRange: $('reviewRange'),
    reviewChart: $('reviewChart'), reviewSummary: $('reviewSummary'), reviewEmpty: $('reviewEmpty'),
    reviewContent: $('reviewContent'), reviewAverage: $('reviewAverage'), reviewBest: $('reviewBest'),
    reviewMetrics: $('reviewMetrics'), reviewComparison: $('reviewComparison'), reviewPeriod: $('reviewPeriod'),
    reviewCurrentLabel: $('reviewCurrentLabel'), reviewPreviousLabel: $('reviewPreviousLabel'), reviewCompareNote: $('reviewCompareNote'),
    compareCountCurrent: $('compareCountCurrent'), compareCountPrevious: $('compareCountPrevious'), compareCountDelta: $('compareCountDelta'),
    compareAverageCurrent: $('compareAverageCurrent'), compareAveragePrevious: $('compareAveragePrevious'), compareAverageDelta: $('compareAverageDelta'),
    compareStddevCurrent: $('compareStddevCurrent'), compareStddevPrevious: $('compareStddevPrevious'), compareStddevDelta: $('compareStddevDelta'),
    compareDnfCurrent: $('compareDnfCurrent'), compareDnfPrevious: $('compareDnfPrevious'), compareDnfDelta: $('compareDnfDelta'),
    reviewRecord: $('reviewRecord'), reviewInspect: $('reviewInspect'), reviewSelected: $('reviewSelected'),
    recordDialog: $('recordDialog'), recordClose: $('recordClose'), recordContinue: $('recordContinue'), recordTitle: $('recordTitle'),
    recordResult: $('recordResult'), recordRaw: $('recordRaw'), recordDate: $('recordDate'),
    recordScramble: $('recordScramble'), recordCopyScramble: $('recordCopyScramble'), recordReplayScramble: $('recordReplayScramble'),
    recordGroup: $('recordGroup'), recordAo5: $('recordAo5'),
    recordAo5Detail: $('recordAo5Detail'), recordDelete: $('recordDelete'),
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
  var deletingGroupId = null;
  var deleteGroupFocus = null;
  var groupsVersion = -1;
  var settings = { inspection: true, inspectionSound: false, reviewRange: '50', theme: 'light' };
  var toastLeaveTimer = 0;
  var toastHideTimer = 0;
  var backup = null;
  function showAudioStatus(status) {
    el.soundFeedback.textContent = status.message || '8 秒一声，12 秒两声';
    el.soundPreview.setAttribute('aria-busy', String(status.state === 'loading'));
  }
  var audio = window.StarCubeAudio.create({ AudioContext: window.AudioContext || window.webkitAudioContext, onStatus: showAudioStatus });
  var nextId = 1;
  var memoryMode = false;
  var historyOpen = window.innerWidth >= 720;
  var store = null;
  var dataNotice = '';
  var dataVersion = 0;
  var statsVersion = -1;
  var historyVersion = -1;
  var historyDataVersion = -1;
  var historyScopeKey = null;
  var historyDateKey = null;
  var historyEntries = [];
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
  var reviewTimeKey = null;
  var reviewRefreshTimer = 0;
  var reviewData = null;
  var reviewSelectedUid = null;
  var selectedRecordUid = null;
  var selectedAverage = null;
  var averageVersion = -1;
  var detailTrail = [];
  var detailRootFocus = null;
  var detailRootView = null;
  var detailRootScroll = null;
  var undoDeletions = [];
  var undoMessage = '';

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

  function normalizeTheme(value) {
    return typeof value === 'string' && THEMES.includes(value) ? value : 'light';
  }

  function applyTheme(theme) {
    var normalized = normalizeTheme(theme);
    settings.theme = normalized;
    var meta = THEME_META[normalized];
    var next = THEMES[(THEMES.indexOf(normalized) + 1) % THEMES.length];
    if (document.documentElement) {
      document.documentElement.dataset.theme = normalized;
      if (document.documentElement.style) document.documentElement.style.colorScheme = meta.colorScheme;
    }
    var colorSchemeMeta = el.metaColorScheme || (document.querySelector ? document.querySelector('meta[name="color-scheme"]') : null);
    if (colorSchemeMeta) colorSchemeMeta.setAttribute('content', meta.colorScheme);
    var themeColorMeta = el.metaThemeColor || (document.querySelector ? document.querySelector('meta[name="theme-color"]') : null);
    if (themeColorMeta) themeColorMeta.setAttribute('content', meta.themeColor);
    if (el.themeToggle) {
      el.themeToggle.dataset.theme = normalized;
      el.themeToggle.setAttribute('aria-label', '切换主题，当前：' + meta.label + '，点击切换为' + THEME_META[next].label);
      el.themeToggle.title = '当前主题：' + meta.label + '（点击切换为' + THEME_META[next].label + '）';
    }
    if (el.themeLabel) el.themeLabel.textContent = meta.shortLabel;
    var nativeBridge = typeof window !== 'undefined' && window.StarCubeNative;
    if (nativeBridge && typeof nativeBridge.setTheme === 'function') {
      try { nativeBridge.setTheme(meta.themeColor, meta.colorScheme === 'dark'); } catch (err) {}
    }
  }

  function clearToastTimers() {
    if (toastLeaveTimer) { clearTimeout(toastLeaveTimer); toastLeaveTimer = 0; }
    if (toastHideTimer) { clearTimeout(toastHideTimer); toastHideTimer = 0; }
  }

  function hideToast() {
    clearToastTimers();
    if (!el.toast) return;
    el.toast.classList.remove('is-leaving');
    el.toast.hidden = true;
    el.toast.textContent = '';
  }

  function showToast(message) {
    if (!el.toast || !message) return;
    clearToastTimers();
    el.toast.classList.remove('is-leaving');
    el.toast.hidden = true;
    el.toast.textContent = String(message);
    if (typeof el.toast.offsetWidth === 'number') void el.toast.offsetWidth;
    el.toast.hidden = false;
    toastLeaveTimer = setTimeout(function () {
      toastLeaveTimer = 0;
      if (el.toast && !el.toast.hidden) el.toast.classList.add('is-leaving');
    }, Math.max(0, TOAST_MS - TOAST_LEAVE_MS));
    toastHideTimer = setTimeout(function () {
      toastHideTimer = 0;
      hideToast();
    }, TOAST_MS);
  }

  function loadData() {
    var storage = null;
    try {
      storage = window.localStorage;
      var settingsRaw = storage.getItem(SETTINGS_KEY);
      var parsedSettings = settingsRaw ? JSON.parse(settingsRaw) : null;
      if (parsedSettings && typeof parsedSettings.inspection === 'boolean') settings.inspection = parsedSettings.inspection;
      if (parsedSettings && typeof parsedSettings.inspectionSound === 'boolean') settings.inspectionSound = parsedSettings.inspectionSound;
      if (parsedSettings && ['50', '100', 'today', '7days'].includes(parsedSettings.reviewRange)) settings.reviewRange = parsedSettings.reviewRange;
      settings.theme = normalizeTheme(parsedSettings && parsedSettings.theme);
    } catch (err) {
      settings.theme = 'light';
      console.warn('设置读取失败，使用默认设置', err);
    }
    applyTheme(settings.theme);
    store = window.StarCubeStore.create({ storage: storage });
    reviewLimit = settings.reviewRange === '100' ? 100 : settings.reviewRange === '50' ? 50 : settings.reviewRange;
    el.reviewRange.value = String(reviewLimit);
    backup = window.StarCubeBackup.create({ storage: storage, threshold: 100 });
    audio.setEnabled(settings.inspectionSound);
    showAudioStatus(audio.getStatus());
    try { currentGroupId = window.sessionStorage.getItem(SELECTION_KEY) || currentGroupId; } catch (err) {}
    readStore();
    el.groupForm.hidden = true;
  }

  function dataChanged() {
    dataVersion++;
    if (backup) backup.observe(allRecords, groups);
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
    var previousGroupId = currentGroupId;
    var loaded = store.load();
    allRecords = loaded.records;
    groups = loaded.groups;
    var groupIds = new Set(groups.map(function (group) { return group.id; }));
    if (!groupIds.has(currentGroupId)) {
      currentGroupId = window.StarCubeStore.defaultGroupId;
      try { window.sessionStorage.setItem(SELECTION_KEY, currentGroupId); } catch (err) {}
    }
    if (currentGroupId !== previousGroupId) {
      historyLimit = 50;
      reviewSelectedUid = null;
      if (el.historyBody) el.historyBody.scrollTop = 0;
    }
    if (editingGroup && !groupIds.has(editingGroup)) {
      editingGroup = null;
      el.groupForm.hidden = true;
    }
    if (deletingGroupId && !groupIds.has(deletingGroupId)) {
      deletingGroupId = null;
      deleteGroupFocus = null;
      if (el.groupDeleteDialog && el.groupDeleteDialog.open) el.groupDeleteDialog.close();
      el.feedback.textContent = '该训练已在另一页面删除，已切回默认训练。';
    }
    var hadUndo = undoDeletions.length;
    undoDeletions = undoDeletions.filter(function (entry) {
      return entry.record.groupId === window.StarCubeStore.defaultGroupId || groupIds.has(entry.record.groupId);
    });
    if (hadUndo && !undoDeletions.length) undoMessage = '';
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
    if (currentView !== 'timer' || importing || editingGroup !== null || detailsOpen()) return false;
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
    renderAverageDialog();
    renderBackup();
    renderUndo();
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
      if (!undoDeletions.length) undoMessage = '';
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

  function normalizeScrambleText(text) {
    var cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned === '—') return '';
    return cleaned;
  }

  function computeFacelets(algorithm) {
    var cleaned = normalizeScrambleText(algorithm);
    if (!cleaned) return null;
    var moves = cleaned.split(' ');
    var stickers = SOLVED_FACELETS.split('');
    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      if (!ALG_RE.test(move)) return null;
      var turns = move.charAt(1) === '2' ? 2 : move.charAt(1) === "'" ? 3 : 1;
      var cycles = MOVE_CYCLES[move.charAt(0)];
      for (var t = 0; t < turns; t++) {
        for (var c = 0; c < cycles.length; c++) {
          var cycle = cycles[c];
          var last = stickers[cycle[3]];
          stickers[cycle[3]] = stickers[cycle[2]];
          stickers[cycle[2]] = stickers[cycle[1]];
          stickers[cycle[1]] = stickers[cycle[0]];
          stickers[cycle[0]] = last;
        }
      }
    }
    return stickers.join('');
  }

  function currentCopyableScramble() {
    if (activeScramble) return normalizeScrambleText(activeScramble.algorithm);
    if (generating || genFailed || !currentScramble) return '';
    return normalizeScrambleText(currentScramble.algorithm);
  }

  function fallbackCopyText(text, container) {
    if (typeof document.execCommand !== 'function' || typeof document.createElement !== 'function') return false;
    var host = container && container.isConnected ? container : document.body;
    if (!host || typeof host.appendChild !== 'function') return false;
    var active = document.activeElement;
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    area.style.opacity = '0';
    host.appendChild(area);
    var copied = false;
    try {
      if (typeof area.focus === 'function') area.focus({ preventScroll: true });
      if (typeof area.select === 'function') area.select();
      if (typeof area.setSelectionRange === 'function') area.setSelectionRange(0, text.length);
      copied = !!document.execCommand('copy');
    } catch (err) {
      copied = false;
    } finally {
      area.remove();
      if (active && active.isConnected && typeof active.focus === 'function') {
        try { active.focus({ preventScroll: true }); } catch (err) {}
      }
    }
    return copied;
  }

  function copyScramble(text, options) {
    options = options || {};
    var normalized = normalizeScrambleText(text);
    if (!normalized) return;
    var inDialog = !!options.inDialog;
    function onSuccess() {
      if (inDialog && selectedRecordUid) el.recordFeedback.textContent = '已复制打乱公式。';
      else el.feedback.textContent = '已复制打乱公式。';
      showToast('已复制打乱');
    }
    function onFailure() {
      var message = '当前浏览器不支持自动复制，请手动选中上方打乱公式复制。';
      if (inDialog && selectedRecordUid) el.recordFeedback.textContent = message;
      else el.feedback.textContent = message;
      showToast('不支持自动复制，请手动选中复制');
    }
    var clipboard = typeof navigator !== 'undefined' && navigator && navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      try {
        Promise.resolve(clipboard.writeText(normalized)).then(onSuccess, function () {
          if (fallbackCopyText(normalized, inDialog ? el.recordDialog : document.body)) onSuccess();
          else onFailure();
        });
        return;
      } catch (err) {
        // 同步异常时继续走降级逻辑
      }
    }
    if (fallbackCopyText(normalized, inDialog ? el.recordDialog : document.body)) onSuccess();
    else onFailure();
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
      hint = (currentScramble.replayed ? '重测历史打乱 · ' : '随机状态 · ') + currentScramble.algorithm.split(' ').length + ' 步';
    } else if (engineDead) {
      text = '打乱不可用';
      message = true;
      hint = '仍可计时，记录中打乱显示 —';
    } else if (!engineReady || state === 'BOOT') {
      text = '打乱引擎初始化中…';
      message = true;
      hint = engineFallback ? '主线程初始化，可能卡顿数秒' : '首次初始化约需数秒';
    }

    el.scrambleText.textContent = text;
    el.scrambleText.classList.toggle('is-message', message);
    el.scrambleHint.textContent = hint;
    el.retryBtn.hidden = !showRetry;
    el.copyScrambleBtn.disabled = !currentCopyableScramble() || !!press || state === 'RUNNING' || state === 'INSPECTING' || state === 'READY';
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
    if (settings.inspection) audio.updateInspection(performance.now() - inspectStart);
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

  function syncHistoryExportControl() {
    var canExport = canChangeGroup() && editingGroup === null && historyEntries.length > 0;
    el.exportHistoryCsv.disabled = !canExport;
    el.exportHistoryCsv.title = historyEntries.length ?
      '导出当前训练当前筛选范围内的全部成绩（CSV）' : '当前筛选范围内没有可导出的成绩';
  }

  function renderHistory() {
    var now = Date.now();
    var range = dateReview() ? Review.dateRange(reviewLimit, now) : null;
    var scopeKey = range ? reviewLimit + ':' + Math.floor(now / 60000) + ':' + new Date(now).getTimezoneOffset() : 'all';
    if (historyDataVersion !== dataVersion || historyScopeKey !== scopeKey) {
      var filtered = Review.filterHistory(records, reviewLimit, now);
      range = filtered.range;
      var entries = filtered.entries;
      var dateKey = range ? range.dayKey + ':' + new Date(now).getTimezoneOffset() : null;
      if (historyDataVersion !== dataVersion || historyDateKey !== dateKey || entries.length !== historyEntries.length ||
          entries.some(function (entry, index) { return entry.index !== historyEntries[index].index || entry.record.uid !== historyEntries[index].record.uid; })) {
        historyVersion = -1;
      }
      historyEntries = entries;
      historyDataVersion = dataVersion;
      historyScopeKey = scopeKey;
      historyDateKey = dateKey;
    }
    var total = historyEntries.length;
    el.historyTitle.textContent = range ? range.currentLabel + '成绩' : '本组历史';
    el.historyCount.textContent = String(total);
    el.historyScopeBar.hidden = !range;
    el.historyScope.textContent = range ? '当前训练 · ' + reviewDateSpan(range.periodStart, range.periodEnd) : '';
    el.historyEmpty.hidden = total > 0;
    el.historyEmpty.textContent = range ? range.currentLabel + '还没有成绩，可切换范围或查看全部历史。' : '还没有记录';
    el.historyMore.hidden = !historyOpen || total <= historyLimit;
    el.historyMore.textContent = '再显示 50 条 · 已显示 ' + Math.min(historyLimit, total) + ' / ' + total;
    el.reviewHistory.hidden = !range;
    el.reviewHistory.textContent = range ? '查看' + range.currentLabel + '的成绩 · ' + total + ' 次 →' : '';
    el.historyAll.disabled = !canChangeGroup() || editingGroup !== null;
    syncHistoryExportControl();
    if (currentView !== 'review' || !historyOpen) {
      if (historyVersion !== -1) { el.historyList.replaceChildren(); historyDetailButtons = []; historyVersion = -1; }
      return;
    }
    if (historyVersion === dataVersion) return;
    historyVersion = dataVersion;
    var scrollTop = el.historyBody.scrollTop;
    var focusUid = historyDetailButtons.includes(document.activeElement) ? document.activeElement.getAttribute('data-record-uid') : null;
    var fragment = document.createDocumentFragment();
    historyDetailButtons = [];
    var previousDate = null;
    for (var j = total - 1; j >= Math.max(0, total - historyLimit); j--) {
      var entry = historyEntries[j], record = entry.record, i = entry.index;
      var item = document.createElement('li');
      item.className = 'history-item';
      if (range) {
        var date = reviewDate(Date.parse(record.at));
        if (date !== previousDate) {
          var heading = document.createElement('h3');
          heading.className = 'history-date';
          heading.textContent = date;
          item.appendChild(heading);
          previousDate = date;
        }
      }

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
      at.textContent = range ? formatAt(record.at).slice(6) : formatAt(record.at);
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
    if (focusUid) {
      var focus = historyDetailButtons.find(function (button) { return button.getAttribute('data-record-uid') === focusUid; });
      (focus || el.historyToggle).focus({ preventScroll: true });
    }
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
    if (el.themeToggle) el.themeToggle.disabled = detailsOpen() || !!press || state === 'RUNNING' || state === 'INSPECTING' || state === 'READY';
    el.soundToggle.disabled = !canToggle;
    el.soundToggle.setAttribute('aria-checked', String(settings.inspectionSound));
    el.soundPreview.disabled = !canToggle;
    [[el.coreAo5Detail, 5], [el.ao5Detail, 5], [el.coreAo12Detail, 12], [el.ao12Detail, 12]].forEach(function (pair) {
      pair[0].disabled = !canToggle || records.length < pair[1];
      pair[0].title = records.length < pair[1] ? '本组满 ' + pair[1] + ' 次后可查看明细' : '查看 Ao' + pair[1] + ' 计算明细';
    });
    [el.corePbDetail, el.pbDetail].forEach(function (button) { button.disabled = !canToggle || el.pb.textContent === '—'; });
    [el.coreGlobalPbDetail, el.globalPbDetail].forEach(function (button) { button.disabled = !canToggle || el.globalPb.textContent === '—'; });
    el.bestAo5Detail.disabled = !canToggle || el.bestAo5.textContent === '—';
    el.switchBtn.title = canToggle ? '切换 15 秒观察' : '观察开关仅在就绪或停止后可切换';
    el.importBtn.disabled = !canToggle || memoryMode;
    el.exportBtn.disabled = state === 'RUNNING' || state === 'INSPECTING' || state === 'READY' || !!press || importing;
    syncHistoryExportControl();
  }

  function canChangeGroup() {
    return (state === 'IDLE' || state === 'STOPPED') && !press && !activeScramble && !importing && !detailsOpen();
  }

  function detailsOpen() { return !!selectedRecordUid || selectedAverage !== null || deletingGroupId !== null; }

  function renderBackup() {
    var status = backup.status();
    el.backupReminder.hidden = !status.due;
    // Keep the reminder in its place during a solve; only its actions become unavailable.
    el.backupExport.disabled = el.exportBtn.disabled || detailsOpen() || editingGroup !== null;
    el.backupLater.disabled = !canChangeGroup() || editingGroup !== null;
    el.backupMessage.textContent = '自上次导出净新增 ' + status.pendingCount + ' 条成绩，建议备份一份。';
    el.backupStatus.textContent = status.lastExportRequestedAt ?
      '上次发起导出：' + new Date(status.lastExportRequestedAt).toLocaleString('zh-CN', { hour12: false }) +
      (status.changed ? ' · 此后数据有更改' : ' · 请确认文件已保存') : '尚未发起过备份导出';
    if (!status.metadataWritable) el.backupStatus.textContent += ' · 提醒状态仅保留在本页';
  }

  function canEditRecords() {
    return (state === 'IDLE' || state === 'STOPPED') && !press && !activeScramble && !importing && editingGroup === null;
  }

  function groupRecords(id) { return allRecords.filter(function (record) { return record.groupId === id; }); }

  function averageDetail(selection) {
    return Stats.averageDetails(groupRecords(selection.groupId), selection.n, selection.endUid);
  }

  function validDetail(entry) {
    return entry.kind === 'record' ? allRecords.some(function (record) { return record.uid === entry.uid; }) : !!averageDetail(entry.average);
  }

  function showDetail(entry, trigger, returning) {
    if (!canEditRecords()) return;
    if (!memoryMode && !returning) readStore();
    if (!validDetail(entry)) { render(); return; }
    if (!returning) {
      if (detailsOpen()) {
        var previous = selectedRecordUid ? { kind: 'record', uid: selectedRecordUid } : { kind: 'average', average: selectedAverage };
        previous.scrollTop = (selectedRecordUid ? el.recordDialog : el.averageDialog).scrollTop;
        previous.focusId = trigger && trigger.id;
        previous.focusUid = trigger && trigger.getAttribute('data-record-uid');
        detailTrail.push(previous);
      } else {
        detailTrail = [];
        detailRootFocus = trigger || document.activeElement;
        detailRootView = currentView;
        detailRootScroll = { x: window.scrollX, y: window.scrollY };
        if (!undoDeletions.length) undoMessage = '';
      }
    }
    // Set selection before closing: native close events must not pop the new page.
    selectedRecordUid = entry.kind === 'record' ? entry.uid : null;
    selectedAverage = entry.kind === 'average' ? entry.average : null;
    averageVersion = -1;
    el.recordContinue.hidden = detailRootView !== 'timer';
    el.averageContinue.hidden = detailRootView !== 'timer';
    if (!selectedRecordUid && el.recordDialog.open) el.recordDialog.close();
    if (!selectedAverage && el.averageDialog.open) el.averageDialog.close();
    audio.stop();
    el.recordFeedback.textContent = '';
    render();
    var dialog = selectedRecordUid ? el.recordDialog : el.averageDialog;
    if (!dialog.open) dialog.showModal();
    var focus = selectedRecordUid ? el.recordClose : el.averageClose;
    if (returning && entry.focusId) focus = $(entry.focusId) || focus;
    if (returning && entry.focusUid && selectedAverage) {
      focus = Array.from(el.averageRows.querySelectorAll('button')).find(function (button) {
        return button.getAttribute('data-record-uid') === entry.focusUid;
      }) || focus;
    }
    if (focus.disabled) focus = selectedRecordUid ? el.recordClose : el.averageClose;
    focus.focus({ preventScroll: true });
    dialog.scrollTop = returning ? entry.scrollTop || 0 : 0;
  }

  function closeDetail(event, resumeTimer) {
    selectedRecordUid = null;
    selectedAverage = null;
    if (el.recordDialog.open) el.recordDialog.close();
    if (el.averageDialog.open) el.averageDialog.close();
    if (resumeTimer) detailTrail = [];
    while (detailTrail.length) {
      var parent = detailTrail.pop();
      if (validDetail(parent)) { showDetail(parent, null, true); return; }
    }
    render();
    var returnToTimer = currentView === 'timer' && detailRootView === 'timer' &&
      (resumeTimer || (event && event.detail > 0));
    var target = returnToTimer ? el.pad : detailRootFocus;
    var scroll = detailRootScroll;
    detailRootFocus = null;
    detailRootView = null;
    detailRootScroll = null;
    el.recordContinue.hidden = true;
    el.averageContinue.hidden = true;
    if (scroll) window.scrollTo(scroll.x, scroll.y);
    if (target && target.isConnected && !target.disabled) target.focus({ preventScroll: true });
    else if (currentView === 'timer') el.pad.focus({ preventScroll: true });
    else el.historyToggle.focus({ preventScroll: true });
  }

  function continueTiming() {
    if (detailRootView !== 'timer' || currentView !== 'timer' || !detailsOpen() || !canEditRecords()) return;
    closeDetail(null, true);
  }

  function detailCloseLabel() {
    if (!detailTrail.length) return '关闭';
    return detailTrail[detailTrail.length - 1].kind === 'average' ? '返回明细' : '返回成绩';
  }

  function openAverage(n, trigger, endUid, groupId) {
    if (!canEditRecords()) return;
    if (!memoryMode) readStore();
    var id = groupId || currentGroupId;
    var list = groupRecords(id);
    var detail = endUid === undefined ? Stats.averageDetails(list, n) : Stats.averageDetails(list, n, endUid);
    if (!detail) { render(); return; }
    showDetail({ kind: 'average', average: { n: n, endUid: detail.endUid, groupId: id } }, trigger);
  }

  function closeAverage(event) { closeDetail(event); }

  function renderAverageDialog() {
    if (selectedAverage === null || averageVersion === dataVersion) return;
    averageVersion = dataVersion;
    var detail = averageDetail(selectedAverage);
    if (!detail) {
      el.feedback.textContent = '当前训练成绩数量已变化，平均值明细已关闭。';
      closeAverage(); return;
    }
    var group = groups.find(function (item) { return item.id === selectedAverage.groupId; });
    el.averageClose.textContent = detailCloseLabel();
    el.averageTitle.textContent = 'Ao' + detail.n + ' 明细';
    el.averageGroup.textContent = (group ? group.name : '') + ' · 第 ' + detail.rows[0].number + '–' + detail.rows[detail.rows.length - 1].number + ' 次';
    el.averageResult.textContent = reviewValue(detail.value);
    el.averageResult.classList.toggle('is-dnf', detail.value === 'DNF');
    el.averageFormula.textContent = detail.sum === null ? '去尾后仍有 DNF，本次平均为 DNF。' :
      '计入总用时 ' + Stats.formatMs(detail.sum) + ' ÷ ' + detail.includedCount + ' = ' + Stats.formatMs(detail.value);
    var fragment = document.createDocumentFragment();
    detail.rows.forEach(function (row) {
      var item = document.createElement('li');
      item.className = 'average-row' + (row.excluded ? ' is-excluded' : '');
      item.setAttribute('data-record-uid', row.uid);
      item.setAttribute('data-excluded', row.excluded || '');
      var number = document.createElement('span'); number.className = 'average-number'; number.textContent = '#' + row.number;
      var value = document.createElement('button'); value.type = 'button'; value.className = 'average-value average-record'; value.textContent = Stats.formatResult(row.record);
      value.setAttribute('data-record-uid', row.uid);
      value.setAttribute('aria-label', '第 ' + row.number + ' 次，' + Stats.formatResult(row.record) + '，查看详情与罚时');
      var label = document.createElement('span'); label.className = 'average-disposition';
      label.textContent = row.excluded === 'best' ? '去掉 · 最好' : row.excluded === 'worst' ? '去掉 · 最差' : '计入平均';
      item.append(number, value, label);
      if (row.record.penalty === '+2') {
        var raw = document.createElement('small'); raw.className = 'average-penalty'; raw.textContent = '原始 ' + Stats.formatMs(row.record.ms) + ' + 2 秒'; item.appendChild(raw);
      }
      fragment.appendChild(item);
    });
    el.averageRows.replaceChildren(fragment);
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
    var isDefault = currentGroupId === window.StarCubeStore.defaultGroupId;
    el.groupSelect.disabled = disabled;
    el.groupNew.disabled = disabled;
    el.groupRename.disabled = disabled;
    el.groupDelete.disabled = disabled || isDefault;
    el.groupDelete.title = isDefault ? '默认训练不可删除' : '删除当前训练';
    if (el.groupDeleteExport) el.groupDeleteExport.disabled = el.exportBtn.disabled;
    if (el.groupDeleteConfirm) el.groupDeleteConfirm.disabled = !canEditRecords();
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
      if (editingGroup && !memoryMode) {
        readStore();
        if (!groups.some(function (g) { return g.id === editingGroup; })) {
          closeGroupEditor();
          el.feedback.textContent = '该训练已在其他页面删除，无法重命名。';
          return;
        }
      }
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
      showToast('已保存训练「' + group.name + '」');
    } catch (err) { el.groupError.textContent = err.message; el.groupName.focus(); }
  }

  function openGroupDeleteDialog(group, count) {
    deletingGroupId = group.id;
    deleteGroupFocus = el.groupDelete;
    el.groupDeleteTitle.textContent = '删除训练「' + group.name + '」';
    el.groupDeleteMessage.textContent = '该训练包含 ' + count + ' 条成绩，删除后将连同全部成绩一起移除。建议先导出全量 JSON 备份，再确认删除。';
    el.groupDeleteFeedback.textContent = '';
    audio.stop();
    render();
    if (!el.groupDeleteDialog.open) el.groupDeleteDialog.showModal();
    el.groupDeleteClose.focus({ preventScroll: true });
  }

  function closeGroupDeleteDialog(restoreFocus) {
    if (deletingGroupId === null && !el.groupDeleteDialog.open) return;
    deletingGroupId = null;
    if (el.groupDeleteDialog.open) el.groupDeleteDialog.close();
    var target = deleteGroupFocus;
    deleteGroupFocus = null;
    render();
    if (restoreFocus === false) return;
    if (target && target.isConnected && !target.disabled) target.focus({ preventScroll: true });
    else if (el.groupSelect && !el.groupSelect.disabled) el.groupSelect.focus({ preventScroll: true });
  }

  function performDeleteGroup(group) {
    if (!group || group.id === window.StarCubeStore.defaultGroupId) return;
    var removedCount = groupRecords(group.id).length;
    if (!memoryMode) {
      try {
        var result = store.removeGroup(group.id);
        removedCount = result.removedRecords;
        readStore();
      } catch (err) {
        if (err.code === 'INVALID_GROUP') {
          el.feedback.textContent = '删除未完成：' + err.message;
          render();
          return;
        }
        // 存储不可写或写入中断时降级为内存只读模式，保留其余训练与成绩
        setMemoryMode('训练分组删除失败');
        groups = groups.filter(function (item) { return item.id !== group.id; });
        allRecords = allRecords.filter(function (item) { return item.groupId !== group.id; });
      }
    } else {
      groups = groups.filter(function (item) { return item.id !== group.id; });
      allRecords = allRecords.filter(function (item) { return item.groupId !== group.id; });
    }
    currentGroupId = window.StarCubeStore.defaultGroupId;
    try { window.sessionStorage.setItem(SELECTION_KEY, currentGroupId); } catch (err) {}
    undoDeletions = undoDeletions.filter(function (entry) { return entry.record.groupId !== group.id; });
    if (!undoDeletions.length) undoMessage = '';
    historyLimit = 50;
    reviewSelectedUid = null;
    el.historyBody.scrollTop = 0;
    dataChanged();
    render();
    var detail = removedCount ? '（已移除 ' + removedCount + ' 条成绩）' : '';
    el.feedback.textContent = (memoryMode ? '仅在本页删除训练「' : '已删除训练「') + group.name + '」' + detail + '，已切回默认训练。' +
      (memoryMode ? '请导出备份保存当前数据。' : '');
    showToast('已删除训练「' + group.name + '」');
    if (currentView === 'timer') el.pad.focus({ preventScroll: true });
    else el.groupSelect.focus({ preventScroll: true });
  }

  function requestDeleteGroup() {
    if (!canChangeGroup() || editingGroup !== null || deletingGroupId !== null) return;
    if (!memoryMode) readStore();
    if (currentGroupId === window.StarCubeStore.defaultGroupId) { render(); return; }
    var group = groups.find(function (item) { return item.id === currentGroupId; });
    if (!group) { render(); return; }
    var count = groupRecords(group.id).length;
    if (count > 0) {
      openGroupDeleteDialog(group, count);
      return;
    }
    performDeleteGroup(group);
  }

  function confirmDeleteGroup() {
    if (!deletingGroupId || !canEditRecords()) return;
    var targetId = deletingGroupId;
    if (!memoryMode) readStore();
    var group = groups.find(function (item) { return item.id === targetId; });
    deletingGroupId = null;
    deleteGroupFocus = null;
    if (el.groupDeleteDialog.open) el.groupDeleteDialog.close();
    if (!group) {
      render();
      el.feedback.textContent = '该训练已不存在，已切回默认训练。';
      return;
    }
    performDeleteGroup(group);
  }

  function reviewValue(value) { return value === null ? '—' : value === 'DNF' ? 'DNF' : Stats.formatMs(value); }

  function dateReview() { return reviewLimit === 'today' || reviewLimit === '7days'; }

  function reviewDate(ms) {
    var date = new Date(ms);
    return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
  }

  function reviewDateSpan(start, end) {
    var first = reviewDate(start), last = reviewDate(end);
    return first === last ? first : first + '–' + last;
  }

  function reviewPercent(value) { return value === null ? '—' : (value * 100).toFixed(1) + '%'; }

  function renderComparison(data) {
    var range = data.dateRange;
    el.reviewComparison.hidden = !range;
    el.reviewMetrics.hidden = !!range;
    if (!range) return;
    var previous = data.comparison.previous, delta = data.comparison.delta;
    el.reviewCurrentLabel.textContent = range.currentLabel;
    el.reviewPreviousLabel.textContent = range.priorLabel;
    el.reviewPeriod.textContent = range.currentLabel + '：' + reviewDateSpan(range.periodStart, range.periodEnd) +
      '；' + range.priorLabel + '：' + reviewDateSpan(range.priorStart, range.priorEnd - 1) + '。按设备本地日期。';
    el.compareCountCurrent.textContent = String(data.shown);
    el.compareCountPrevious.textContent = String(previous.count);
    var countDelta = data.shown - previous.count;
    el.compareCountDelta.textContent = countDelta ? (countDelta > 0 ? '多 ' : '少 ') + Math.abs(countDelta) + ' 次' : '持平';
    el.compareAverageCurrent.textContent = reviewValue(data.average);
    el.compareAveragePrevious.textContent = reviewValue(previous.average);
    el.compareStddevCurrent.textContent = reviewValue(data.stddev);
    el.compareStddevPrevious.textContent = reviewValue(previous.stddev);
    el.compareDnfCurrent.textContent = reviewPercent(data.dnfRate);
    el.compareDnfPrevious.textContent = reviewPercent(previous.dnfRate);
    function difference(node, value, type) {
      var rounded = value === null ? null : type === 'dnf' ? Math.round(value * 1000) / 10 : Math.round(value);
      node.classList.toggle('is-better', rounded !== null && rounded < 0);
      node.classList.toggle('is-worse', rounded !== null && rounded > 0);
      if (rounded === null) { node.textContent = '—'; return; }
      if (rounded === 0) { node.textContent = '持平'; return; }
      if (type === 'dnf') {
        var change = document.createElement('span');
        change.textContent = (rounded < 0 ? '下降 ' : '上升 ') + Math.abs(rounded).toFixed(1) + ' ';
        var unit = document.createElement('span'); unit.className = 'comparison-unit'; unit.textContent = '个百分点';
        node.replaceChildren(change, unit);
      }
      else node.textContent = (type === 'average' ? (rounded < 0 ? '快 ' : '慢 ') : (rounded < 0 ? '减小 ' : '增大 ')) +
        (Math.abs(rounded) / 1000).toFixed(3) + ' 秒';
    }
    difference(el.compareAverageDelta, delta.average, 'average');
    difference(el.compareStddevDelta, delta.stddev, 'stddev');
    difference(el.compareDnfDelta, delta.dnfRate, 'dnf');
    var note = '当前时段含今天，尚未结束。有效成绩 ' + data.validCount + ' / ' + previous.validCount + ' 次';
    note += data.smallSample || previous.smallSample ? '，样本较少，变化仅供参考。' : '。';
    if (!data.shown) note += '当前时段没有成绩。';
    if (!previous.count) note += '前一时段没有成绩，暂不能比较。';
    note += '平均与波动排除 DNF，+2 计入；波动为标准差，越小越稳定，至少需 2 次有效成绩。';
    el.reviewCompareNote.textContent = note;
  }

  function refreshReviewPanels() {
    renderHistory();
    renderReview();
  }

  function renderReview() {
    el.reviewInspect.disabled = !canChangeGroup() || editingGroup !== null || !reviewSelectedUid;
    var now = Date.now();
    // History remains date-aware even when the trend panel is collapsed.
    var refreshDates = currentView === 'review' && dateReview() && (reviewOpen || historyOpen) && !document.hidden;
    if (refreshDates && !reviewRefreshTimer) {
      reviewRefreshTimer = setTimeout(function () { reviewRefreshTimer = 0; refreshReviewPanels(); }, 60000 - now % 60000);
    } else if (!refreshDates && reviewRefreshTimer) {
      clearTimeout(reviewRefreshTimer); reviewRefreshTimer = 0;
    }
    if (currentView !== 'review' || !reviewOpen) {
      if (reviewVersion !== -1) { el.reviewChart.replaceChildren(); el.reviewRecord.replaceChildren(); reviewVersion = -1; }
      return;
    }
    var timeKey = dateReview() ? Math.floor(now / 60000) + ':' + new Date(now).getTimezoneOffset() : null;
    if (reviewVersion === dataVersion && reviewTimeKey === timeKey) return;
    reviewVersion = dataVersion;
    reviewTimeKey = timeKey;
    reviewData = Review.build(records, reviewLimit, now);
    var data = reviewData;
    renderComparison(data);
    el.reviewContent.hidden = !data.shown;
    el.reviewEmpty.hidden = !!data.shown;
    el.reviewEmpty.textContent = data.dateRange ? data.dateRange.currentLabel + '还没有成绩，可换一个范围查看。' :
      '先完成一把，成绩就会出现在这里。练习满 5 次后可查看 Ao5 趋势。';
    var scope = data.dateRange ? data.dateRange.currentLabel + ' · 共 ' + data.shown + ' 次' : '第 ' + (data.startIndex + 1) + '–' + data.total + ' 次';
    el.reviewSummary.textContent = data.shown ? scope + ' · 有效 ' + data.validCount + ' · DNF ' + data.dnfCount + ' · +2 ' + data.plus2Count :
      data.dateRange ? data.dateRange.currentLabel + ' · 共 0 次' : '本组还没有成绩';
    if (data.plotTruncated) el.reviewSummary.textContent += ' · 曲线仅显示最近 ' + data.points.length + ' 次，对比统计涵盖本期全部成绩';
    el.reviewAverage.textContent = reviewValue(data.average);
    el.reviewBest.textContent = reviewValue(data.best);
    if (!data.points.some(function (p) { return p.uid === reviewSelectedUid; })) {
      reviewSelectedUid = data.points.length ? data.points[data.points.length - 1].uid : null;
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
    el.reviewInspect.disabled = !canChangeGroup() || editingGroup !== null || !reviewSelectedUid;
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
    showDetail({ kind: 'record', uid: uid }, trigger);
  }

  function closeRecord(event) { closeDetail(event); }

  function renderRecordDialog() {
    if (!selectedRecordUid) return;
    var record = allRecords.find(function (item) { return item.uid === selectedRecordUid; });
    if (!record) {
      el.feedback.textContent = '该成绩已删除，详情已关闭。';
      closeRecord(); return;
    }
    var list = groupRecords(record.groupId);
    var index = list.findIndex(function (item) { return item.uid === record.uid; });
    var group = groups.find(function (item) { return item.id === record.groupId; });
    el.recordClose.textContent = detailCloseLabel();
    el.recordTitle.textContent = '第 ' + (index + 1) + ' 次成绩';
    el.recordGroup.textContent = group ? group.name : '';
    el.recordResult.textContent = Stats.formatResult(record);
    el.recordResult.classList.toggle('is-dnf', record.penalty === 'dnf');
    el.recordRaw.textContent = Stats.formatMs(record.ms);
    el.recordDate.textContent = new Date(record.at).toLocaleString('zh-CN', { hour12: false });
    el.recordScramble.textContent = record.scramble || '—';
    var hasScramble = !!normalizeScrambleText(record.scramble);
    el.recordCopyScramble.disabled = !hasScramble;
    el.recordCopyScramble.title = hasScramble ? '复制该条打乱公式' : '该次成绩没有可复制的打乱公式';
    el.recordReplayScramble.disabled = !hasScramble || !canEditRecords();
    el.recordReplayScramble.title = hasScramble ? '关闭详情并回到计时页，将当前打乱替换为该条打乱' : '该次成绩没有可用的打乱公式';
    el.recordAo5.textContent = reviewValue(Stats.aoN(list.slice(Math.max(0, index - 4), index + 1), 5));
    el.recordAo5Detail.disabled = index < 4;
    el.recordAo5Detail.title = index < 4 ? '截至该次不足 5 把' : '查看截至该次的 Ao5 明细';
    [el.recordOk, el.recordPlus, el.recordDnf].forEach(function (button, i) {
      var active = record.penalty === ['ok', '+2', 'dnf'][i];
      button.setAttribute('aria-pressed', String(active)); button.classList.toggle('is-active', active);
    });
  }

  function replayRecordScramble() {
    if (!selectedRecordUid || !canEditRecords()) return;
    var record = allRecords.find(function (item) { return item.uid === selectedRecordUid; });
    if (!record) { render(); return; }
    var algorithm = normalizeScrambleText(record.scramble);
    if (!algorithm) return;
    if (genTimer) {
      clearTimeout(genTimer);
      genTimer = 0;
    }
    generating = false;
    genFailed = false;
    pendingRequestId = null;
    activeScramble = null;
    currentScramble = {
      algorithm: algorithm,
      facelets: computeFacelets(algorithm),
      requestId: ++requestSerial,
      replayed: true
    };
    scrambleUsed = false;
    if (state === 'BOOT' || state === 'STOPPED') state = 'IDLE';

    // 关闭所有嵌套详情弹窗并切回计时页，保持原有状态机与防误触边界，不自动起表
    selectedRecordUid = null;
    selectedAverage = null;
    detailTrail = [];
    detailRootFocus = null;
    detailRootView = null;
    detailRootScroll = null;
    el.recordContinue.hidden = true;
    el.averageContinue.hidden = true;
    if (el.recordDialog.open) el.recordDialog.close();
    if (el.averageDialog.open) el.averageDialog.close();

    currentView = 'timer';
    if (!undoDeletions.length) undoMessage = '';
    render();
    window.scrollTo(0, 0);
    el.pad.focus({ preventScroll: true });
    el.feedback.textContent = '已载入历史打乱，准备就绪后即可开始计时。';
    showToast('已载入该条打乱，可开始计时');
  }

  function setRecordPenalty(penalty) {
    if (!selectedRecordUid || !['ok', '+2', 'dnf'].includes(penalty) || press || activeScramble || importing || (state !== 'IDLE' && state !== 'STOPPED')) return;
    var uid = selectedRecordUid;
    if (!memoryMode) readStore();
    var record = allRecords.find(function (item) { return item.uid === uid; });
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
      audio.stop();
      if (settings.inspectionSound && settings.inspection) audio.unlock();
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
    audio.startInspection();
    state = 'INSPECTING';
    inspectStart = now;
    cancelAnimationFrame(inspectionRaf);
    inspectionRaf = requestAnimationFrame(inspectionFrame);
    render();
  }

  function cancelInspection() {
    if (state !== 'INSPECTING' && state !== 'READY') return;
    audio.stop();
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
    audio.stop();
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
    if (engineDead) currentScramble = null;
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
    if (currentView !== 'timer' || detailsOpen()) return;
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
    if (currentView !== 'timer' || detailsOpen()) return;
    if ((state !== 'STOPPED' && state !== 'IDLE') || press || activeScramble || importing || !records.length) return;
    deleteRecord(latestRecord().uid);
  }

  function renderUndo() {
    var pending = undoDeletions.length;
    [[el.undoNotice, el.undoMessage, el.undoDelete], [el.recordUndoNotice, el.recordUndoMessage, el.recordUndo],
      [el.averageUndoNotice, el.averageUndoMessage, el.averageUndo]].forEach(function (parts) {
      parts[0].hidden = !undoMessage;
      parts[1].textContent = undoMessage;
      parts[2].hidden = !pending;
      parts[2].disabled = !canEditRecords();
      parts[2].textContent = pending > 1 ? '撤销删除（' + pending + '）' : '撤销删除';
    });
  }

  function focusUndo() {
    var button = selectedRecordUid ? el.recordUndo : selectedAverage ? el.averageUndo : el.undoDelete;
    // Long Ao12 dialogs must bring the recovery action into view after deletion.
    if (!button.hidden && !button.disabled) button.focus();
  }

  function deleteRecord(uid) {
    if (!canEditRecords()) return;
    if (!memoryMode) readStore();
    var record = allRecords.find(function (item) { return item.uid === uid; });
    if (!record) { render(); return; }
    var group = groups.find(function (item) { return item.id === record.groupId; });
    var entry = { record: Object.assign({}, record), memoryOnly: memoryMode,
      groupName: group ? group.name : '训练', number: groupRecords(record.groupId).findIndex(function (item) { return item.uid === uid; }) + 1 };
    if (!memoryMode) {
      try { entry.token = store.remove(uid).token; }
      catch (err) {
        var message = '删除未完成，成绩仍保留：' + err.message;
        if (selectedRecordUid) el.recordFeedback.textContent = message;
        else { undoMessage = message; renderUndo(); }
        return;
      }
      readStore();
    } else {
      allRecords = allRecords.filter(function (item) { return item.uid !== uid; });
      dataChanged();
    }
    undoDeletions.push(entry);
    undoMessage = (entry.memoryOnly ? '仅在本页删除「' : '已删除「') + entry.groupName + '」第 ' + entry.number + ' 次 · ' + Stats.formatResult(record) + '。本页可撤销。';
    if (selectedRecordUid === uid) closeRecord(); else render();
    focusUndo();
  }

  function undoDelete() {
    if (!canEditRecords() || !undoDeletions.length) return;
    var entry = undoDeletions[undoDeletions.length - 1];
    try {
      if (!entry.memoryOnly && !memoryMode) readStore();
      var groupExists = entry.record.groupId === window.StarCubeStore.defaultGroupId ||
        groups.some(function (group) { return group.id === entry.record.groupId; });
      if (!groupExists) {
        undoDeletions.pop();
        undoMessage = '未能撤销：该成绩所属的训练已删除。';
        render();
        return;
      }
      if (entry.memoryOnly) {
        if (!allRecords.some(function (item) { return item.uid === entry.record.uid; })) allRecords.push(entry.record);
        allRecords.sort(window.StarCubeStore.compareRecords);
        dataChanged();
      } else {
        var restored = store.restore(entry.record.uid, entry.token);
        if (memoryMode) {
          if (!allRecords.some(function (item) { return item.uid === restored.uid; })) allRecords.push(restored);
          allRecords.sort(window.StarCubeStore.compareRecords);
          dataChanged();
        } else readStore();
      }
      undoDeletions.pop();
      undoMessage = '已恢复「' + entry.groupName + '」的 ' + Stats.formatResult(entry.record) + '，统计已更新。' +
        (entry.memoryOnly ? '仅保留在本页，请导出备份。' : '');
    } catch (err) {
      if (err.code === 'RESTORE_CONFLICT' || err.code === 'RECORD_UNAVAILABLE') undoDeletions.pop();
      undoMessage = '未能撤销：' + err.message;
    }
    render();
    if (undoDeletions.length) focusUndo();
    else if (selectedRecordUid) el.recordClose.focus({ preventScroll: true });
    else if (selectedAverage) el.averageClose.focus({ preventScroll: true });
    else if (currentView === 'timer') el.pad.focus({ preventScroll: true });
    else el.historyToggle.focus({ preventScroll: true });
  }

  function toggleInspection() {
    if (detailsOpen()) return;
    if ((state !== 'IDLE' && state !== 'STOPPED') || press || activeScramble) return;
    settings.inspection = !settings.inspection;
    persistSettings();
    render();
  }

  function cycleTheme() {
    if (detailsOpen() || press || state === 'RUNNING' || state === 'INSPECTING' || state === 'READY') return;
    var next = THEMES[(THEMES.indexOf(normalizeTheme(settings.theme)) + 1) % THEMES.length];
    applyTheme(next);
    persistSettings();
    render();
    showToast('已切换主题：' + THEME_META[next].label);
  }

  function newScramble() {
    if (currentView !== 'timer' || detailsOpen()) return;
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
    if (currentView !== 'timer' || detailsOpen() || importing || editingGroup !== null) return;
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

  function csvFilenamePart(text, fallback) {
    var cleaned = String(text || '').trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return cleaned || fallback;
  }

  function localDayKey(ms) {
    var date = new Date(ms);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function getNativeBridge() {
    return typeof window !== 'undefined' && window.StarCubeNative ? window.StarCubeNative : null;
  }

  function exportHistoryCsv() {
    if (el.exportHistoryCsv.disabled || !canChangeGroup() || editingGroup !== null) return;
    if (!memoryMode) readStore();
    var now = Date.now();
    var filtered = Review.filterHistory(records, reviewLimit, now);
    if (!filtered.entries.length) {
      el.feedback.textContent = '当前筛选范围内没有可导出的成绩。';
      render();
      return;
    }
    var group = groups.find(function (item) { return item.id === currentGroupId; });
    var groupName = group ? group.name : '默认训练';
    var scopeLabel = filtered.range ? filtered.range.currentLabel : '全部历史';
    var scopeFile = filtered.range ? (filtered.range.mode === 'today' ? '今天' : '最近7天') : '全部';
    var csv = Review.historyCsv(filtered.entries);
    var filename = 'starcube-' + csvFilenamePart(groupName, '训练') + '-' + scopeFile + '-' + localDayKey(now) + '.csv';
    var count = filtered.entries.length;
    var nativeBridge = getNativeBridge();
    if (nativeBridge && typeof nativeBridge.exportFile === 'function') {
      el.feedback.textContent = '请选择 CSV 保存位置…';
      render();
      Promise.resolve().then(function () {
        return nativeBridge.exportFile({ filename: filename, mimeType: 'text/csv', content: csv });
      }).then(function (result) {
        if (result && result.status === 'saved') {
          el.feedback.textContent = '已保存 CSV：「' + groupName + '」' + scopeLabel + '，共 ' + count + ' 条成绩。';
          showToast('已保存 CSV（' + count + ' 条成绩）');
        } else if (result && result.status === 'cancelled') {
          el.feedback.textContent = '已取消 CSV 导出。';
          showToast('已取消 CSV 导出');
        } else {
          var message = (result && result.message) || '未能保存文件';
          el.feedback.textContent = 'CSV 导出失败：' + message;
          showToast('CSV 导出失败');
        }
        render();
      }, function (err) {
        el.feedback.textContent = 'CSV 导出失败：' + ((err && err.message) || '未知错误');
        showToast('CSV 导出失败');
        render();
      });
      return;
    }
    try {
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      el.feedback.textContent = '已发起 CSV 导出：「' + groupName + '」' + scopeLabel + '，共 ' + count + ' 条成绩。请确认文件已保存。';
      showToast('已导出 CSV（' + count + ' 条成绩）');
    } catch (err) {
      el.feedback.textContent = 'CSV 导出失败：' + err.message;
      showToast('CSV 导出失败');
    }
    render();
  }

  function exportData() {
    if (el.exportBtn.disabled) return;
    if (!memoryMode) readStore();
    var payload = { format: 'starcube', version: 3, exportedAt: new Date().toISOString(),
      groups: groups, records: allRecords, backups: store.backups() };
    var jsonText = JSON.stringify(payload, null, 2);
    var filename = 'starcube-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    var groupCount = groups.length;
    var recordCount = allRecords.length;
    var nativeBridge = getNativeBridge();
    if (nativeBridge && typeof nativeBridge.exportFile === 'function') {
      el.feedback.textContent = '请选择备份文件保存位置…';
      if (deletingGroupId && el.groupDeleteFeedback) {
        el.groupDeleteFeedback.textContent = '请选择全量 JSON 备份保存位置…';
      }
      render();
      Promise.resolve().then(function () {
        return nativeBridge.exportFile({ filename: filename, mimeType: 'application/json', content: jsonText });
      }).then(function (result) {
        if (result && result.status === 'saved') {
          backup.markExportRequested();
          el.feedback.textContent = '已保存备份：全部 ' + groupCount + ' 个训练、' + recordCount + ' 条成绩及可恢复的原始备份。';
          if (deletingGroupId && el.groupDeleteFeedback) {
            el.groupDeleteFeedback.textContent = '已保存全量 JSON 备份，现在可以放心确认删除。';
          }
          showToast('已保存备份（' + recordCount + ' 条成绩）');
        } else if (result && result.status === 'cancelled') {
          el.feedback.textContent = '已取消备份导出。';
          if (deletingGroupId && el.groupDeleteFeedback) {
            el.groupDeleteFeedback.textContent = '已取消备份保存。';
          }
          showToast('已取消备份导出');
        } else {
          var message = (result && result.message) || '未能保存文件';
          el.feedback.textContent = '导出失败：' + message;
          if (deletingGroupId && el.groupDeleteFeedback) {
            el.groupDeleteFeedback.textContent = '导出失败：' + message;
          }
          showToast('备份导出失败');
        }
        render();
      }, function (err) {
        var message = (err && err.message) || '未知错误';
        el.feedback.textContent = '导出失败：' + message;
        if (deletingGroupId && el.groupDeleteFeedback) {
          el.groupDeleteFeedback.textContent = '导出失败：' + message;
        }
        showToast('备份导出失败');
        render();
      });
      return;
    }
    try {
      var url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      backup.markExportRequested();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      el.feedback.textContent = '已发起下载：全部 ' + groupCount + ' 个训练、' + recordCount + ' 条成绩及可恢复的原始备份。请确认文件已保存。';
      if (deletingGroupId && el.groupDeleteFeedback) {
        el.groupDeleteFeedback.textContent = '已发起全量 JSON 备份下载，请确认文件保存后再确认删除。';
      }
      showToast('已导出备份（' + recordCount + ' 条成绩）');
    } catch (err) {
      el.feedback.textContent = '导出失败：' + err.message;
      if (deletingGroupId && el.groupDeleteFeedback) {
        el.groupDeleteFeedback.textContent = '导出失败：' + err.message;
      }
      showToast('备份导出失败');
    }
    render();
  }

  function importData() {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;
    if (el.importBtn.disabled || importing) { el.importFile.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) {
      el.feedback.textContent = '文件超过 10 MB，请拆分后导入。';
      showToast('文件超过 10 MB');
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
      showToast('已导入 ' + result.added + ' 条成绩');
    }).catch(function (err) {
      if (err.partial) readStore();
      el.feedback.textContent = '导入失败：' + err.message;
      showToast('导入失败');
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
      if (detailsOpen()) return;
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
      if (detailsOpen()) return;
      if (editableTarget(event) && !(press && press.source === 'key')) return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        endPress('key');
      }
    });

    window.addEventListener('blur', function () { audio.stop(); abortInput(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { audio.stop(); abortInput(); }
      refreshReviewPanels();
    });
    window.addEventListener('focus', refreshReviewPanels);

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
    if (el.themeToggle) el.themeToggle.addEventListener('click', function (event) { cycleTheme(); returnTimerFocus(event); });
    el.soundToggle.addEventListener('click', function (event) {
      if (!canChangeGroup() || editingGroup !== null) return;
      settings.inspectionSound = !settings.inspectionSound;
      audio.setEnabled(settings.inspectionSound);
      if (settings.inspectionSound) audio.unlock();
      persistSettings();
      render();
      returnTimerFocus(event);
    });
    el.soundPreview.addEventListener('click', function (event) {
      if (canChangeGroup() && editingGroup === null) { audio.preview(); returnTimerFocus(event); }
    });
    [[el.coreAo5Detail, 5], [el.ao5Detail, 5], [el.coreAo12Detail, 12], [el.ao12Detail, 12]].forEach(function (pair) {
      pair[0].addEventListener('click', function () { openAverage(pair[1], pair[0]); });
    });
    [el.corePbDetail, el.pbDetail, el.coreGlobalPbDetail, el.globalPbDetail].forEach(function (button) {
      button.addEventListener('click', function () {
        if (!canChangeGroup() || editingGroup !== null) return;
        if (!memoryMode) readStore();
        var best = Stats.personalBest(button === el.coreGlobalPbDetail || button === el.globalPbDetail ? allRecords : records);
        if (best) openRecord(best.record.uid, button); else render();
      });
    });
    el.bestAo5Detail.addEventListener('click', function () {
      if (!canChangeGroup() || editingGroup !== null) return;
      if (!memoryMode) readStore();
      var best = Stats.bestAo5Details(records);
      if (best) openAverage(5, el.bestAo5Detail, best.endUid); else render();
    });
    el.averageRows.addEventListener('click', function (event) {
      if (!selectedAverage) return;
      var button = event.target.closest('[data-record-uid]');
      if (button) openRecord(button.getAttribute('data-record-uid'), button);
    });
    el.averageClose.addEventListener('click', closeAverage);
    el.averageContinue.addEventListener('click', continueTiming);
    el.averageDialog.addEventListener('cancel', function (event) { event.preventDefault(); closeAverage(); });
    el.averageDialog.addEventListener('close', function () { if (!el.averageDialog.open && selectedAverage !== null) closeAverage(); });
    el.backupExport.addEventListener('click', function () { if (!el.backupExport.disabled) exportData(); });
    el.backupLater.addEventListener('click', function () {
      if (el.backupLater.disabled) return;
      backup.snooze();
      renderBackup();
      showToast('已暂缓备份提醒');
      el.exportBtn.focus({ preventScroll: true });
    });
    el.groupSelect.addEventListener('pointerdown', function () { groupPointerSelection = true; });
    el.groupSelect.addEventListener('keydown', function () { groupPointerSelection = false; });
    el.groupSelect.addEventListener('change', function () {
      selectGroup(el.groupSelect.value);
      if (groupPointerSelection) returnTimerFocus({ detail: 1 });
      groupPointerSelection = false;
    });
    el.groupNew.addEventListener('click', function () { openGroupEditor(false); });
    el.groupRename.addEventListener('click', function () { openGroupEditor(true); });
    el.groupDelete.addEventListener('click', requestDeleteGroup);
    el.groupDeleteClose.addEventListener('click', function () { closeGroupDeleteDialog(true); });
    el.groupDeleteExport.addEventListener('click', function () { if (deletingGroupId) exportData(); });
    el.groupDeleteConfirm.addEventListener('click', confirmDeleteGroup);
    el.groupDeleteDialog.addEventListener('cancel', function (event) { event.preventDefault(); closeGroupDeleteDialog(true); });
    el.groupDeleteDialog.addEventListener('close', function () { if (!el.groupDeleteDialog.open && deletingGroupId !== null) closeGroupDeleteDialog(true); });
    el.groupForm.addEventListener('submit', saveGroup);
    el.groupCancel.addEventListener('click', closeGroupEditor);
    el.groupName.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeGroupEditor(); }
    });
    el.plusBtn.addEventListener('click', function (event) { togglePenalty('+2'); returnTimerFocus(event); });
    el.dnfBtn.addEventListener('click', function (event) { togglePenalty('dnf'); returnTimerFocus(event); });
    el.deleteBtn.addEventListener('click', function (event) { deleteLatest(); returnTimerFocus(event); });
    [el.undoDelete, el.recordUndo, el.averageUndo].forEach(function (button) { button.addEventListener('click', undoDelete); });
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
    el.copyScrambleBtn.addEventListener('click', function (event) {
      if (el.copyScrambleBtn.disabled) return;
      copyScramble(currentCopyableScramble(), { inDialog: false });
      returnTimerFocus(event);
    });
    el.newScrambleBtn.addEventListener('click', function (event) { newScramble(); returnTimerFocus(event); });
    el.exportBtn.addEventListener('click', exportData);
    el.exportHistoryCsv.addEventListener('click', exportHistoryCsv);
    el.importBtn.addEventListener('click', function () { if (!el.importBtn.disabled) el.importFile.click(); });
    el.importFile.addEventListener('change', importData);
    el.historyToggle.addEventListener('click', function () {
      if (currentView !== 'review') return;
      historyOpen = !historyOpen;
      el.historyBody.hidden = !historyOpen;
      el.historyToggle.setAttribute('aria-expanded', String(historyOpen));
      refreshReviewPanels();
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
    function changeReviewRange(value) {
      reviewLimit = value === 'today' || value === '7days' ? value : value === '100' ? 100 : 50;
      el.reviewRange.value = String(reviewLimit);
      settings.reviewRange = String(reviewLimit);
      persistSettings();
      historyLimit = 50;
      historyVersion = -1;
      el.historyBody.scrollTop = 0;
      reviewVersion = -1;
      render();
    }
    el.reviewRange.addEventListener('change', function () {
      changeReviewRange(el.reviewRange.value);
    });
    el.historyAll.addEventListener('click', function () {
      if (!canChangeGroup() || editingGroup !== null || currentView !== 'review') return;
      changeReviewRange('50');
      el.historyToggle.focus({ preventScroll: true });
    });
    el.reviewHistory.addEventListener('click', function () {
      if (currentView !== 'review' || !dateReview() || !canChangeGroup() || editingGroup !== null) return;
      historyOpen = true;
      el.historyBody.hidden = false;
      el.historyToggle.setAttribute('aria-expanded', 'true');
      refreshReviewPanels();
      el.historyToggle.scrollIntoView({ block: 'start', behavior: 'auto' });
      el.historyToggle.focus({ preventScroll: true });
    });
    el.reviewRecord.addEventListener('change', function () {
      reviewSelectedUid = el.reviewRecord.value; drawReviewChart();
    });
    el.reviewInspect.addEventListener('click', function () { if (currentView === 'review' && reviewOpen) openRecord(reviewSelectedUid, el.reviewInspect); });
    el.reviewChart.addEventListener('click', function (event) {
      if (!reviewData || !reviewData.points.length) return;
      var rect = el.reviewChart.getBoundingClientRect();
      var width = Math.max(280, el.reviewChart.clientWidth || 760);
      var horizontal = (event.clientX - rect.left) * width / rect.width;
      var i = Math.round((horizontal - 74) / (width - 88) * (reviewData.points.length - 1));
      i = Math.max(0, Math.min(reviewData.points.length - 1, i));
      reviewSelectedUid = reviewData.points[i].uid;
      el.reviewRecord.value = reviewSelectedUid; drawReviewChart();
    });
    window.addEventListener('resize', function () { if (currentView === 'review' && reviewOpen) drawReviewChart(); });
    el.recordClose.addEventListener('click', closeRecord);
    el.recordContinue.addEventListener('click', continueTiming);
    el.recordDialog.addEventListener('cancel', function (event) { event.preventDefault(); closeRecord(); });
    el.recordDialog.addEventListener('close', function () { if (!el.recordDialog.open && selectedRecordUid) closeRecord(); });
    el.recordOk.addEventListener('click', function () { setRecordPenalty('ok'); });
    el.recordPlus.addEventListener('click', function () { setRecordPenalty('+2'); });
    el.recordDnf.addEventListener('click', function () { setRecordPenalty('dnf'); });
    el.recordCopyScramble.addEventListener('click', function () {
      if (!selectedRecordUid || el.recordCopyScramble.disabled) return;
      var record = allRecords.find(function (item) { return item.uid === selectedRecordUid; });
      if (record) copyScramble(record.scramble, { inDialog: true });
    });
    el.recordReplayScramble.addEventListener('click', replayRecordScramble);
    el.recordDelete.addEventListener('click', function () { if (selectedRecordUid) deleteRecord(selectedRecordUid); });
    el.recordAo5Detail.addEventListener('click', function () {
      if (!selectedRecordUid) return;
      var record = allRecords.find(function (item) { return item.uid === selectedRecordUid; });
      if (record) openAverage(5, el.recordAo5Detail, record.uid, record.groupId);
    });
    window.addEventListener('storage', function (event) {
      var key = event.key;
      if (key === SETTINGS_KEY) {
        try {
          var nextSettings = JSON.parse(event.newValue || localStorage.getItem(SETTINGS_KEY) || 'null');
          applyTheme(nextSettings && nextSettings.theme);
        } catch (err) {
          applyTheme('light');
        }
        return;
      }
      if (key === 'starcube.backup.v1') { backup.refresh(); renderBackup(); return; }
      if (key && key !== RECORDS_KEY && key.indexOf('starcube.records.v2.item.') !== 0 &&
          key.indexOf('starcube.records.v2.deleted.') !== 0 && key.indexOf(window.StarCubeStore.keys.restoredPrefix) !== 0 &&
          key.indexOf(window.StarCubeStore.keys.groupPrefix) !== 0) return;
      pendingStorageRefresh = true;
      clearTimeout(storageRefreshTimer);
      storageRefreshTimer = setTimeout(function () { render(); }, 40);
    });
  }

  function handleNativeBack() {
    if (deletingGroupId !== null) {
      closeGroupDeleteDialog();
      return true;
    }
    if (selectedRecordUid || selectedAverage !== null) {
      closeDetail();
      return true;
    }
    if (editingGroup !== null) {
      closeGroupEditor();
      return true;
    }
    if (state === 'INSPECTING') {
      if (!press) cancelInspection();
      return true;
    }
    if (state === 'READY' || state === 'RUNNING') {
      if (state === 'RUNNING') showToast('计时中，请先停表');
      return true;
    }
    if (currentView === 'review') {
      switchView('timer');
      return true;
    }
    return false;
  }

  loadData();
  el.historyBody.hidden = !historyOpen;
  el.historyToggle.setAttribute('aria-expanded', String(historyOpen));
  el.reviewBody.hidden = !reviewOpen;
  el.reviewToggle.setAttribute('aria-expanded', String(reviewOpen));
  bindEvents();
  if (typeof window !== 'undefined') {
    window.StarCubeApp = {
      handleBack: handleNativeBack,
      showToast: showToast
    };
  }
  render();
  bootSolver();
})();
