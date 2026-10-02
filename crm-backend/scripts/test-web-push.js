const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('worker routes room, boss, alerts, Telegram, MAX and rejects arbitrary URLs', async () => {
  const handlers = {};
  const shown = [];
  const opened = [];
  const worker = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, fn) => { handlers[name] = fn; },
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../crm-fronend/public/webchat-sw.js'), 'utf8'),
    { self: worker, URL });
  for (const [data, expected] of [
    [{ screen: 'room', roomId: 12 }, '/webchats/room/12'],
    [{ screen: 'admin', chatId: 7 }, '/webchats/boss/7'],
    [{ screen: 'alerts' }, '/webchats/alerts'],
    [{ screen: 'admin', chatId: 5 }, '/webchats/alerts'],
    [{ chatType: 'telegram', chatId: 9 }, '/webchats/telegram/9'],
    [{ screen: 'MaxChatScreen', chatId: 8 }, '/webchats/max/8'],
    [{ url: 'https://evil.test' }, '/webchats'],
  ]) {
    let pending;
    handlers.push({ data: { json: () => ({ title: 'Message', data }) }, waitUntil: p => { pending = p; } });
    await pending;
    assert.equal(shown.at(-1).options.data.path, expected);
    handlers.notificationclick({ notification: { data: shown.at(-1).options.data, close() {} },
      waitUntil: p => { pending = p; } });
    await pending;
    assert.equal(opened.at(-1), 'https://example.test' + expected);
  }
});

test('browser subscriptions are independent of native subscribers and expired endpoints are disabled', async () => {
  const sent = [];
  const disabled = [];
  const rows = [
    { id: 1, userId: 42, instance: 'iphone', distributorId: 'web-browser', endpoint: 'https://web.push.apple.com/a' },
    { id: 2, userId: 42, instance: 'android', distributorId: 'native', endpoint: 'https://native.test/a' },
    { id: 3, userId: 42, instance: 'expired', distributorId: 'web-browser', endpoint: 'https://web.push.apple.com/expired' },
  ];
  const subscription = { sync: async () => {}, findAll: async () => rows,
    update: async (_, options) => disabled.push(options.where.id) };
  const context = {
    module: { exports: {} }, process: { env: { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' } },
    require: name => {
      if (name === '../models') return { sequelize: { models: { UnifiedPushSubscription: subscription } } };
      if (name === './unifiedPushLogger') return { log() {}, warn() {} };
      if (name === 'web-push') return { setVapidDetails() {}, sendNotification: async (sub, payload) => {
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
        if (sub.endpoint.endsWith('/expired')) throw { statusCode: 410 };
        return { statusCode: 201 };
      } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/sendUnifiedPushNotification.js'), 'utf8'), context);
  await context.module.exports.sendUnifiedPushToUserIds([42], 'Message', 'Body', { screen: 'room', roomId: 12 }, { browserOnly: true });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].payload.title, 'Message');
  assert.equal(sent[0].payload.data.roomId, 12);
  assert.deepEqual(disabled, [3]);
  sent.length = 0;
  await context.module.exports.sendUnifiedPushToUserIds([42], 'Message', 'Body');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, 'https://native.test/a');
});

test('browser registration rejects non-push URLs and is scoped to authenticated user', async () => {
  const routes = {};
  const saved = [];
  const deleted = [];
  const router = { get: (p, ...fn) => { routes[p] = fn.at(-1); }, post: (p, ...fn) => { routes[p] = fn.at(-1); } };
  const context = { module: { exports: {} }, URL, process: { env: { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' } },
    require: name => {
      if (name === 'express') return { Router: () => router };
      if (name === 'crypto') return require('node:crypto');
      if (name === '../middleware/authMiddleware') return () => {};
      if (name === '../models') return { UnifiedPushSubscription: { sync: async () => {},
        destroy: async query => deleted.push(query), create: async row => saved.push(row) } };
      if (name === '../services/sendUnifiedPushNotification') return {};
      throw new Error(name);
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/webPushRoutes.js'), 'utf8'), context);
  let status = 200;
  const res = { status(n) { status = n; return this; }, json() {} };
  const keys = { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) };
  await routes['/push/web/subscribe']({ user: { id: 42 }, body: { endpoint: 'https://127.0.0.1/private', keys } }, res, error => { throw error; });
  assert.equal(status, 400);
  assert.equal(saved.length, 0);
  await routes['/push/web/subscribe']({ user: { id: 42 }, body: { userId: 999, endpoint: 'https://web.push.apple.com/a', keys } }, res, error => { throw error; });
  assert.equal(saved[0].userId, 42);
  assert.equal(saved[0].distributorId, 'web-browser');
  await routes['/push/web/unsubscribe']({ user: { id: 42 }, body: { endpoint: 'https://web.push.apple.com/a' } }, res, error => { throw error; });
  assert.equal(deleted.at(-1).where.userId, 42);
});
