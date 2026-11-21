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

  function averageDetails(records, n, endUid) {
    if (!Array.isArray(records)) return null;
    var endIndex = records.length - 1;
    if (endUid !== undefined) {
      if (typeof endUid !== 'string' || !endUid) return null;
      endIndex = records.findIndex(function (record) { return record && record.uid === endUid; });
    }
    return averageDetailsAt(records, n, endIndex);
  }

  function averageDetailsAt(records, n, endIndex) {
    if (!Number.isInteger(n) || n < 3 || endIndex < n - 1 || endIndex >= records.length) return null;
    var start = endIndex - n + 1;
    var rows = records.slice(start, endIndex + 1).map(function (record, index) {
      return {
        uid: record ? record.uid : undefined,
        number: start + index + 1,
        record: record,
        effectiveMs: effectiveMs(record),
        excluded: null
      };
    });
    var sorted = rows.slice().sort(function (a, b) {
      var aValue = a.effectiveMs === null ? Infinity : a.effectiveMs;
      var bValue = b.effectiveMs === null ? Infinity : b.effectiveMs;
      // Original position also makes tied times and DNF exclusions deterministic.
      return (aValue - bValue) || (a.number - b.number);
    });
    var trimCount = Math.ceil(n / 20);
    var includedCount = n - trimCount * 2;
    for (var i = 0; i < trimCount; i++) {
      sorted[i].excluded = 'best';
      sorted[n - 1 - i].excluded = 'worst';
    }
    var sum = 0;
    for (var j = trimCount; j < n - trimCount; j++) {
      var value = sorted[j].effectiveMs;
      if (value === null || !isFinite(value)) {
        sum = null;
        break;
      }
      sum += value;
    }
    return {
      n: n,
      startIndex: start,
      endIndex: endIndex,
      endUid: records[endIndex] ? records[endIndex].uid : undefined,
      trimCount: trimCount,
      value: sum === null ? 'DNF' : sum / includedCount,
      sum: sum,
      includedCount: includedCount,
      rows: rows
    };
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

  function bestAo5Details(records) {
    if (!Array.isArray(records) || records.length < 5) return null;
    var best = null;
    var bestEnd = -1;
    for (var end = 5; end <= records.length; end++) {
      var average = aoN(records.slice(end - 5, end), 5);
      if (average !== null && average !== 'DNF' && (best === null || average < best)) {
        best = average;
        bestEnd = end - 1;
      }
    }
    return bestEnd < 0 ? null : averageDetailsAt(records, 5, bestEnd);
  }

  function bestAo5(records) {
    var details = bestAo5Details(records);
    return details === null ? null : details.value;
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
    averageDetails: averageDetails,
    overallAverage: overallAverage,
    personalBest: personalBest,
    bestAo5: bestAo5,
    bestAo5Details: bestAo5Details,
    inspectionPenalty: inspectionPenalty,
    formatMs: formatMs,
    formatResult: formatResult
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.StarCubeStats;
  }
})(typeof self !== 'undefined' ? self : globalThis);
