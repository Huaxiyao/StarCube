'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Audio = require('../src/audio.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(options = {}) {
  const contexts = [], statuses = [];
  const pending = options.deferred ? deferred() : null;
  class FakeContext {
    constructor() {
      if (options.constructorError) throw Error('context unavailable');
      this.state = options.state || 'running';
      this.currentTime = 5;
      this.destination = {};
      this.oscillators = [];
      this.gains = [];
      this.resumeCalls = 0;
      contexts.push(this);
    }
    resume() {
      this.resumeCalls++;
      if (options.resumeThrows) throw Error('resume denied');
      if (options.resumeRejects) return Promise.reject(Error('resume denied'));
      if (pending) return pending.promise.then(() => { this.state = 'running'; });
      if (!options.staySuspended) this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      const gain = { disconnected: false, connected: null, events: [],
        connect(target) { this.connected = target; }, disconnect() { this.disconnected = true; } };
      gain.gain = Object.fromEntries(['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues']
        .map(name => [name, (...args) => gain.events.push({ name, args })]));
      this.gains.push(gain);
      return gain;
    }
    createOscillator() {
      if (options.toneError) throw Error('oscillator unavailable');
      const oscillator = { disconnected: false, startTimes: [], stopTimes: [], pitches: [],
        connect(target) { this.connected = target; }, disconnect() { this.disconnected = true; },
        start(time) { this.startTimes.push(time); }, stop(time) { this.stopTimes.push(time); } };
      oscillator.frequency = { setValueAtTime: (...args) => oscillator.pitches.push(args) };
      this.oscillators.push(oscillator);
      return oscillator;
    }
  }
  const player = Audio.create({ AudioContext: FakeContext, onStatus: status => {
    statuses.push(status);
    if (options.callbackThrows) throw Error('optional UI callback failed');
  } });
  return { player, contexts, statuses, pending, context: () => contexts[0] };
}

let passed = 0;
async function test(name, callback) { await callback(); passed++; console.log('PASS ' + name); }

