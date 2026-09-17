'use strict';
const number = value => value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => typeof value === 'string' ? value.slice(0, 180) : null;
function diagnosticContext(event) {
  const state = event.state || {};
  return {
    deviceId: text(event.deviceId), appVersion: text(event.appVersion), buildNumber: text(event.buildNumber),
    runtimeVersion: text(event.runtimeVersion), diagnosticsSchemaVersion: number(state.diagnosticsSchemaVersion),
    otaUpdateId: text(state.otaUpdateId), otaIsEmbeddedLaunch: typeof state.otaIsEmbeddedLaunch === 'boolean' ? state.otaIsEmbeddedLaunch : null,
    otaCreatedAt: text(state.otaCreatedAt),
    installedBuildTag: text(state.installedBuildTag), buildTagSource: text(state.buildTagSource),
    nativeAppVersion: text(state.nativeAppVersion), nativeBuildVersion: text(state.nativeBuildVersion),
    versionTelemetryVersion: number(state.versionTelemetryVersion),
  };
}
function exportMeasurements(events) {
  const performanceSamples = [], apiMeasurements = [];
  let dropped = 0;
  const seen = new Set();
  for (const input of events) {
    const event = input.toJSON ? input.toJSON() : input;
    const context = diagnosticContext(event), metrics = event.metrics || {}, state = event.state || {};
    const samples = Array.isArray(metrics.performanceSamples) ? metrics.performanceSamples.slice(0, 40) : [];
    dropped += Math.max(0, number(metrics.performanceSamplesDropped) || 0);
    for (const sample of samples) {
      if (!sample || !['history-cache-read', 'history-list-commit', 'voice-cache-lookup', 'voice-player-reuse'].includes(sample.kind)) continue;
      const key = String(event.deviceId) + ':' + String(sample.sampleId);
      if (sample.sampleId && seen.has(key)) continue;
      if (sample.sampleId) seen.add(key);
      performanceSamples.push({ sampleId: text(sample.sampleId), ...context, appKey: text(event.appKey), kind: sample.kind,
        occurredAt: text(sample.occurredAt), receivedInEventAt: event.occurredAt,
        scope: text(sample.scope), durationMs: number(sample.durationMs), count: number(sample.count),
        backgroundedDuringOperation: typeof sample.backgroundedDuringOperation === 'boolean' ? sample.backgroundedDuringOperation : null,
        hit: typeof sample.hit === 'boolean' ? sample.hit : null, source: text(sample.source) });
    }
    if (!['metric', 'error'].includes(event.eventType) || !state.apiMeasurement && !/^slow-api:/.test(event.message || '') && event.eventType !== 'error') continue;
    if (!state.apiMethod || !state.apiPath || number(metrics.apiLatencyMs) == null) continue;
    apiMeasurements.push({ ...context, appKey: text(event.appKey), occurredAt: event.occurredAt,
      method: text(state.apiMethod), path: text(state.apiPath), requestPriority: text(metrics.apiRequestPriority || state.apiRequestPriority),
      clientDurationMs: number(metrics.apiLatencyMs), queueWaitMs: number(metrics.apiQueueWaitMs),
      serverDurationMs: number(metrics.serverDurationMs), status: number(state.apiStatus),
      networkType: text(event.networkType), carrier: text(state.carrier),
      appStateAtStart: text(state.apiAppStateAtStart), appStateAtFinish: text(state.apiAppStateAtFinish),
      backgroundedDuringRequest: state.apiBackgroundedDuringRequest === true });
  }
  return { performanceSamples: performanceSamples.slice(-5000), apiMeasurements: apiMeasurements.slice(-5000),
    measurementCoverage: { performanceSamplesTotal: performanceSamples.length, performanceSamplesDroppedOnClient: dropped,
      apiMeasurementsTotal: apiMeasurements.length, apiPopulation: 'slow/error diagnostic events, not all requests',
      historyTiming: 'first render to React commit; not native paint; scope identifies instrumented chat type',
      voiceTiming: 'cache lookup, not audible playback start',
      buffer: 'last 40 in-memory samples per heartbeat; process termination may lose unsent samples' } };
}
module.exports = { diagnosticContext, exportMeasurements };
