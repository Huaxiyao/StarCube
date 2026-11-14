(function (global) {
  'use strict';

  // All cues are synthesized locally. Audio is optional and never controls timing.
  function create(options) {
    options = options || {};
    var AudioContextClass = options.AudioContext || global.AudioContext || global.webkitAudioContext;
    var context = null;
    var resumePending = null;
    var enabled = false;
    var inspecting = false;
    var eightConsumed = false;
    var twelveConsumed = false;
    var lastElapsed = 0;
    var operationGeneration = 0;
    var previewGeneration = 0;
    var voices = [];
    var status = typeof AudioContextClass === 'function'
      ? { state: 'ready', message: '' }
      : { state: 'unavailable', message: '此浏览器不支持提示音，计时仍可正常使用。' };

    function getStatus() {
      return { state: status.state, message: status.message };
    }

    function report(state, message) {
      if (status.state === state && status.message === message) return;
      status = { state: state, message: message };
      // A UI feedback callback must not interrupt the timer or an audio promise.
      if (typeof options.onStatus === 'function') {
        try { options.onStatus(getStatus()); } catch (err) { /* optional feedback */ }
      }
    }

    function disconnect(voice) {
      voice.oscillator.onended = null;
      try { voice.oscillator.disconnect(); } catch (err) { /* already disconnected */ }
      try { voice.gain.disconnect(); } catch (err) { /* already disconnected */ }
      var index = voices.indexOf(voice);
      if (index >= 0) voices.splice(index, 1);
    }

    function silence(kind) {
      voices.slice().forEach(function (voice) {
        if (kind && voice.kind !== kind) return;
        var now = voice.context.currentTime;
        try {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setValueAtTime(0, now);
        } catch (err) { /* disconnect below also silences it */ }
        try { voice.oscillator.stop(now); } catch (err) { /* already stopped */ }
        disconnect(voice);
      });
    }

    function clearLoading() {
      if (status.state === 'loading') report('ready', '');
    }

    function setEnabled(value) {
      enabled = value === true;
      if (!enabled) {
        operationGeneration++;
        previewGeneration++;
        silence();
        clearLoading();
      }
    }

    // Invoke from a real user gesture. No context is created or resumed by RAF.
    function unlock() {
      var generation = operationGeneration;
      if (typeof AudioContextClass !== 'function') {
        report('unavailable', '此浏览器不支持提示音，计时仍可正常使用。');
        return Promise.resolve(false);
      }
      try {
        if (!context || context.state === 'closed') {
          silence();
          context = new AudioContextClass();
          resumePending = null;
        }
        if (context.state === 'running') {
          report('ready', '');
          return Promise.resolve(true);
        }
        report('loading', '正在启用提示音…');
        if (!resumePending) {
          var requestedContext = context;
          var resumed = Promise.resolve(requestedContext.resume()).then(function () {
            return requestedContext.state === 'running';
          }, function () { return false; });
          resumePending = resumed;
          resumed.then(function () {
            if (resumePending === resumed) resumePending = null;
          });
        }
        var activeContext = context;
        return resumePending.then(function (ready) {
          if (generation !== operationGeneration || activeContext !== context) return false;
          if (!ready) {
            report('blocked', '提示音未能启用，请点击试听重试；计时不受影响。');
            return false;
          }
          report('ready', '');
          return true;
        });
      } catch (err) {
        report('blocked', '提示音未能启用，请点击试听重试；计时不受影响。');
        return Promise.resolve(false);
      }
    }

    function tone(frequency, when, kind) {
      var gain = context.createGain();
      var oscillator;
      try { oscillator = context.createOscillator(); }
      catch (err) { try { gain.disconnect(); } catch (ignored) {} throw err; }
      var voice = { oscillator: oscillator, gain: gain, kind: kind, context: context };
      voices.push(voice);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, when);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.055, when + 0.012);
      gain.gain.setValueAtTime(0.055, when + 0.065);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = function () { disconnect(voice); };
      oscillator.start(when);
      oscillator.stop(when + 0.14);
    }

    function cue(second, when, kind) {
      if (second === 8) tone(660, when, kind);
      else {
        tone(880, when, kind);
        tone(880, when + 0.20, kind);
      }
    }

    function play(second, kind) {
      if (!context || context.state !== 'running') {
        report('blocked', '提示音被浏览器暂停，请在停止后点击试听恢复。');
        return false;
      }
      try {
        cue(second, context.currentTime + 0.005, kind);
        return true;
      } catch (err) {
        silence(kind);
        report('blocked', '提示音播放失败，请点击试听重试；计时不受影响。');
        return false;
      }
    }

    function startInspection() {
      // A new observation cancels a pending preview, but preserves an unlock
      // initiated by the same key/touch event just before startInspection().
      previewGeneration++;
      silence();
      inspecting = true;
      eightConsumed = false;
      twelveConsumed = false;
      lastElapsed = 0;
    }

    function updateInspection(elapsedMs) {
      if (!inspecting || typeof elapsedMs !== 'number' || !isFinite(elapsedMs)) return false;
      lastElapsed = Math.max(lastElapsed, elapsedMs, 0);
      var second = null;
      if (lastElapsed >= 15000) {
        eightConsumed = true;
        twelveConsumed = true;
        // A context may have been suspended between the two notes at 12 s.
        // Retire those scheduled notes too, so a later resume cannot play them.
        silence('inspection');
        return false;
      }
      if (lastElapsed >= 12000 && !twelveConsumed) {
        // If a backgrounded tab skips both boundaries, only the newer cue plays.
        eightConsumed = true;
        twelveConsumed = true;
        second = 12;
      } else if (lastElapsed >= 8000 && !eightConsumed) {
        eightConsumed = true;
        second = 8;
      }
      if (second === null || !enabled) return false;
      return play(second, 'inspection');
    }

    function preview() {
      var previewToken = ++previewGeneration;
      var generation = operationGeneration;
      silence('preview');
      return unlock().then(function (ready) {
        if (!ready || previewToken !== previewGeneration || generation !== operationGeneration) return false;
        if (!context || context.state !== 'running') return false;
        try {
          var now = context.currentTime + 0.005;
          cue(8, now, 'preview');
          cue(12, now + 0.48, 'preview');
          return true;
        } catch (err) {
          silence('preview');
          report('blocked', '试听播放失败，请重试；计时不受影响。');
          return false;
        }
      });
    }

    function stop() {
      operationGeneration++;
      previewGeneration++;
      inspecting = false;
      eightConsumed = false;
      twelveConsumed = false;
      lastElapsed = 0;
      silence();
      clearLoading();
    }

    return {
      setEnabled: setEnabled,
      unlock: unlock,
      startInspection: startInspection,
      updateInspection: updateInspection,
      stop: stop,
      preview: preview,
      getStatus: getStatus
    };
  }

  global.StarCubeAudio = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.StarCubeAudio;
})(typeof self !== 'undefined' ? self : globalThis);
