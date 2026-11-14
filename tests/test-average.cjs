'use strict';

const assert = require('node:assert/strict');
const S = require('../src/stats.js');

function record(ms, penalty = 'ok', uid = 'solve') {
  return { uid, ms, penalty };
}
function series(n) {
  return Array.from({ length: n }, (_, i) => record((i + 1) * 1000, 'ok', 'solve-' + (i + 1)));
}
function test(name, run) {
  run();
  console.log('PASS ' + name);
}
function checkCounts(details) {
  assert.equal(details.rows.filter(row => row.excluded === 'best').length, details.trimCount);
  assert.equal(details.rows.filter(row => row.excluded === 'worst').length, details.trimCount);
  assert.equal(details.rows.filter(row => row.excluded === null).length, details.includedCount);
}

test('Ao5 明细包含 +2、去掉最快和 DNF 并给出保留项总和', () => {
  const records = [record(12000), record(0, 'dnf'), record(13000), record(14000, '+2'), record(11000)];
  const details = S.averageDetails(records, 5);
  assert.equal(details.n, 5);
  assert.equal(details.trimCount, 1);
  assert.equal(details.includedCount, 3);
  assert.equal(details.sum, 41000);
  assert.equal(details.value, 41000 / 3);
  assert.equal(details.value, S.aoN(records, 5));
  assert.deepEqual(details.rows.map(row => row.effectiveMs), [12000, null, 13000, 16000, 11000]);
  assert.deepEqual(details.rows.map(row => row.excluded), [null, 'worst', null, null, 'best']);
  checkCounts(details);
});

for (const [n, trimCount, includedCount, sum, value] of [
  [12, 1, 10, 65000, 6500],
  [50, 3, 44, 1122000, 25500],
  [100, 5, 90, 4545000, 50500]
]) {
  test('Ao' + n + ' 已知序列的去尾数、保留数、总和与平均值', () => {
    const records = series(n);
    const details = S.averageDetails(records, n);
    assert.equal(details.trimCount, trimCount);
    assert.equal(details.includedCount, includedCount);
    assert.equal(details.sum, sum);
    assert.equal(details.value, value);
    assert.equal(details.value, S.aoN(records, n));
    assert.deepEqual(details.rows.slice(0, trimCount).map(row => row.excluded), Array(trimCount).fill('best'));
    assert.deepEqual(details.rows.slice(-trimCount).map(row => row.excluded), Array(trimCount).fill('worst'));
    checkCounts(details);
  });
}

test('只使用最近 N 条，保留完整列表序号、UID、原记录引用及时间顺序', () => {
  const records = series(9);
  records[4].uid = 'stable-id';
  const details = S.averageDetails(records, 5);
  assert.deepEqual(details.rows.map(row => row.number), [5, 6, 7, 8, 9]);
  assert.deepEqual(details.rows.map(row => row.uid), ['stable-id', 'solve-6', 'solve-7', 'solve-8', 'solve-9']);
  details.rows.forEach((row, index) => assert.equal(row.record, records[index + 4]));
  assert.equal(details.sum, 21000);
  assert.equal(details.value, 7000);
});

for (const n of [5, 50, 100]) {
  test('Ao' + n + ' 同分按原序稳定去尾，恰好排除指定数量', () => {
    const records = series(n).map(item => ({ ...item, ms: 10000 }));
    const details = S.averageDetails(records, n);
    const count = Math.ceil(n / 20);
    assert.deepEqual(details.rows.map(row => row.excluded), [
      ...Array(count).fill('best'), ...Array(n - 2 * count).fill(null), ...Array(count).fill('worst')
    ]);
    assert.equal(details.value, 10000);
    checkCounts(details);
  });
}

test('+2 后相同的有效成绩按原序去尾', () => {
  const records = [record(10000), record(8000, '+2'), record(12000), record(14000), record(12000, '+2')];
  const details = S.averageDetails(records, 5);
  assert.deepEqual(details.rows.map(row => row.excluded), ['best', null, null, null, 'worst']);
  assert.equal(details.sum, 36000);
  assert.equal(details.value, 12000);
});

