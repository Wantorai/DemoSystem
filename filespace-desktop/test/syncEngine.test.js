const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SyncEngine, sameFingerprint } = require('../src/syncEngine');

const engine = new SyncEngine({
  syncStateStore: { load: async () => ({}), save: async () => {} },
  trashPath: async () => {},
});

test('snapshot layout resolves children even when they arrive before parents', () => {
  const rootId = '11111111-1111-1111-1111-111111111111';
  const childId = '22222222-2222-2222-2222-222222222222';
  const fileId = '33333333-3333-3333-3333-333333333333';
  const state = engine.buildSnapshotState(
    [{ id: rootId, name: 'Мои файлы', kind: 'personal', canWrite: true }],
    [
      { type: 'folder', id: childId, rootFolderId: rootId, parentId: rootId, name: 'Проекты' },
      { type: 'folder', id: rootId, rootFolderId: rootId, parentId: null, name: 'Мои файлы' },
      { type: 'file', id: fileId, rootFolderId: rootId, folderId: childId, name: 'Смета.xlsx', currentVersionId: 'v1' },
    ],
    '42'
  );
  assert.equal(state.cursor, '42');
  assert.equal(state.folders[childId].relativePath, 'Мои файлы/Проекты');
  assert.equal(state.files[fileId].relativePath, 'Мои файлы/Проекты/Смета.xlsx');
});

test('fingerprints tolerate sub-millisecond filesystem rounding', () => {
  assert.equal(sameFingerprint({ size: 10, mtimeMs: 1000 }, { size: 10, mtimeMs: 1001 }), true);
  assert.equal(sameFingerprint({ size: 10, mtimeMs: 1000 }, { size: 11, mtimeMs: 1000 }), false);
});

test('incremental files with duplicate names receive separate local paths', () => {
  engine.state = {
    roots: {},
    folders: {
      root: { id: 'root', parentId: null, relativePath: 'Мои файлы' },
    },
    files: {
      first: { id: 'first', folderId: 'root', relativePath: 'Мои файлы/Смета.xlsx' },
    },
  };

  assert.equal(
    engine.localFileSegment('Смета.xlsx', 'second-file-id', 'root'),
    'Смета [second].xlsx',
  );
});

test('renaming personal roots preserves contents when names trade places', async () => {
  const syncPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-roots-'));
  const localEngine = new SyncEngine({
    syncStateStore: { load: async () => ({}), save: async () => {} },
    trashPath: async () => {},
  });
  localEngine.syncPath = syncPath;

  try {
    await fs.promises.mkdir(path.join(syncPath, 'Мои файлы'));
    await fs.promises.mkdir(path.join(syncPath, 'Мои файлы [admin]'));
    await fs.promises.writeFile(path.join(syncPath, 'Мои файлы', 'employee.txt'), 'employee');
    await fs.promises.writeFile(path.join(syncPath, 'Мои файлы [admin]', 'admin.txt'), 'admin');

    await localEngine.relocateRoots(
      {
        admin: { localName: 'Мои файлы' },
        employee: { localName: 'roma_employee' },
      },
      {
        admin: { localName: 'Мои файлы [admin]' },
        employee: { localName: 'Мои файлы' },
      },
    );

    assert.equal(await fs.promises.readFile(path.join(syncPath, 'Мои файлы', 'admin.txt'), 'utf8'), 'admin');
    assert.equal(await fs.promises.readFile(path.join(syncPath, 'roma_employee', 'employee.txt'), 'utf8'), 'employee');
  } finally {
    await fs.promises.rm(syncPath, { recursive: true, force: true });
  }
});

test('a temporary network failure does not stop synchronization on startup', async () => {
  const syncPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-start-'));
  const localEngine = new SyncEngine({
    syncStateStore: { load: async () => ({}), save: async () => {} },
    trashPath: async () => {},
  });
  localEngine.api = {};
  localEngine.syncPath = syncPath;
  localEngine.state = {
    initialized: true,
    cursor: '42',
    roots: {},
    folders: {},
    files: {},
  };
  let watcherStarted = false;
  let retryScheduled = false;
  localEngine.syncNow = async () => {
    const error = new Error('Нет соединения с сервером');
    error.transient = true;
    throw error;
  };
  localEngine.startWatcher = () => { watcherStarted = true; };
  localEngine.schedulePoll = () => { retryScheduled = true; };

  try {
    await localEngine.start();
    assert.equal(localEngine.running, true);
    assert.equal(watcherStarted, true);
    assert.equal(retryScheduled, true);
    assert.equal(localEngine.remoteFailureCount, 1);
    assert.match(localEngine.connectionError, /Нет соединения/);
  } finally {
    localEngine.stop();
    await fs.promises.rm(syncPath, { recursive: true, force: true });
  }
});

test('successful connection clears a previous network error', () => {
  const localEngine = new SyncEngine({
    syncStateStore: { load: async () => ({}), save: async () => {} },
    trashPath: async () => {},
  });
  const error = new Error('Нет соединения с сервером');
  error.transient = true;
  localEngine.markConnectionFailure(error);
  localEngine.markConnectionHealthy();
  assert.equal(localEngine.remoteFailureCount, 0);
  assert.equal(localEngine.connectionError, '');
});

test('sleep pauses polling and wake schedules a delayed retry', () => {
  const localEngine = new SyncEngine({
    syncStateStore: { load: async () => ({}), save: async () => {} },
    trashPath: async () => {},
  });
  localEngine.running = true;
  localEngine.pollTimer = setTimeout(() => {}, 60_000);
  localEngine.reconcileTimer = setTimeout(() => {}, 60_000);
  localEngine.suspendForSleep();
  assert.equal(localEngine.pollTimer, null);
  assert.equal(localEngine.reconcileTimer, null);

  let retryDelay = null;
  localEngine.schedulePoll = (delay) => { retryDelay = delay; };
  localEngine.resumeAfterWake();
  assert.equal(retryDelay, 5_000);
});

test('file download falls back to the authenticated backend when direct S3 TLS fails', async () => {
  const syncPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-fallback-'));
  const target = path.join(syncPath, 'file.txt');
  const localEngine = new SyncEngine({
    syncStateStore: { load: async () => ({}), save: async () => {} },
    trashPath: async () => {},
  });
  let fallbackEndpoint = null;
  localEngine.syncPath = syncPath;
  localEngine.api = {
    request: async () => ({ url: 'https://storage.test/signed' }),
    downloadSignedUrl: async () => {
      const error = new Error('TLS failure');
      error.name = 'StorageConnectionError';
      error.transient = true;
      throw error;
    },
    downloadAuthenticated: async (endpoint, destination) => {
      fallbackEndpoint = endpoint;
      await fs.promises.writeFile(destination, 'downloaded');
    },
  };
  const record = { id: 'file-id', name: 'file.txt', relativePath: 'file.txt', currentVersionId: 'v1' };

  try {
    await localEngine.downloadFile(record, target);
    assert.equal(fallbackEndpoint, '/filespace/files/file-id/content');
    assert.equal(await fs.promises.readFile(target, 'utf8'), 'downloaded');
    assert.equal(record.localVersionId, 'v1');
  } finally {
    await fs.promises.rm(syncPath, { recursive: true, force: true });
  }
});