(async () => {
  await test('default off and RAF observation do not construct an AudioContext', () => {
    const h = harness(); h.player.startInspection();
    h.player.updateInspection(8000); h.player.updateInspection(12000);
    assert.equal(h.contexts.length, 0);
  });

  await test('8 second single and 12 second double tones fire once at exact boundaries', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    assert.equal(h.player.updateInspection(7999.99), false);
    assert.equal(h.player.updateInspection(8000), true);
    h.player.updateInspection(9000); h.player.updateInspection(11999.99);
    assert.equal(h.context().oscillators.length, 1);
    assert.equal(h.player.updateInspection(12000), true);
    h.player.updateInspection(12000); h.player.updateInspection(14000);
    assert.deepEqual(h.context().oscillators.map(node => node.pitches[0][0]), [660, 880, 880]);
    assert.ok(Math.abs(h.context().oscillators[2].startTimes[0] - h.context().oscillators[1].startTimes[0] - 0.20) < 1e-9);
    for (const gain of h.context().gains) {
      assert.equal(gain.events[0].args[0], 0);
      assert.ok(gain.events.some(event => event.name === 'linearRampToValueAtTime' && event.args[0] <= 0.06));
      assert.ok(gain.events.some(event => event.name === 'exponentialRampToValueAtTime'));
    }
  });

  await test('a skipped 8 second boundary plays only the newer 12 second cue', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(13000);
    assert.deepEqual(h.context().oscillators.map(node => node.pitches[0][0]), [880, 880]);
    h.player.updateInspection(8000); h.player.updateInspection(14000);
    assert.equal(h.context().oscillators.length, 2);
  });

  await test('late background frames at or after 15 seconds never replay missed cues', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock();
    for (const elapsed of [15000, 17000, 50000]) {
      h.player.startInspection(); h.player.updateInspection(elapsed); h.player.updateInspection(12000);
    }
    assert.equal(h.context().oscillators.length, 0);
  });

  await test('disabled observations consume thresholds and enabling does not replay them', async () => {
    const h = harness(); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(8000); h.player.setEnabled(true); h.player.updateInspection(9000);
    assert.equal(h.context().oscillators.length, 0);
    h.player.updateInspection(12000); assert.equal(h.context().oscillators.length, 2);
  });

  await test('expired inspection cancels notes queued before a context suspension', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(12000); h.context().state = 'suspended';
    h.player.updateInspection(15000);
    assert.ok(h.context().oscillators.every(node => node.disconnected));
    assert.ok(h.context().gains.every(node => node.disconnected));
    await h.player.unlock(); h.player.updateInspection(16000);
    assert.equal(h.context().oscillators.length, 2);
  });

  await test('a suspended context consumes a cue without resume or delayed replay', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.context().state = 'suspended';
    assert.equal(h.player.updateInspection(8000), false);
    assert.equal(h.context().resumeCalls, 0);
    assert.equal(h.player.getStatus().state, 'blocked');
    await h.player.unlock(); h.player.updateInspection(9000);
    assert.equal(h.context().oscillators.length, 0);
    h.player.updateInspection(12000); assert.equal(h.context().oscillators.length, 2);
  });

  await test('stop cancels active and future tones and prevents all later observation cues', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(12000); h.player.stop();
    for (const oscillator of h.context().oscillators) {
      assert.equal(oscillator.stopTimes.at(-1), h.context().currentTime);
      assert.equal(oscillator.disconnected, true);
      assert.equal(oscillator.onended, null);
    }
    assert.ok(h.context().gains.every(gain => gain.disconnected));
    h.player.updateInspection(8000); assert.equal(h.context().oscillators.length, 2);
  });

  await test('a new inspection cancels old sounds and rearms both boundaries', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(8000); const first = h.context().oscillators[0];
    h.player.startInspection(); assert.equal(first.disconnected, true);
    h.player.updateInspection(8000); h.player.updateInspection(12000);
    assert.equal(h.context().oscillators.length, 4);
  });

  await test('preview works while disabled and does not enable observation sounds', async () => {
    const h = harness(); assert.equal(await h.player.preview(), true);
    assert.deepEqual(h.context().oscillators.map(node => node.pitches[0][0]), [660, 880, 880]);
    h.player.startInspection(); h.player.updateInspection(8000); h.player.updateInspection(12000);
    assert.equal(h.context().oscillators.length, 3);
  });

  await test('preview does not reset a live observation or its already-consumed threshold', async () => {
    const h = harness(); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    h.player.updateInspection(8000); await h.player.preview(); h.player.updateInspection(9000);
    assert.equal(h.context().oscillators.length, 4);
    h.player.updateInspection(12000); assert.equal(h.context().oscillators.length, 6);
  });

  await test('repeated previews cancel previous queued notes and share one resume', async () => {
    const h = harness({ state: 'suspended', deferred: true });
    const first = h.player.preview(), second = h.player.preview();
    assert.equal(h.context().resumeCalls, 1); h.pending.resolve();
    assert.equal(await first, false); assert.equal(await second, true);
    const prior = h.context().oscillators.slice();
    await h.player.preview(); assert.ok(prior.every(node => node.disconnected));
    assert.equal(h.context().oscillators.length, 6);
  });

  await test('stop and switch-off invalidate delayed preview resumes without playing', async () => {
    for (const action of ['stop', 'disable']) {
      const h = harness({ state: 'suspended', deferred: true }); const pending = h.player.preview();
      if (action === 'stop') h.player.stop(); else h.player.setEnabled(false);
      h.pending.resolve(); assert.equal(await pending, false);
      assert.equal(h.context().oscillators.length, 0);
      assert.notEqual(h.player.getStatus().state, 'loading');
    }
  });

  await test('starting observation invalidates a pending preview but permits its gesture unlock', async () => {
    const h = harness({ state: 'suspended', deferred: true }); h.player.setEnabled(true);
    const preview = h.player.preview(); h.player.startInspection(); h.pending.resolve();
    assert.equal(await preview, false); assert.equal(h.context().oscillators.length, 0);
    h.player.updateInspection(8000); assert.equal(h.context().oscillators.length, 1);
  });

  await test('a gesture unlock before startInspection remains valid unless stop cancels it', async () => {
    const h = harness({ state: 'suspended', deferred: true }); h.player.setEnabled(true);
    h.player.stop(); const first = h.player.unlock(); h.player.startInspection();
    h.pending.resolve(); assert.equal(await first, true);
    h.player.updateInspection(8000); assert.equal(h.context().oscillators.length, 1);

    const canceled = harness({ state: 'suspended', deferred: true });
    const second = canceled.player.unlock(); canceled.player.stop(); canceled.pending.resolve();
    assert.equal(await second, false);
    assert.equal(canceled.context().oscillators.length, 0);
  });

  await test('disabling audio immediately silences preview notes already scheduled', async () => {
    const h = harness(); await h.player.preview(); h.player.setEnabled(false);
    assert.ok(h.context().oscillators.every(node => node.disconnected));
    assert.ok(h.context().gains.every(node => node.disconnected));
  });

  await test('unsupported audio and constructor or resume failures resolve without throwing', async () => {
    const unsupported = Audio.create({ AudioContext: null });
    assert.equal(await unsupported.preview(), false);
    assert.equal(unsupported.getStatus().state, 'unavailable');
    for (const options of [{ constructorError: true }, { state: 'suspended', resumeThrows: true },
      { state: 'suspended', resumeRejects: true }, { state: 'suspended', staySuspended: true }]) {
      const h = harness(options); assert.equal(await h.player.preview(), false);
      assert.equal(h.player.getStatus().state, 'blocked');
    }
  });

  await test('node creation failure releases partial nodes and leaves inspection alive', async () => {
    const h = harness({ toneError: true }); h.player.setEnabled(true); await h.player.unlock(); h.player.startInspection();
    assert.equal(h.player.updateInspection(8000), false);
    assert.equal(h.player.getStatus().state, 'blocked');
    assert.ok(h.context().gains.every(gain => gain.disconnected));
    assert.equal(await h.player.preview(), false);
    assert.equal(h.player.updateInspection(12000), false);
  });

  await test('natural completion disconnects nodes and status snapshots cannot mutate the module', async () => {
    const h = harness(); await h.player.preview();
    for (const oscillator of h.context().oscillators) oscillator.onended();
    assert.ok(h.context().oscillators.every(node => node.disconnected));
    assert.ok(h.context().gains.every(node => node.disconnected));
    const status = h.player.getStatus(); status.state = 'blocked';
    assert.equal(h.player.getStatus().state, 'ready'); h.player.stop();
  });

  await test('closed contexts are recreated only by a gesture and callback failures are contained', async () => {
    const h = harness({ state: 'suspended', callbackThrows: true });
    assert.equal(await h.player.unlock(), true); h.context().state = 'closed';
    h.player.startInspection(); h.player.updateInspection(8000); assert.equal(h.contexts.length, 1);
    assert.equal(await h.player.unlock(), true); assert.equal(h.contexts.length, 2);
  });

  await test('browser global entry loads with no CommonJS or network dependencies', () => {
    const scope = { self: {}, Promise, isFinite, Math };
    vm.createContext(scope);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/audio.js'), 'utf8'), scope);
    assert.equal(typeof scope.self.StarCubeAudio.create, 'function');
    const player = scope.self.StarCubeAudio.create();
    player.startInspection(); player.updateInspection(NaN); player.updateInspection(-1); player.stop();
  });

  console.log(passed + ' audio checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
