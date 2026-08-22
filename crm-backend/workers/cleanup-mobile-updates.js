'use strict';

const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ROOT = process.platform === 'win32'
  ? path.join(__dirname, '..', 'mobile-updates')
  : '/home/nodeapp/mobile-updates';

const MOBILE_UPDATES_ROOT = path.resolve(process.env.MOBILE_UPDATES_ROOT || DEFAULT_ROOT);
const KEEP_RELEASES = Math.max(1, Math.floor(Number(process.env.MOBILE_UPDATES_KEEP_RELEASES || 5) || 5));
const DRY_RUN = String(process.env.DRY_RUN || process.env.MOBILE_UPDATES_DRY_RUN || '').toLowerCase() === 'true';

const isSafeSegment = (value) => /^[a-zA-Z0-9._-]+$/.test(String(value || '').trim());

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(target) {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

async function listDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && isSafeSegment(entry.name))
    .map((entry) => entry.name);
}

async function releaseInfo(runtimeRoot, releaseId) {
  const releaseRoot = path.join(runtimeRoot, releaseId);
  const releaseJson = await readJsonSafe(path.join(releaseRoot, 'release.json'));
  const metadataStat = await fs.stat(path.join(releaseRoot, 'metadata.json')).catch(() => null);
  const rootStat = await fs.stat(releaseRoot).catch(() => null);
  const createdAt = Date.parse(releaseJson?.createdAt || '') || metadataStat?.mtimeMs || rootStat?.mtimeMs || 0;
  return { releaseId, releaseRoot, createdAt };
}

async function cleanupRuntime(appKey, runtimeVersion) {
  const runtimeRoot = path.join(MOBILE_UPDATES_ROOT, appKey, runtimeVersion);
  const current = await readJsonSafe(path.join(runtimeRoot, 'current.json'));
  const currentReleaseId = isSafeSegment(current?.releaseId) ? String(current.releaseId) : null;
  const dirs = await listDirectories(runtimeRoot);
  const releases = [];

  for (const releaseId of dirs) {
    releases.push(await releaseInfo(runtimeRoot, releaseId));
  }

  releases.sort((a, b) => b.createdAt - a.createdAt || String(b.releaseId).localeCompare(String(a.releaseId)));

  const keep = new Set();
  if (currentReleaseId) keep.add(currentReleaseId);
  for (const release of releases) {
    if (keep.size >= KEEP_RELEASES) break;
    keep.add(release.releaseId);
  }

  const toDelete = releases.filter((release) => !keep.has(release.releaseId));
  for (const release of toDelete) {
    if (DRY_RUN) continue;
    await fs.rm(release.releaseRoot, { recursive: true, force: true });
  }

  return {
    appKey,
    runtimeVersion,
    currentReleaseId,
    total: releases.length,
    kept: keep.size,
    deleted: toDelete.length,
    deletedReleaseIds: toDelete.map((item) => item.releaseId),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const exists = await pathExists(MOBILE_UPDATES_ROOT);
  if (!exists) {
    console.log('[cleanup-mobile-updates][summary]', JSON.stringify({
      startedAt,
      root: MOBILE_UPDATES_ROOT,
      keepReleases: KEEP_RELEASES,
      dryRun: DRY_RUN,
      exists: false,
      deleted: 0,
    }));
    return;
  }

  const summaries = [];
  const apps = await listDirectories(MOBILE_UPDATES_ROOT);
  for (const appKey of apps) {
    const appRoot = path.join(MOBILE_UPDATES_ROOT, appKey);
    const runtimes = await listDirectories(appRoot);
    for (const runtimeVersion of runtimes) {
      summaries.push(await cleanupRuntime(appKey, runtimeVersion));
    }
  }

  const deleted = summaries.reduce((sum, item) => sum + item.deleted, 0);
  console.log('[cleanup-mobile-updates][summary]', JSON.stringify({
    startedAt,
    finishedAt: new Date().toISOString(),
    root: MOBILE_UPDATES_ROOT,
    keepReleases: KEEP_RELEASES,
    dryRun: DRY_RUN,
    runtimes: summaries.length,
    deleted,
    summaries,
  }));
}

main().catch((error) => {
  console.error('[cleanup-mobile-updates] error', error);
  process.exitCode = 1;
});