'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const express = require('express');
const request = require('supertest');

const run = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-updates-test-'));
  process.env.MOBILE_UPDATES_ROOT = root;

  const appKey = 'orderspace';
  const runtimeVersion = 'orderspace-1.0.0';
  const releaseId = 'test-release';
  const releaseRoot = path.join(root, appKey, runtimeVersion, releaseId);
  await fs.mkdir(path.join(releaseRoot, '_expo', 'static', 'js', 'android'), { recursive: true });
  await fs.mkdir(path.join(releaseRoot, 'assets'), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(releaseRoot, '_expo', 'static', 'js', 'android', 'entry.hbc'), 'bundle'),
    fs.writeFile(path.join(releaseRoot, 'assets', 'logo'), 'image'),
    fs.writeFile(
      path.join(releaseRoot, 'metadata.json'),
      JSON.stringify({
        version: 0,
        fileMetadata: {
          android: {
            bundle: '_expo/static/js/android/entry.hbc',
            assets: [{ path: 'assets/logo', ext: 'png' }],
          },
        },
      })
    ),
    fs.writeFile(
      path.join(releaseRoot, 'expoConfig.json'),
      JSON.stringify({ name: 'OTA test', runtimeVersion })
    ),
    fs.writeFile(
      path.join(releaseRoot, 'release.json'),
      JSON.stringify({ releaseId, createdAt: new Date().toISOString(), message: 'test' })
    ),
    fs.writeFile(
      path.join(root, appKey, runtimeVersion, 'current.json'),
      JSON.stringify({ releaseId })
    ),
  ]);

  const routes = require('../routes/mobileUpdatesRoutes');
  const app = express();
  app.use('/api', routes);

  try {
    const manifestResponse = await request(app)
      .get(`/api/mobile-updates/${appKey}`)
      .set('host', 'updates.example.test')
      .set('expo-protocol-version', '1')
      .set('expo-platform', 'android')
      .set('expo-runtime-version', runtimeVersion)
      .expect(200)
      .expect('expo-protocol-version', '1')
      .expect('content-type', /application\/expo\+json/);

    assert.equal(manifestResponse.body.runtimeVersion, runtimeVersion);
    assert.equal(manifestResponse.body.assets.length, 1);
    assert.match(manifestResponse.body.launchAsset.url, /entry\.hbc$/);

    await request(app)
      .get(new URL(manifestResponse.body.launchAsset.url).pathname)
      .expect(200)
      .expect('content-type', /application\/javascript/);

    await request(app)
      .get(`/api/mobile-updates/${appKey}`)
      .set('expo-protocol-version', '1')
      .set('expo-platform', 'android')
      .set('expo-runtime-version', runtimeVersion)
      .set('expo-current-update-id', manifestResponse.body.id)
      .expect(204);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

run()
  .then(() => console.log('Mobile updates route test passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
