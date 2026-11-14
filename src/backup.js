(function (root) {
  'use strict';

  var DEFAULT_KEY = 'starcube.backup.v1';
  var MAX_SAFE = 9007199254740991;

  function integer(value, maximum) {
    return typeof value === 'number' && isFinite(value) && value >= 0 &&
      Math.floor(value) === value && value <= maximum;
  }

  // A compact content fingerprint, not a security primitive. Sorting canonical
  // rows makes display order irrelevant while preserving every exported field.
  function fingerprint(records, groups) {
    function row(record) {
      record = record || {};
      return JSON.stringify([record.uid, record.id, record.ms, record.penalty,
        record.scramble, record.at, record.groupId]);
    }
    function groupRow(group) {
      group = group || {};
      return JSON.stringify([group.id, group.origin, group.name]);
    }
    var text = JSON.stringify([records.map(row).sort(), groups.map(groupRow).sort()]);
    var seeds = [2166136261, 2246822507, 3266489909, 668265263];
    for (var p = 0; p < text.length; p++) {
      var c = text.charCodeAt(p);
      for (var i = 0; i < seeds.length; i++) {
        seeds[i] = Math.imul(seeds[i] ^ (c + i * 257), 16777619) >>> 0;
      }
    }
    return seeds.map(function (value) { return ('00000000' + value.toString(16)).slice(-8); }).join('');
  }

  function emptyMetadata() {
    return { version: 1, lastExportRequestedAt: null, exportedFingerprint: null,
      exportedCount: 0, reminderCount: 0 };
  }

  function validMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 ||
        !integer(value.exportedCount, MAX_SAFE) || !integer(value.reminderCount, MAX_SAFE) ||
        value.reminderCount < value.exportedCount) return false;
    if (value.lastExportRequestedAt === null) {
      return value.exportedFingerprint === null && value.exportedCount === 0;
    }
    return integer(value.lastExportRequestedAt, 8640000000000000) &&
      typeof value.exportedFingerprint === 'string' && /^[0-9a-f]{32}$/.test(value.exportedFingerprint);
  }

  function create(options) {
    options = options || {};
    var key = typeof options.key === 'string' && options.key.length ? options.key : DEFAULT_KEY;
    var threshold = integer(options.threshold, MAX_SAFE) && options.threshold > 0 ? options.threshold : 100;
    var storage;
    try {
      storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : root.localStorage;
    } catch (err) { storage = null; }
    var metadata = emptyMetadata();
    var lastRaw;
    var canPersist = false;
    var writeFailed = false;
    var observed = false;
    var count = 0;
    var emptyFingerprint = fingerprint([], []);
    var currentFingerprint = emptyFingerprint;

    function readLatest() {
      // Never repair or replace malformed metadata automatically. This module
      // owns only its dedicated key; failures never affect the record store.
      try {
        if (!storage || typeof storage.getItem !== 'function') {
          canPersist = false;
          return;
        }
        var raw = storage.getItem(key);
        if (raw !== null && (typeof raw !== 'string' || raw.length > 2048)) {
          canPersist = false;
          return;
        }
        var parsed = raw === null ? emptyMetadata() : JSON.parse(raw);
        if (!validMetadata(parsed)) { canPersist = false; return; }
        canPersist = typeof storage.setItem === 'function';
        // A failed write can still update this tab's reminder. Keep that local
        // state until the durable key actually changes (e.g. in another tab).
        if (raw !== lastRaw) {
          metadata = { version: 1, lastExportRequestedAt: parsed.lastExportRequestedAt,
            exportedFingerprint: parsed.exportedFingerprint, exportedCount: parsed.exportedCount,
            reminderCount: parsed.reminderCount };
          lastRaw = raw;
        }
      } catch (err) { canPersist = false; }
    }

    function describe() {
      var changed = observed && currentFingerprint !== (metadata.exportedFingerprint || emptyFingerprint);
      return {
        due: changed && count - metadata.reminderCount >= threshold,
        changed: changed,
        // This is net growth since export, not a cumulative solve counter.
        // Edits/deletions are represented by changed even when this is zero.
        pendingCount: Math.max(0, count - metadata.exportedCount),
        lastExportRequestedAt: metadata.lastExportRequestedAt,
        metadataWritable: canPersist && !writeFailed
      };
    }

    function save(next) {
      metadata = next;
      if (!canPersist) return describe();
      try {
        var raw = JSON.stringify(next);
        storage.setItem(key, raw);
        lastRaw = raw;
        writeFailed = false;
      } catch (err) { writeFailed = true; }
      return describe();
    }

    function refresh() { readLatest(); return describe(); }

    function observe(records, groups) {
      records = Array.isArray(records) ? records : [];
      groups = Array.isArray(groups) ? groups : [];
      currentFingerprint = fingerprint(records, groups);
      count = records.length;
      observed = true;
      return refresh();
    }

    function markExportRequested(now) {
      readLatest();
      if (!observed) return describe();
      var at = now === undefined ? Date.now() : now;
      if (!integer(at, 8640000000000000)) return describe();
      // A delayed action from an older tab must not regress a newer marker.
      if (metadata.lastExportRequestedAt !== null && at < metadata.lastExportRequestedAt) return describe();
      return save({ version: 1, lastExportRequestedAt: at, exportedFingerprint: currentFingerprint,
        exportedCount: count, reminderCount: count });
    }

    function snooze() {
      readLatest();
      if (!observed) return describe();
      return save({ version: 1, lastExportRequestedAt: metadata.lastExportRequestedAt,
        exportedFingerprint: metadata.exportedFingerprint, exportedCount: metadata.exportedCount,
        reminderCount: Math.max(count, metadata.reminderCount) });
    }

    readLatest();
    return { observe: observe, status: refresh, refresh: refresh,
      markExportRequested: markExportRequested, snooze: snooze };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StarCubeBackup = api;
})(typeof self !== 'undefined' ? self : globalThis);
