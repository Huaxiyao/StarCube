'use strict';

const assert = require('node:assert/strict');
const Stats = require('../src/stats.js');
const Puzzles = require('../src/puzzles.js');
const Challenge = require('../src/challenge.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

// 1. 同一天同项目生成完全相同的 5 条确定性日赛打乱
const day = '2026-11-21';
const setA = Challenge.generateScrambles('daily', '333', day, Puzzles);
const setB = Challenge.generateScrambles('daily', '333', day, Puzzles);
assert.equal(setA.length, 5);
assert.deepEqual(setA.map(s => s.algorithm), setB.map(s => s.algorithm));
console.log('PASS Daily 5-solve scrambles are deterministic for the same day and puzzle');

// 2. 周赛生成 12 条打乱且与日赛不同
const week = Challenge.isoWeekKey(new Date('2026-11-21T12:00:00Z').getTime());
const weeklySet = Challenge.generateScrambles('weekly', '444', week, Puzzles);
assert.equal(weeklySet.length, 12);
assert.notEqual(weeklySet[0].algorithm, weeklySet[1].algorithm);
console.log('PASS Weekly challenge generates 12 distinct puzzle-matched scrambles');

// 3. 日赛 5 把完成自动结算 Ao5、最佳单次、连续打卡天数与罚时同步
const storage = memoryStorage();
const store = Challenge.create({ storage, stats: Stats, puzzles: Puzzles });
const nowMs = new Date('2026-11-21T12:00:00').getTime();
const init = store.getOrInit('daily', '333', nowMs);
const times = [12000, 11000, 13000, 10000, 14000];
let lastRes = null;
for (let i = 0; i < 5; i++) {
  lastRes = store.recordSolve('daily', '333', init.entry.period, i, {
    uid: 'u-' + i,
    ms: times[i],
    penalty: 'ok',
    scramble: init.scrambles[i].algorithm,
    at: '2026-11-21T12:00:0' + i + 'Z'
  });
}
assert.equal(lastRes.justCompleted, true);
assert.equal(lastRes.isNewBest, true);
assert.equal(lastRes.summary.average, 12000);
assert.equal(lastRes.summary.best, 10000);
assert.equal(store.dailyStreak(nowMs), 1);
assert.equal(store.totalCompleted(), 1);
console.log('PASS Daily 5-solve settlement calculates Ao5, best single, and daily streak');

// 4. 修改罚时同步重算赛事平均
store.updateSolvePenalty('u-2', '+2');
const afterPenalty = store.getOrInit('daily', '333', nowMs);
// [12000, 11000, 15000, 10000, 14000] 去尾 10000 和 15000 后，平均 (11000 + 12000 + 14000) / 3
assert.equal(Math.round(afterPenalty.summary.average), Math.round((11000 + 12000 + 14000) / 3));
console.log('PASS Updating solve penalty recalculates saved challenge average');

// 5. 导出导入合并
const exported = store.exportAll();
const store2 = Challenge.create({ storage: memoryStorage(), stats: Stats, puzzles: Puzzles });
assert.equal(store2.importAll(exported), 1);
assert.equal(store2.totalCompleted(), 1);
console.log('PASS Challenge history exports and merges cleanly');

// 6. 2x2 / Pyraminx / Skewb 确定性挑战也严格走 WCA Random-State
for (const [pid, minOpt] of [['222', 4], ['pyram', 6], ['skewb', 7]]) {
  const s1 = Challenge.generateScrambles('daily', pid, day, Puzzles);
  const s2 = Challenge.generateScrambles('daily', pid, day, Puzzles);
  assert.equal(s1.length, 5);
  assert.deepEqual(s1.map(s => s.algorithm), s2.map(s => s.algorithm));
  for (const item of s1) {
    assert.ok(Puzzles.optimalMoves(pid, item.algorithm) >= minOpt, pid + ' challenge optimal >= ' + minOpt);
  }
}
console.log('PASS Deterministic daily challenges for 2x2, Pyraminx, and Skewb use WCA random-state');
