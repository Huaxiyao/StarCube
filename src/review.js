(function (global) {
  'use strict';

  var Stats = typeof module !== 'undefined' && module.exports ? require('./stats.js') : global.StarCubeStats;

  // The caller supplies one group's records in chronological order. Windowing
  // affects the summary only; rolling averages retain preceding solves.
  function build(records, limit, now) {
    records = Array.isArray(records) ? records : [];
    if (limit === 'today' || limit === '7days') return buildDateRange(records, limit, now);
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

  function dateRange(mode, now) {
    var nowMs = now === undefined ? Date.now() : typeof now === 'number' ? now :
      Object.prototype.toString.call(now) === '[object Date]' ? now.getTime() : NaN;
    var end = new Date(nowMs);
    if (!isFinite(end.getTime())) throw new RangeError('复盘时间必须是有效日期或毫秒时间戳');
    var days = mode === 'today' ? 1 : 7;
    var start = new Date(end);
    // Calendar dates preserve local midnights across 23/25-hour DST days.
    start.setDate(start.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    var prior = new Date(start);
    prior.setDate(prior.getDate() - days);
    prior.setHours(0, 0, 0, 0);
    var label = mode === 'today' ? '今天' : '最近 7 天';
    return {
      mode: mode,
      days: days,
      periodStart: start.getTime(),
      periodEnd: end.getTime(),
      priorStart: prior.getTime(),
      priorEnd: start.getTime(),
      label: label,
      currentLabel: label,
      priorLabel: mode === 'today' ? '昨天' : '前 7 天',
      dayKey: end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0')
    };
  }

  function emptySummary() {
    return { count: 0, validCount: 0, dnfCount: 0, plus2Count: 0,
      sum: 0, mean: 0, squaredDeviation: 0, best: null };
  }

  function addToSummary(summary, record) {
    summary.count++;
    if (record.penalty === 'dnf') summary.dnfCount++;
    if (record.penalty === '+2') summary.plus2Count++;
    var value = Stats.effectiveMs(record);
    if (value === null || !isFinite(value)) return;
    summary.validCount++;
    summary.sum += value;
    // Welford's update avoids cancellation for tightly clustered large values.
    var delta = value - summary.mean;
    summary.mean += delta / summary.validCount;
    summary.squaredDeviation += delta * (value - summary.mean);
    if (summary.best === null || value < summary.best) summary.best = value;
  }

  function summarize(summary) {
    return {
      count: summary.count,
      validCount: summary.validCount,
      dnfCount: summary.dnfCount,
      plus2Count: summary.plus2Count,
      average: summary.validCount ? summary.sum / summary.validCount : null,
      best: summary.best,
      stddev: summary.validCount < 2 ? null : Math.sqrt(Math.max(0, summary.squaredDeviation / summary.validCount)),
      dnfRate: summary.count ? summary.dnfCount / summary.count : null,
      smallSample: summary.validCount < 5
    };
  }

  function difference(current, previous) {
    return current === null || previous === null ? null : current - previous;
  }

  function buildDateRange(records, mode, now) {
    var range = dateRange(mode, now);
    var current = emptySummary(), previous = emptySummary();
    var plotIndices = [];
    records.forEach(function (record, index) {
      if (!record || typeof record.at !== 'string' || !record.at.trim()) return;
      var at = Date.parse(record.at);
      if (!isFinite(at)) return;
      if (at >= range.periodStart && at <= range.periodEnd) {
        addToSummary(current, record);
        // Keep at most 100 chart indices even for a very large date range.
        plotIndices[(current.count - 1) % 100] = index;
      } else if (at >= range.priorStart && at < range.priorEnd) {
        addToSummary(previous, record);
      }
    });
    if (current.count > 100) {
      var offset = current.count % 100;
      plotIndices = plotIndices.slice(offset).concat(plotIndices.slice(0, offset));
    }
    current = summarize(current);
    previous = summarize(previous);
    var points = plotIndices.map(function (index) {
      var record = records[index];
      return {
        uid: record.uid,
        number: index + 1,
        value: Stats.effectiveMs(record),
        ao5: index < 4 ? null : Stats.aoN(records.slice(index - 4, index + 1), 5)
      };
    });
    return {
      total: records.length,
      shown: current.count,
      startIndex: plotIndices.length ? plotIndices[0] : records.length,
      validCount: current.validCount,
      dnfCount: current.dnfCount,
      plus2Count: current.plus2Count,
      average: current.average,
      best: current.best,
      stddev: current.stddev,
      dnfRate: current.dnfRate,
      smallSample: current.smallSample,
      chartShown: points.length,
      plotTruncated: current.count > points.length,
      points: points,
      dateRange: range,
      comparison: {
        previous: previous,
        delta: {
          average: difference(current.average, previous.average),
          stddev: difference(current.stddev, previous.stddev),
          dnfRate: difference(current.dnfRate, previous.dnfRate)
        }
      }
    };
  }

  function filterHistory(records, limit, now) {
    records = Array.isArray(records) ? records : [];
    var range = (limit === 'today' || limit === '7days') ? dateRange(limit, now) : null;
    var entries = [];
    records.forEach(function (record, index) {
      if (!range) {
        entries.push({ record: record, index: index });
        return;
      }
      if (!record || typeof record.at !== 'string' || !record.at.trim()) return;
      var at = Date.parse(record.at);
      if (isFinite(at) && at >= range.periodStart && at <= range.periodEnd) {
        entries.push({ record: record, index: index });
      }
    });
    return { range: range, entries: entries };
  }

  function escapeCsvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function formatCsvDateTime(iso) {
    if (typeof iso !== 'string' || !iso.trim()) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
      pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function csvStatus(penalty) {
    if (penalty === '+2') return '+2';
    if (penalty === 'dnf') return 'DNF';
    return '正常';
  }

  // 生成与历史列表顺序一致（最新在前）的 CSV，带 UTF-8 BOM 以兼容 Excel 中文显示。
  function historyCsv(entries) {
    entries = Array.isArray(entries) ? entries : [];
    var lines = ['记录时间,原始用时,状态,打乱公式'];
    for (var i = entries.length - 1; i >= 0; i--) {
      var item = entries[i];
      var record = item && item.record ? item.record : item;
      if (!record) continue;
      var rawTime = typeof record.ms === 'number' && isFinite(record.ms) ? Stats.formatMs(record.ms) : '';
      var scramble = typeof record.scramble === 'string' ? record.scramble : '';
      lines.push([
        escapeCsvCell(formatCsvDateTime(record.at)),
        escapeCsvCell(rawTime),
        escapeCsvCell(csvStatus(record.penalty)),
        escapeCsvCell(scramble)
      ].join(','));
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  global.StarCubeReview = {
    build: build,
    dateRange: dateRange,
    filterHistory: filterHistory,
    historyCsv: historyCsv
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.StarCubeReview;
})(typeof self !== 'undefined' ? self : globalThis);
