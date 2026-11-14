'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Review = require('../src/review.js');

function rec(number, ms, penalty = 'ok') {
  return { uid: 'solve-' + number, id: number, ms, penalty, groupId: 'practice', at: '2026-11-13T00:00:00.000Z', scramble: 'R U' };
}
function sequence(length) { return Array.from({ length }, (_, i) => rec(i + 1, (i + 1) * 1000)); }
function test(name, check) { check(); console.log('PASS ' + name); }
function approx(actual, expected) { assert.equal(typeof actual, 'number'); assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected); }

test('空训练不生成虚构的零成绩', () => {
  assert.deepEqual(Review.build([], 50), { total: 0, shown: 0, startIndex: 0, validCount: 0, dnfCount: 0, plus2Count: 0, average: null, best: null, points: [] });
  assert.deepEqual(Review.build(null), Review.build([]));
});

test('单次成绩保持 UID 与序号，不足五次没有 Ao5', () => {
  const result = Review.build([rec(17, 0)]);
  assert.equal(result.average, 0);
  assert.equal(result.best, 0);
  assert.equal(result.validCount, 1);
  assert.deepEqual(result.points, [{ uid: 'solve-17', number: 1, value: 0, ao5: null }]);
  assert.deepEqual(Review.build(sequence(4)).points.map(p => p.ao5), [null, null, null, null]);
});

test('已知五次序列同时处理 +2、DNF、平均与最好成绩', () => {
  const result = Review.build([rec(1, 12000), rec(2, 9000, 'dnf'), rec(3, 13000), rec(4, 14000, '+2'), rec(5, 11000)]);
  assert.equal(result.validCount, 4);
  assert.equal(result.dnfCount, 1);
  assert.equal(result.plus2Count, 1);
  assert.equal(result.average, 13000);
  assert.equal(result.best, 11000);
  assert.deepEqual(result.points.map(p => p.value), [12000, null, 13000, 16000, 11000]);
  approx(result.points[4].ao5, 41000 / 3);
});

test('两个 DNF 使 Ao5 为 DNF，后续窗口可恢复', () => {
  const rows = [rec(1, 1000, 'dnf'), rec(2, 1000, 'dnf'), rec(3, 12000), rec(4, 13000), rec(5, 14000), rec(6, 15000)];
  const result = Review.build(rows);
  assert.equal(result.points[4].ao5, 'DNF');
  assert.equal(result.points[5].ao5, 14000);
  assert.equal(result.average, 13500);
});

test('全 DNF 保留空值，不能在曲线上成为零秒', () => {
  const result = Review.build(sequence(8).map(row => ({ ...row, penalty: 'dnf' })));
  assert.equal(result.validCount, 0);
  assert.equal(result.dnfCount, 8);
  assert.equal(result.average, null);
  assert.equal(result.best, null);
  assert.ok(result.points.every(point => point.value === null));
  assert.deepEqual(result.points.map(point => point.ao5), [null, null, null, null, 'DNF', 'DNF', 'DNF', 'DNF']);
});

test('最近 50 次统计只包含窗口，首点 Ao5 仍使用前四次', () => {
  const result = Review.build(sequence(56), 50);
  assert.equal(result.total, 56);
  assert.equal(result.shown, 50);
  assert.equal(result.startIndex, 6);
  assert.equal(result.average, 31500);
  assert.equal(result.best, 7000);
  assert.deepEqual(result.points[0], { uid: 'solve-7', number: 7, value: 7000, ao5: 5000 });
  assert.deepEqual(result.points[49], { uid: 'solve-56', number: 56, value: 56000, ao5: 54000 });
});

test('窗口之前的 DNF 影响首点 Ao5，但不进入窗口 DNF 次数', () => {
  const rows = sequence(56);
  rows[3].penalty = 'dnf';
  rows[5].penalty = 'dnf';
  const result = Review.build(rows, 50);
  assert.equal(result.dnfCount, 0);
  assert.equal(result.validCount, 50);
  assert.equal(result.points[0].ao5, 'DNF');
  assert.equal(result.points[1].ao5, 'DNF');
  assert.equal(result.points[2].ao5, 8000);
});

test('窗口之前的 +2 参与首点 Ao5，但不进入窗口罚时次数', () => {
  const rows = sequence(56);
  rows[5].penalty = '+2';
  const result = Review.build(rows, 50);
  assert.equal(result.plus2Count, 0);
  approx(result.points[0].ao5, 16000 / 3);
});

test('100 次窗口及其他 limit 回退边界', () => {
  const rows = sequence(103);
  const hundred = Review.build(rows, 100);
  assert.equal(hundred.shown, 100);
  assert.equal(hundred.startIndex, 3);
  assert.equal(hundred.average, 53500);
  assert.equal(hundred.points[0].ao5, null);
  assert.equal(hundred.points[1].ao5, 3000);
  [undefined, null, 0, -1, 20, 51, 101, '100', Infinity, NaN].forEach(limit => {
    assert.equal(Review.build(rows, limit).shown, 50);
    assert.equal(Review.build(rows, limit).startIndex, 53);
  });
});

test('相同值不会产生虚构的变化', () => {
  const result = Review.build(Array.from({ length: 100 }, (_, i) => rec(i + 1, 12345)), 100);
  assert.equal(result.average, 12345);
  assert.equal(result.best, 12345);
  assert.ok(result.points.slice(4).every(p => p.value === 12345 && p.ao5 === 12345));
});

test('十万次训练仍只输出最近窗口，序号与统计准确', () => {
  const result = Review.build(sequence(100000), 100);
  assert.equal(result.total, 100000);
  assert.equal(result.shown, 100);
  assert.equal(result.startIndex, 99900);
  assert.equal(result.average, 99950500);
  assert.equal(result.best, 99901000);
  assert.equal(result.points[0].number, 99901);
  assert.equal(result.points[0].ao5, 99899000);
  assert.equal(result.points[99].ao5, 99998000);
});

test('冻结输入可以复盘，修改输出也不会改写原记录', () => {
  const rows = Object.freeze(sequence(56).map(Object.freeze));
  const before = JSON.stringify(rows);
  const result = Review.build(rows, 50);
  result.points[0].value = 1;
  result.points[0].uid = 'changed';
  assert.equal(JSON.stringify(rows), before);
});

test('无需 CommonJS 的浏览器全局入口可使用现有 Stats', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/stats.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/review.js'), 'utf8'), context);
  const result = context.StarCubeReview.build(sequence(5));
  assert.equal(result.points[4].ao5, 3000);
  assert.equal(result.average, 3000);
});
