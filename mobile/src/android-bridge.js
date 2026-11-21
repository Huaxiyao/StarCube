(function () {
  'use strict';

  var pendingExports = Object.create(null);
  var pendingUpdates = Object.create(null);
  var exportSeq = 0;
  var updateSeq = 0;
  var lastBackPressAt = 0;
  var readyNotified = false;

  function getAndroid() {
    return typeof window !== 'undefined' && window.StarCubeAndroid ? window.StarCubeAndroid : null;
  }

  function notifyReadyOnce() {
    if (readyNotified) return;
    readyNotified = true;
    var android = getAndroid();
    if (!android || typeof android.onAppReady !== 'function') return;
    var notify = function () {
      try { android.onAppReady(); } catch (err) {}
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        requestAnimationFrame(notify);
      });
    } else {
      notify();
    }
  }

  window.__starCubeOnExportResult = function (requestId, status, message) {
    var resolver = pendingExports[requestId];
    if (!resolver) return;
    delete pendingExports[requestId];
    resolver({
      status: status || 'error',
      message: message || ''
    });
  };

  window.__starCubeOnUpdateResult = function (requestId, payloadJson) {
    var resolver = pendingUpdates[requestId];
    if (!resolver) return;
    delete pendingUpdates[requestId];
    try {
      resolver(JSON.parse(payloadJson || '{}'));
    } catch (err) {
      resolver({ status: 'error', message: '解析更新信息失败' });
    }
  };

  window.__starCubeOnBackPressed = function () {
    var app = window.StarCubeApp;
    if (app && typeof app.handleBack === 'function') {
      try {
        if (app.handleBack()) {
          lastBackPressAt = 0;
          return;
        }
      } catch (err) {}
    }

    var now = Date.now();
    if (now - lastBackPressAt < 2000) {
      lastBackPressAt = 0;
      var android = getAndroid();
      if (android && typeof android.exitApp === 'function') {
        android.exitApp();
      }
      return;
    }

    lastBackPressAt = now;
    if (app && typeof app.showToast === 'function') {
      try {
        app.showToast('再按一次退出 StarCube');
        return;
      } catch (err) {}
    }
    var android = getAndroid();
    if (android && typeof android.showToast === 'function') {
      android.showToast('再按一次退出 StarCube');
    }
  };

  function syncCurrentTheme() {
    var android = getAndroid();
    if (!android || typeof android.setSystemTheme !== 'function') return;
    var meta = document.querySelector('meta[name="theme-color"]');
    var scheme = document.querySelector('meta[name="color-scheme"]');
    var bg = (meta && meta.getAttribute('content')) || '#f3f4f6';
    var isDark = !!(scheme && scheme.getAttribute('content') === 'dark');
    try {
      android.setSystemTheme(bg, isDark);
    } catch (err) {}
  }

  window.__starCubeSyncTheme = syncCurrentTheme;

  window.StarCubeNative = {
    platform: 'android',
    onReady: notifyReadyOnce,
    getVersion: function () {
      var android = getAndroid();
      if (android && typeof android.getAppVersion === 'function') {
        try {
          return String(android.getAppVersion() || '');
        } catch (err) {}
      }
      return '';
    },
    checkUpdate: function () {
      return new Promise(function (resolve) {
        var android = getAndroid();
        if (!android || typeof android.checkUpdate !== 'function') {
          resolve({ status: 'error', message: '当前环境不支持应用内检查更新' });
          return;
        }
        var requestId = 'upd-' + (++updateSeq);
        pendingUpdates[requestId] = resolve;
        try {
          android.checkUpdate(requestId);
        } catch (err) {
          delete pendingUpdates[requestId];
          resolve({ status: 'error', message: (err && err.message) || '发起更新检查失败' });
        }
      });
    },
    openUrl: function (url) {
      var android = getAndroid();
      if (android && typeof android.openExternalUrl === 'function') {
        try {
          return !!android.openExternalUrl(String(url || ''));
        } catch (err) {}
      }
      return false;
    },
    haptic: function (kind) {
      var android = getAndroid();
      if (android && typeof android.haptic === 'function') {
        try {
          android.haptic(String(kind || 'tap'));
        } catch (err) {}
      }
    },
    setTheme: function (themeColor, isDark) {
      var android = getAndroid();
      if (android && typeof android.setSystemTheme === 'function') {
        try {
          android.setSystemTheme(String(themeColor || '#f3f4f6'), !!isDark);
        } catch (err) {}
      }
    },
    exportFile: function (options) {
      return new Promise(function (resolve) {
        var android = getAndroid();
        if (!options || !android || typeof android.exportFile !== 'function') {
          resolve({ status: 'error', message: '原生文件导出接口不可用' });
          return;
        }
        var requestId = 'exp-' + (++exportSeq);
        pendingExports[requestId] = resolve;
        try {
          android.exportFile(
            requestId,
            String(options.filename || 'starcube-export.txt'),
            String(options.mimeType || 'application/octet-stream'),
            String(options.content || '')
          );
        } catch (err) {
          delete pendingExports[requestId];
          resolve({ status: 'error', message: (err && err.message) || '调用系统保存窗口失败' });
        }
      });
    }
  };

  function relaxAndroidJsonPicker() {
    var input = document.getElementById('importFile');
    if (input) {
      input.setAttribute('accept', 'application/json,text/plain,application/octet-stream,.json');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      syncCurrentTheme();
      relaxAndroidJsonPicker();
      notifyReadyOnce();
    });
  } else {
    syncCurrentTheme();
    relaxAndroidJsonPicker();
    notifyReadyOnce();
  }
})();
