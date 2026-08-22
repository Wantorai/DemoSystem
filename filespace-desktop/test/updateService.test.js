const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UpdateService, compareVersions } = require('../src/updateService');

test('version comparison handles multi-digit components', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0'), 0);
  assert.equal(compareVersions('0.1.2', '0.2.0'), -1);
});

test('newer server version becomes available and downloaded installer is verified', async () => {
  const downloadsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-update-'));
  const installer = Buffer.from('test installer');
  const sha256 = crypto.createHash('sha256').update(installer).digest('hex');
  const states = [];
  const api = {
    request: async () => ({ version: '0.1.3', available: true, size: installer.length, sha256 }),
    downloadAuthenticated: async (_endpoint, destination, { onProgress }) => {
      await fs.promises.writeFile(destination, installer);
      onProgress({ received: installer.length, total: installer.length, percent: 100 });
    },
  };
  const updater = new UpdateService({
    currentVersion: '0.1.2',
    downloadsDir,
    getApiClient: () => api,
    onState: (state) => states.push(state),
  });

  try {
    const update = await updater.check();
    assert.equal(update.available, true);
    assert.equal(update.version, '0.1.3');
    const destination = await updater.download();
    assert.equal(await fs.promises.readFile(destination, 'utf8'), installer.toString());
    assert.ok(states.some((state) => state.downloading && state.progress === 100));
  } finally {
    await fs.promises.rm(downloadsDir, { recursive: true, force: true });
  }
});

test('corrupted installer is removed', async () => {
  const downloadsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-update-bad-'));
  const api = {
    request: async () => ({ version: '0.1.3', available: true, size: 3, sha256: 'a'.repeat(64) }),
    downloadAuthenticated: async (_endpoint, destination) => fs.promises.writeFile(destination, 'bad'),
  };
  const updater = new UpdateService({
    currentVersion: '0.1.2',
    downloadsDir,
    getApiClient: () => api,
  });

  try {
    await updater.check();
    await assert.rejects(() => updater.download(), /целостности/);
    const destination = path.join(downloadsDir, 'OrderSpace-FileSpace-Setup-0.1.3.exe');
    await assert.rejects(() => fs.promises.stat(destination), { code: 'ENOENT' });
  } finally {
    await fs.promises.rm(downloadsDir, { recursive: true, force: true });
  }
});
