(function (root) {
  'use strict';

  var STORAGE_KEY = 'starcube.challenges.v1';

  function hashSeed(text) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function localDayKey(nowMs) {
    var d = new Date(nowMs === undefined ? Date.now() : nowMs);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoWeekKey(nowMs) {
    var d = new Date(nowMs === undefined ? Date.now() : nowMs);
    var temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
    return temp.getUTCFullYear() + '-W' + pad2(weekNo);
  }

  function periodKey(type, nowMs) {
    return type === 'weekly' ? isoWeekKey(nowMs) : localDayKey(nowMs);
  }

  function totalSolvesFor(type) {
    return type === 'weekly' ? 12 : 5;
  }

  function challengeId(type, puzzleId, period) {
    return type + ':' + puzzleId + ':' + period;
  }

  function generateScrambles(type, puzzleId, period, puzzlesApi) {
    var api = puzzlesApi || root.StarCubePuzzles;
    var count = totalSolvesFor(type);
    var list = [];
    for (var i = 0; i < count; i++) {
      var rng = mulberry32(hashSeed('StarCube:' + type + ':' + puzzleId + ':' + period + ':solve-' + (i + 1)));
      var generated = api ? api.generateScramble(puzzleId, rng) : null;
      list.push(generated || { algorithm: "R U R' U'", facelets: '', puzzle: puzzleId });
    }
    return list;
  }

  function computeChallengeResult(solves, type, statsApi) {
    var Stats = statsApi || root.StarCubeStats;
    var count = totalSolvesFor(type);
    var records = (solves || []).map(function (s, idx) {
      return { id: idx + 1, ms: s.ms, penalty: s.penalty || 'ok', scramble: s.scramble || '', at: s.at || '' };
    });
    var best = Stats ? Stats.personalBest(records) : null;
    var average = (records.length >= count && Stats) ? Stats.aoN(records, count) : null;
    return {
      completed: records.length >= count,
      count: records.length,
      total: count,
      average: average,
      best: best ? best.value : null
    };
  }

  function computeDailyStreak(entries, nowMs) {
    var days = Object.create(null);
    Object.keys(entries || {}).forEach(function (id) {
      var item = entries[id];
      if (!item || item.type !== 'daily' || !item.completedAt || !item.period) return;
      days[item.period] = true;
    });
    var today = new Date(nowMs === undefined ? Date.now() : nowMs);
    today.setHours(12, 0, 0, 0);
    var cursor = new Date(today.getTime());
    if (!days[localDayKey(cursor.getTime())]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    var streak = 0;
    while (days[localDayKey(cursor.getTime())]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function create(options) {
    options = options || {};
    var storage = options.storage !== undefined ? options.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
    var statsApi = options.stats || root.StarCubeStats;
    var puzzlesApi = options.puzzles || root.StarCubePuzzles;
    var entries = Object.create(null);

    function load() {
      entries = Object.create(null);
      if (!storage) return entries;
      try {
        var raw = storage.getItem(STORAGE_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
          Object.keys(parsed.entries).forEach(function (key) {
            var e = parsed.entries[key];
            if (!e || (e.type !== 'daily' && e.type !== 'weekly') || typeof e.puzzle !== 'string' || typeof e.period !== 'string' || !Array.isArray(e.solves)) return;
            entries[key] = e;
          });
        }
      } catch (err) {}
      return entries;
    }

    function save() {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: entries }));
        return true;
      } catch (err) {
        return false;
      }
    }

    function getOrInit(type, puzzleId, nowMs) {
      var period = periodKey(type, nowMs);
      var id = challengeId(type, puzzleId, period);
      var entry = entries[id];
      if (!entry) {
        entry = {
          id: id,
          type: type,
          puzzle: puzzleId,
          period: period,
          solves: [],
          average: null,
          best: null,
          completedAt: null
        };
      }
      var scrambles = generateScrambles(type, puzzleId, period, puzzlesApi);
      var summary = computeChallengeResult(entry.solves, type, statsApi);
      return {
        entry: entry,
        scrambles: scrambles,
        summary: summary
      };
    }

    function recordSolve(type, puzzleId, period, solveIndex, record) {
      var id = challengeId(type, puzzleId, period);
      var total = totalSolvesFor(type);
      var entry = entries[id] || {
        id: id,
        type: type,
        puzzle: puzzleId,
        period: period,
        solves: [],
        average: null,
        best: null,
        completedAt: null
      };
      if (entry.solves.length >= total || solveIndex !== entry.solves.length) {
        return { entry: entry, summary: computeChallengeResult(entry.solves, type, statsApi), justCompleted: false, isNewBest: false };
      }
      var prevBestAvg = bestAverage(type, puzzleId);
      entry.solves.push({
        ms: record.ms,
        penalty: record.penalty || 'ok',
        scramble: record.scramble || '',
        at: record.at || new Date().toISOString(),
        uid: record.uid || ''
      });
      var summary = computeChallengeResult(entry.solves, type, statsApi);
      entry.average = summary.average;
      entry.best = summary.best;
      var justCompleted = false;
      var isNewBest = false;
      if (summary.completed && !entry.completedAt) {
        entry.completedAt = new Date().toISOString();
        justCompleted = true;
        if (typeof summary.average === 'number' && (prevBestAvg === null || summary.average < prevBestAvg)) {
          isNewBest = true;
        }
      }
      entries[id] = entry;
      save();
      return { entry: entry, summary: summary, justCompleted: justCompleted, isNewBest: isNewBest };
    }

    function updateSolvePenalty(uid, penalty) {
      if (!uid) return false;
      var changed = false;
      Object.keys(entries).forEach(function (id) {
        var entry = entries[id];
        if (!entry || !Array.isArray(entry.solves)) return;
        var hit = false;
        entry.solves.forEach(function (s) {
          if (s.uid === uid) {
            s.penalty = penalty;
            hit = true;
          }
        });
        if (hit) {
          var summary = computeChallengeResult(entry.solves, entry.type, statsApi);
          entry.average = summary.average;
          entry.best = summary.best;
          changed = true;
        }
      });
      if (changed) save();
      return changed;
    }

    function history(type, puzzleId) {
      return Object.keys(entries)
        .map(function (id) { return entries[id]; })
        .filter(function (e) {
          return e && e.type === type && e.puzzle === puzzleId && e.solves && e.solves.length > 0;
        })
        .sort(function (a, b) { return a.period < b.period ? 1 : a.period > b.period ? -1 : 0; });
    }

    function bestAverage(type, puzzleId) {
      var best = null;
      history(type, puzzleId).forEach(function (e) {
        if (e.completedAt && typeof e.average === 'number' && (best === null || e.average < best)) {
          best = e.average;
        }
      });
      return best;
    }

    function totalCompleted() {
      var count = 0;
      Object.keys(entries).forEach(function (id) {
        if (entries[id] && entries[id].completedAt) count++;
      });
      return count;
    }

    function exportAll() {
      return JSON.parse(JSON.stringify(entries));
    }

    function importAll(incoming) {
      if (!incoming || typeof incoming !== 'object') return 0;
      var merged = 0;
      Object.keys(incoming).forEach(function (id) {
        var item = incoming[id];
        if (!item || (item.type !== 'daily' && item.type !== 'weekly') || typeof item.puzzle !== 'string' || typeof item.period !== 'string' || !Array.isArray(item.solves)) return;
        var current = entries[id];
        if (!current || item.solves.length > current.solves.length) {
          entries[id] = JSON.parse(JSON.stringify(item));
          merged++;
        }
      });
      if (merged) save();
      return merged;
    }

    load();
    return {
      load: load,
      getOrInit: getOrInit,
      recordSolve: recordSolve,
      updateSolvePenalty: updateSolvePenalty,
      history: history,
      bestAverage: bestAverage,
      dailyStreak: function (nowMs) { return computeDailyStreak(entries, nowMs); },
      totalCompleted: totalCompleted,
      exportAll: exportAll,
      importAll: importAll
    };
  }

  var api = {
    create: create,
    localDayKey: localDayKey,
    isoWeekKey: isoWeekKey,
    periodKey: periodKey,
    generateScrambles: generateScrambles,
    STORAGE_KEY: STORAGE_KEY
  };

  root.StarCubeChallenge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
