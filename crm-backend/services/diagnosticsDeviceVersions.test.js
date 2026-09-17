const { buildDeviceVersions } = require('./diagnosticsDeviceVersions');
const { mobileUpdateId } = require('./mobileUpdateIdentity');
const crypto = require('crypto');

const event = (deviceId, overrides = {}) => ({
  deviceId, appKey: 'orderspace', platform: 'android', runtimeVersion: 'r1',
  occurredAt: '2026-09-17T14:00:00Z', appVersion: '1.0', buildNumber: '999',
  state: { otaUpdateId: 'old', otaCreatedAt: '2026-09-15T12:00:00Z', nativeAppVersion: '1.0', nativeBuildVersion: '2' },
  ...overrides,
});
const release = { appKey: 'orderspace', platform: 'android', runtimeVersion: 'r1', updateId: 'new', createdAt: '2026-09-17T12:00:00Z', source: 'published' };

test('offline devices are not classified as failing to update; current IDs and embedded launches are distinguished', () => {
  const result = buildDeviceVersions([
    event('old'), event('offline', { occurredAt: '2026-09-17T11:00:00Z' }),
    event('current', { state: { otaUpdateId: 'new' } }),
    event('embedded', { state: { otaIsEmbeddedLaunch: true } }),
    event('unknown', { state: {} }),
  ], [release]);
  expect(Object.fromEntries(result.devices.map(row => [row.deviceId, row.otaStatus]))).toEqual({
    old: 'older_ota', offline: 'not_seen_since_release', current: 'current', embedded: 'embedded', unknown: 'unknown',
  });
});

test('app, platform and runtime isolate OTA references; aliases deduplicate installations', () => {
  const result = buildDeviceVersions([
    event('same', { appKey: 'mobile-app', occurredAt: '2026-09-16T00:00:00Z' }), event('same'),
    event('ios', { platform: 'ios', state: {} }), event('runtime', { runtimeVersion: 'r2', state: {} }),
    event('company', { appKey: 'buhfinance', state: {} }),
  ], [release], { canonicalAppKey: key => key === 'mobile-app' ? 'orderspace' : key });
  expect(result.devices).toHaveLength(4);
  expect(result.devices.filter(row => row.deviceId !== 'same').every(row => row.targetOta === null)).toBe(true);
  expect(result.devices.find(row => row.deviceId === 'same').lastSeenAt).toBe('2026-09-17T14:00:00Z');
});

test('published target takes priority over observed versions, including rollbacks', () => {
  const row = buildDeviceVersions([event('newer', { state: { otaUpdateId: 'other', otaCreatedAt: '2026-09-17T13:00:00Z' } })], [release]).devices[0];
  expect(row.targetOta.updateId).toBe('new');
  expect(row.otaStatus).toBe('different_ota');
});

test('observed OTA reference is explicitly not publication confirmation', () => {
  const result = buildDeviceVersions([event('old'), event('new', { state: { otaUpdateId: 'new', otaCreatedAt: '2026-09-17T12:00:00Z' } })]);
  expect(result.devices.find(row => row.deviceId === 'new').otaStatus).toBe('latest_observed');
  expect(result.devices.find(row => row.deviceId === 'old').otaStatus).toBe('older_ota');
});

test('build status uses the Menu check of folder tags from the device backend, not numeric config/native versions', () => {
  const versionCheck = { checkedAt: '2026-09-17T13:50:00Z', localBuildTag: 'build1509-1', serverBuildTag: 'build1609-2', buildOutdated: true, updateOutdated: false };
  const result = buildDeviceVersions([
    event('old', { state: { versionCheck } }),
    event('new', { state: { nativeBuildVersion: '1', versionCheck: { ...versionCheck, localBuildTag: 'build1609-2', buildOutdated: false } } }),
    event('config-only', { state: {} }),
    event('company', { appKey: 'buhfinance', state: { versionCheck: { ...versionCheck, serverBuildTag: 'build1509-1', buildOutdated: false } } }),
  ]);
  expect(Object.fromEntries(result.devices.map(row => [row.deviceId, row.buildStatus]))).toEqual({
    old: 'build_mismatch', new: 'build_matches', 'config-only': 'unknown', company: 'build_matches',
  });
  expect(result.devices.find(row => row.deviceId === 'company').targetBuild.tag).toBe('build1509-1');
  expect(result.devices.find(row => row.deviceId === 'old').versionCheck.updateOutdated).toBe(false);
});

test('latest snapshot does not inherit OTA from an older event when metadata is missing', () => {
  const result = buildDeviceVersions([event('phone'), event('phone', { occurredAt: '2026-09-18T00:00:00Z', state: {} })], [release]);
  expect(result.devices[0].otaUpdateId).toBeNull();
  expect(result.devices[0].otaStatus).toBe('unknown');
});

test('installed folder tag is available before the network/OTA checks finish', () => {
  const row = buildDeviceVersions([event('phone', { state: {
    installedBuildTag: 'build_All_0909-1', buildTagSource: 'embedded-config', versionTelemetryVersion: 2,
    versionCheck: { checkedAt: '2026-09-17T13:00:00Z', buildCheckedAt: '2026-09-17T13:00:00Z', otaCheckedAt: null,
      localBuildTag: 'build_All_0909-1', serverBuildTag: 'build_All_1709-1', buildOutdated: true, updateOutdated: null },
  } })]).devices[0];
  expect(row.installedBuildTag).toBe('build_All_0909-1');
  expect(row.buildStatus).toBe('build_mismatch');
  expect(row.targetBuild.tag).toBe('build_All_1709-1');
  expect(row.versionCheck.otaCheckedAt).toBeNull();
  const unchecked = buildDeviceVersions([event('phone', { state: { installedBuildTag: 'build_All_0909-1' } })]).devices[0];
  expect(unchecked.installedBuildTag).toBe('build_All_0909-1');
  expect(unchecked.buildStatus).toBe('unknown');
});

test('update ID remains exactly compatible with existing manifest IDs', () => {
  const metadata = Buffer.from('{"fileMetadata":{"android":{"bundle":"app.js"}}}');
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const value = hash(Buffer.from(`${hash(metadata)}:release-1:android`));
  const expected = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
  expect(mobileUpdateId(metadata, 'release-1', 'android')).toBe(expected);
});
