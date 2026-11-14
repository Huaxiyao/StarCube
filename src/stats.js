(function (global) {
  'use strict';

  var PLUS2_MS = 2000;

  function effectiveMs(record) {
    if (!record || record.penalty === 'dnf') return null;
    if (!isFinite(record.ms)) return null;
    return record.ms + (record.penalty === '+2' ? PLUS2_MS : 0);
  }

  function aoN(records, n) {
    if (!Array.isArray(records) || n < 3 || records.length < n) return null;
    var values = records.slice(records.length - n).map(function (record) {
      var value = effectiveMs(record);
      return value === null ? Infinity : value;
    });
    values.sort(function (a, b) { return a - b; });
    // Trim 5% from each end, rounded up (Ao50: 3; Ao100: 5).
    var trimCount = Math.ceil(n / 20);
    var trimmed = values.slice(trimCount, values.length - trimCount);
    var sum = 0;
    for (var i = 0; i < trimmed.length; i++) {
      if (!isFinite(trimmed[i])) return 'DNF';
      sum += trimmed[i];
    }
    return sum / trimmed.length;
  }

  function overallAverage(records) {
    var sum = 0;
    var count = 0;
    (records || []).forEach(function (record) {
      var value = effectiveMs(record);
      if (value !== null) {
        sum += value;
        count++;
      }
    });
    return count ? sum / count : null;
  }

  function personalBest(records) {
    var best = null;
    (records || []).forEach(function (record) {
      var value = effectiveMs(record);
      if (value === null) return;
      if (best === null || value < best.value) {
        best = { value: value, record: record };
      }
    });
    return best;
  }

  function bestAo5(records) {
    if (!Array.isArray(records) || records.length < 5) return null;
    var best = null;
    for (var end = 5; end <= records.length; end++) {
      var average = aoN(records.slice(end - 5, end), 5);
      if (average !== null && average !== 'DNF' && (best === null || average < best)) {
        best = average;
      }
    }
    return best;
  }

  function inspectionPenalty(elapsedMs, inspectionEnabled) {
    if (!inspectionEnabled) return 'ok';
    if (elapsedMs >= 17000) return 'dnf';
    if (elapsedMs >= 15000) return '+2';
    return 'ok';
  }

  function formatMs(ms) {
    var value = Math.max(0, Math.round(ms));
    if (value < 60000) return (value / 1000).toFixed(3);
    var minutes = Math.floor(value / 60000);
    var seconds = Math.floor((value % 60000) / 1000);
    var millis = value % 1000;
    return minutes + ':' + String(seconds).padStart(2, '0') + '.' + String(millis).padStart(3, '0');
  }

  function formatResult(record) {
    if (!record) return '—';
    if (record.penalty === 'dnf') return 'DNF';
    var value = effectiveMs(record);
    return formatMs(value) + (record.penalty === '+2' ? '+' : '');
  }

  global.StarCubeStats = {
    effectiveMs: effectiveMs,
    aoN: aoN,
    overallAverage: overallAverage,
    personalBest: personalBest,
    bestAo5: bestAo5,
    inspectionPenalty: inspectionPenalty,
    formatMs: formatMs,
    formatResult: formatResult
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.StarCubeStats;
  }
})(typeof self !== 'undefined' ? self : globalThis);
