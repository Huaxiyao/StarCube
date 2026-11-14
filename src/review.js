(function (global) {
  'use strict';

  var Stats = typeof module !== 'undefined' && module.exports ? require('./stats.js') : global.StarCubeStats;

  // The caller supplies one group's records in chronological order. Windowing
  // affects the summary only; rolling averages retain preceding solves.
  function build(records, limit) {
    records = Array.isArray(records) ? records : [];
    limit = limit === 100 ? 100 : 50;
    var startIndex = Math.max(0, records.length - limit);
    var visible = records.slice(startIndex);
    var validCount = 0;
    var dnfCount = 0;
    var plus2Count = 0;
    var best = Stats.personalBest(visible);
    var points = visible.map(function (record, offset) {
      var index = startIndex + offset;
      var value = Stats.effectiveMs(record);
      if (value !== null) validCount++;
      if (record.penalty === 'dnf') dnfCount++;
      if (record.penalty === '+2') plus2Count++;
      return {
        uid: record.uid,
        number: index + 1,
        value: value,
        ao5: index < 4 ? null : Stats.aoN(records.slice(index - 4, index + 1), 5)
      };
    });

    return {
      total: records.length,
      shown: visible.length,
      startIndex: startIndex,
      validCount: validCount,
      dnfCount: dnfCount,
      plus2Count: plus2Count,
      average: Stats.overallAverage(visible),
      best: best === null ? null : best.value,
      points: points
    };
  }

  global.StarCubeReview = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.StarCubeReview;
})(typeof self !== 'undefined' ? self : globalThis);
