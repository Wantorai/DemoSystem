const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ApiClient,
  ApiConnectionError,
  StorageConnectionError,
} = require('../src/apiClient');
const { version } = require('../package.json');

test('API requests identify the desktop client version', async () => {
  const originalFetch = global.fetch;
  let requestOptions;
  global.fetch = async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await new ApiClient('https://orderspace.test/api', 'token').request('/filespace/sync/changes');
    assert.equal(requestOptions.headers['X-FileSpace-Client-Version'], version);
    assert.equal(requestOptions.headers.Authorization, 'Bearer token');
  } finally {
    global.fetch = originalFetch;
  }
});

test('network failures receive a clear retryable error', async () => {
  const originalFetch = global.fetch;
  const failure = new TypeError('fetch failed');
  failure.cause = { code: 'ENOTFOUND' };
  global.fetch = async () => { throw failure; };

  try {
    await assert.rejects(
      () => new ApiClient('https://orderspace.test/api', 'token').request('/filespace/sync/changes'),
      (error) => {
        assert.ok(error instanceof ApiConnectionError);
        assert.equal(error.transient, true);
        assert.match(error.message, /Нет соединения с сервером/);
        assert.match(error.message, /ENOTFOUND/);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('API requests can use Electron network transport', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await new ApiClient('https://orderspace.test/api', 'token', { fetchImpl })
    .request('/filespace/sync/changes');
  assert.equal(called, true);
  assert.equal(result.ok, true);
});

test('authenticated update download is streamed with progress', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-api-update-'));
  const destination = path.join(directory, 'update.exe');
  const payload = Buffer.from('installer');
  let authorization;
  let progress;
  const fetchImpl = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(payload, {
      status: 200,
      headers: { 'Content-Length': String(payload.length) },
    });
  };

  try {
    await new ApiClient('https://orderspace.test/api', 'secret', { fetchImpl })
      .downloadAuthenticated('/filespace-desktop/download', destination, {
        onProgress: (value) => { progress = value; },
      });
    assert.equal(authorization, 'Bearer secret');
    assert.deepEqual(await fs.promises.readFile(destination), payload);
    assert.equal(progress.percent, 100);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('signed storage upload reports a contextual retryable network error', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-api-upload-'));
  const source = path.join(directory, 'file.txt');
  await fs.promises.writeFile(source, 'test');
  const failure = new TypeError('fetch failed');
  failure.cause = { code: 'ECONNRESET' };
  const fetchImpl = async () => { throw failure; };

  try {
    await assert.rejects(
      () => new ApiClient('https://orderspace.test/api', 'token', { fetchImpl })
        .uploadToSignedUrl('https://storage.test/signed', source, {}),
      (error) => {
        assert.ok(error instanceof StorageConnectionError);
        assert.equal(error.transient, true);
        assert.match(error.message, /файловым хранилищем при загрузке файла/);
        assert.match(error.message, /ECONNRESET/);
        return true;
      },
    );
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('authenticated fallback upload sends the file through the CRM API', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-api-proxy-upload-'));
  const source = path.join(directory, 'file.txt');
  await fs.promises.writeFile(source, 'fallback');
  let requestUrl;
  let requestOptions;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    for await (const _chunk of options.body) { /* consume stream */ }
    return new Response(null, { status: 204 });
  };

  try {
    await new ApiClient('https://orderspace.test/api', 'secret', { fetchImpl })
      .uploadAuthenticated('/filespace/uploads/file-id/content', source, { 'Content-Type': 'text/plain' });
    assert.equal(requestUrl, 'https://orderspace.test/api/filespace/uploads/file-id/content');
    assert.equal(requestOptions.headers.Authorization, 'Bearer secret');
    assert.equal(requestOptions.headers['Content-Length'], '8');
    assert.equal(requestOptions.headers['Content-Type'], 'text/plain');
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('signed storage download removes an incomplete temporary file', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orderspace-api-download-'));
  const destination = path.join(directory, 'file.txt');
  const fetchImpl = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('partial'));
      controller.error(Object.assign(new Error('socket closed'), { code: 'ECONNRESET' }));
    },
  }));

  try {
    await assert.rejects(
      () => new ApiClient('https://orderspace.test/api', 'token', { fetchImpl })
        .downloadSignedUrl('https://storage.test/signed', destination),
      StorageConnectionError,
    );
    await assert.rejects(
      () => fs.promises.access(`${destination}.orderspace-download-${process.pid}`),
      { code: 'ENOENT' },
    );
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});