test('全 DNF 仍有完整明细，稳定去尾且无有限总和', () => {
  const records = series(5).map(item => ({ ...item, penalty: 'dnf' }));
  const details = S.averageDetails(records, 5);
  assert.equal(details.value, 'DNF');
  assert.equal(details.sum, null);
  assert.deepEqual(details.rows.map(row => row.effectiveMs), Array(5).fill(null));
  assert.deepEqual(details.rows.map(row => row.excluded), ['best', null, null, null, 'worst']);
  checkCounts(details);
});

for (const n of [5, 12, 50, 100]) {
  test('Ao' + n + ' 可去尾的 DNF 数量与多一条 DNF 的边界', () => {
    const count = Math.ceil(n / 20);
    const records = series(n).map((item, index) => ({
      ...item, ms: 10000, penalty: index < count ? 'dnf' : 'ok'
    }));
    let details = S.averageDetails(records, n);
    assert.equal(details.value, 10000);
    assert.equal(details.sum, (n - 2 * count) * 10000);
    assert.ok(details.rows.slice(0, count).every(row => row.excluded === 'worst'));
    checkCounts(details);
    records[count].penalty = 'dnf';
    details = S.averageDetails(records, n);
    assert.equal(details.value, 'DNF');
    assert.equal(details.sum, null);
    assert.equal(details.value, S.aoN(records, n));
    assert.equal(details.rows[0].excluded, null, '最早的同分 DNF 留在保留项中');
    assert.ok(details.rows.slice(1, count + 1).every(row => row.excluded === 'worst'));
    checkCounts(details);
  });
}

test('非法 N、非数组和不足 N 条返回 null', () => {
  const records = series(12);
  for (const n of [undefined, null, NaN, Infinity, -1, 0, 1, 2, 5.5, '5', {}, 13]) {
    assert.equal(S.averageDetails(records, n), null);
  }
  for (const records of [undefined, null, {}, '12345', [], series(4)]) {
    assert.equal(S.averageDetails(records, 5), null);
  }
  assert.equal(S.averageDetails(series(3), 3).value, 2000);
});

test('不可用记录作为 DNF 参与排序和明细', () => {
  const records = [record(10000), record(11000), record(12000), record(13000), null];
  let details = S.averageDetails(records, 5);
  assert.equal(details.rows[4].effectiveMs, null);
  assert.equal(details.rows[4].excluded, 'worst');
  assert.equal(details.value, 12000);
  records[0] = record(NaN);
  details = S.averageDetails(records, 5);
  assert.equal(details.value, 'DNF');
  assert.equal(details.sum, null);
});

test('冻结的输入和记录不变，重复调用不会共享行状态', () => {
  const records = Object.freeze(series(12).map((item, index) => Object.freeze({
    ...item, ms: 17000 - index * 1000, penalty: index === 8 ? '+2' : 'ok'
  })));
  const before = JSON.stringify(records);
  const first = S.averageDetails(records, 5);
  const second = S.averageDetails(records, 5);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(first, second);
  first.rows[0].excluded = 'changed';
  assert.notEqual(second.rows[0].excluded, 'changed');
});

test('多组非对称数据、罚时和 DNF 明细与既有 aoN 一致', () => {
  for (const n of [5, 12, 50, 100]) {
    for (let seed = 0; seed < 20; seed++) {
      const records = Array.from({ length: n + 7 }, (_, index) => record(
        ((index * 7919 + seed * 1297) % 90000) + 500,
        (index + seed) % 17 === 0 ? 'dnf' : (index + seed) % 7 === 0 ? '+2' : 'ok',
        'id-' + index
      ));
      const details = S.averageDetails(records, n);
      assert.equal(details.value, S.aoN(records, n), 'Ao' + n + ', seed ' + seed);
      checkCounts(details);
      assert.deepEqual(details.rows.map(row => row.number), Array.from({ length: n }, (_, i) => i + 8));
      assert.equal(details.rows.filter(row => row.excluded === null && row.effectiveMs === null).length > 0,
        details.sum === null);
    }
  }
});
