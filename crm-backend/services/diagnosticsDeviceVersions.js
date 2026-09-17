'use strict';

const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : null;
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const key = (...parts) => JSON.stringify(parts);

function buildDeviceVersions(events, releases = [], { canonicalAppKey = value => value, from = null, to = null, truncated = false } = {}) {
  const latest = new Map(), observedOta = new Map();
  for (const input of events) {
    const event = input.toJSON ? input.toJSON() : input;
    if (!event.deviceId) continue;
    const state = event.state || {};
    const check = state.versionCheck || {};
    const row = {
      appKey: canonicalAppKey(event.appKey), deviceId: event.deviceId,
      userId: event.userId ?? null, deviceModel: text(event.deviceModel), osVersion: text(event.osVersion),
      platform: text(event.platform), runtimeVersion: text(event.runtimeVersion),
      appVersion: text(event.appVersion), buildNumber: text(event.buildNumber),
      nativeAppVersion: text(state.nativeAppVersion), nativeBuildVersion: text(state.nativeBuildVersion),
      installedBuildTag: text(state.installedBuildTag), buildTagSource: text(state.buildTagSource),
      versionTelemetryVersion: state.versionTelemetryVersion ?? null,
      otaUpdateId: text(state.otaUpdateId), otaCreatedAt: text(state.otaCreatedAt),
      otaIsEmbeddedLaunch: typeof state.otaIsEmbeddedLaunch === 'boolean' ? state.otaIsEmbeddedLaunch : null,
      diagnosticsSchemaVersion: state.diagnosticsSchemaVersion ?? null,
      versionCheck: timestamp(check.checkedAt) != null ? {
        checkedAt: check.checkedAt, localBuildTag: text(check.localBuildTag), serverBuildTag: text(check.serverBuildTag),
        buildCheckedAt: timestamp(check.buildCheckedAt) != null ? check.buildCheckedAt : check.checkedAt,
        otaCheckedAt: timestamp(check.otaCheckedAt) != null ? check.otaCheckedAt : check.otaCheckedAt === null ? null : check.checkedAt,
        buildOutdated: typeof check.buildOutdated === 'boolean' ? check.buildOutdated : null,
        updateOutdated: typeof check.updateOutdated === 'boolean' ? check.updateOutdated : null,
        otaTargetId: text(check.otaTargetId),
      } : null,
      lastSeenAt: event.occurredAt || event.createdAt,
    };
    if (timestamp(row.lastSeenAt) == null) continue;
    const deviceKey = key(row.appKey, row.deviceId);
    if (!latest.has(deviceKey) || timestamp(row.lastSeenAt) > timestamp(latest.get(deviceKey).lastSeenAt)) latest.set(deviceKey, row);
    if (row.platform && row.runtimeVersion && row.otaUpdateId && timestamp(row.otaCreatedAt) != null && timestamp(row.otaCreatedAt) <= timestamp(row.lastSeenAt)) {
      const otaKey = key(row.appKey, row.platform, row.runtimeVersion);
      if (!observedOta.has(otaKey) || timestamp(row.otaCreatedAt) > timestamp(observedOta.get(otaKey).createdAt)) {
        observedOta.set(otaKey, { updateId: row.otaUpdateId, createdAt: row.otaCreatedAt, source: 'observed' });
      }
    }
  }
  const published = new Map(releases.map(release => [key(canonicalAppKey(release.appKey), release.platform, release.runtimeVersion), release]));
  const devices = Array.from(latest.values()).map(row => {
    const otaKey = key(row.appKey, row.platform, row.runtimeVersion);
    const targetOta = published.get(otaKey) || observedOta.get(otaKey) || null;
    let otaStatus = 'unknown';
    if (targetOta && row.platform && row.runtimeVersion) {
      if (row.otaIsEmbeddedLaunch !== true && row.otaUpdateId === targetOta.updateId) {
        otaStatus = targetOta.source === 'published' ? 'current' : 'latest_observed';
      } else if (timestamp(targetOta.createdAt) > timestamp(row.lastSeenAt)) {
        otaStatus = 'not_seen_since_release';
      } else if (row.otaIsEmbeddedLaunch === true) {
        otaStatus = 'embedded';
      } else if (row.otaUpdateId && timestamp(row.otaCreatedAt) != null && timestamp(targetOta.createdAt) != null) {
        otaStatus = timestamp(row.otaCreatedAt) < timestamp(targetOta.createdAt) ? 'older_ota' : 'different_ota';
      }
    }
    const check = row.versionCheck;
    // Reuse the application's folder-tag comparison with its own backend, including relayed clients.
    const buildStatus = check?.localBuildTag && check?.serverBuildTag && check?.buildOutdated != null
      ? check.buildOutdated ? 'build_mismatch' : 'build_matches'
      : 'unknown';
    return {
      ...row, otaStatus, targetOta,
      buildStatus,
      targetBuild: check?.serverBuildTag ? { tag: check.serverBuildTag, source: 'app_version_check', checkedAt: check.buildCheckedAt } : null,
    };
  }).sort((a, b) => timestamp(b.lastSeenAt) - timestamp(a.lastSeenAt));
  const counts = { devices: devices.length, ota: {}, build: {} };
  for (const row of devices) {
    counts.ota[row.otaStatus] = (counts.ota[row.otaStatus] || 0) + 1;
    counts.build[row.buildStatus] = (counts.build[row.buildStatus] || 0) + 1;
  }
  return { version: 1, coverage: { from, to, truncated, population: 'devices with diagnostics in the selected period; not all installations' }, counts, devices };
}

module.exports = { buildDeviceVersions };
