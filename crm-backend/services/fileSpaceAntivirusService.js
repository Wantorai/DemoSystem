const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const db = require('../models');
const s3 = require('./fileSpaceS3Service');
const { scanStream } = require('./clamAvService');

const File = db.FileSpaceFile;
const Version = db.FileSpaceFileVersion;
const Audit = db.FileSpaceAuditLog;
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const enabled = () => String(process.env.FILESPACE_ANTIVIRUS_ENABLED || 'true').toLowerCase() !== 'false';
const backfillEnabled = () => String(process.env.FILESPACE_AV_BACKFILL_SKIPPED || 'false').toLowerCase() === 'true';
const maxBytes = () => Math.max(Number(process.env.FILESPACE_AV_MAX_FILE_SIZE || 100 * 1024 * 1024), 1024 * 1024);
const maxAttempts = () => Math.max(Number(process.env.FILESPACE_AV_MAX_ATTEMPTS || 3), 1);
const DISABLED_RESULT = 'Antivirus disabled';

const removeLegacyFile = async (legacyPath) => {
  const relative = String(legacyPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relative) return;
  const absolute = path.resolve(UPLOAD_ROOT, relative);
  const fromRoot = path.relative(UPLOAD_ROOT, absolute);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return;
  await fs.promises.unlink(absolute).catch((error) => { if (error.code !== 'ENOENT') throw error; });
};

const writeAudit = (file, action, details) => Audit.create({
  actorId: null, action, entityType: 'file', entityId: file.id, entityName: file.name,
  folderId: file.folderId, details,
}).catch((error) => console.error('[filespace:av:audit]', error.message));

const scanFile = async (file) => {
  const attempts = Number(file.scanAttempts || 0) + 1;
  const currentWhere = { id: file.id, currentVersionId: file.currentVersionId };
  const [claimed] = await File.update(
    { scanStatus: 'scanning', scanAttempts: attempts, scanResult: null },
    { where: { ...currentWhere, scanStatus: 'pending', status: 'ready', deletedAt: null } }
  );
  if (!claimed) return { skipped: true };
  if (file.currentVersionId) await Version.update({ scanStatus: 'scanning', scanResult: null, scanAttempts: attempts }, { where: { id: file.currentVersionId } });
  if (!enabled()) {
    await File.update({ scanStatus: 'skipped', scanResult: 'Antivirus disabled', scannedAt: new Date() }, { where: currentWhere });
    if (file.currentVersionId) await Version.update({ scanStatus: 'skipped', scanResult: 'Antivirus disabled', scannedAt: new Date() }, { where: { id: file.currentVersionId } });
    return { skipped: true };
  }
  try {
    if (Number(file.size) > maxBytes()) throw new Error(`Файл превышает лимит антивирусной проверки ${maxBytes()} байт`);
    const object = await s3.getObject(file.objectKey);
    const result = await scanStream(object.Body, { maxBytes: maxBytes() });
    if (result.infected) {
      await File.update({ scanStatus: 'infected', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: currentWhere });
      if (file.currentVersionId) await Version.update({ scanStatus: 'infected', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: { id: file.currentVersionId } });
      await Promise.all([s3.deleteObject(file.objectKey), removeLegacyFile(file.legacyPath)]);
      writeAudit(file, 'virus_detected', { result: result.message });
      return { infected: true };
    }
    await File.update({ scanStatus: 'clean', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: currentWhere });
    if (file.currentVersionId) await Version.update({ scanStatus: 'clean', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: { id: file.currentVersionId } });
    writeAudit(file, 'virus_scan_clean', { result: result.message });
    return { clean: true };
  } catch (error) {
    const finalFailure = attempts >= maxAttempts();
    await File.update({
      scanStatus: finalFailure ? 'failed' : 'pending',
      scanResult: String(error.message || error).slice(0, 1000),
      scannedAt: finalFailure ? new Date() : null,
    }, { where: currentWhere });
    if (file.currentVersionId) await Version.update({
      scanStatus: finalFailure ? 'failed' : 'pending',
      scanResult: String(error.message || error).slice(0, 1000),
      scannedAt: finalFailure ? new Date() : null,
    }, { where: { id: file.currentVersionId } });
    if (finalFailure) writeAudit(file, 'virus_scan_failed', { error: String(error.message || error), attempts });
    return { failed: finalFailure, retry: !finalFailure };
  }
};

const scanHistoricalVersion = async (version) => {
  const attempts = Number(version.scanAttempts || 0) + 1;
  const [claimed] = await Version.update(
    { scanStatus: 'scanning', scanAttempts: attempts, scanResult: null },
    { where: { id: version.id, scanStatus: 'pending', status: 'ready' } }
  );
  if (!claimed) return { skipped: true };
  const file = await File.findByPk(version.fileId);
  try {
    if (Number(version.size) > maxBytes()) throw new Error(`Файл превышает лимит антивирусной проверки ${maxBytes()} байт`);
    const object = await s3.getObject(version.objectKey);
    const result = await scanStream(object.Body, { maxBytes: maxBytes() });
    if (result.infected) {
      await Version.update({ scanStatus: 'infected', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: { id: version.id } });
      await s3.deleteObject(version.objectKey);
      if (file) writeAudit(file, 'virus_detected', { result: result.message, historicalVersion: version.versionNumber });
      return { infected: true, historical: true };
    }
    await Version.update({ scanStatus: 'clean', scanResult: result.message.slice(0, 1000), scannedAt: new Date() }, { where: { id: version.id } });
    if (file) writeAudit(file, 'virus_scan_clean', { result: result.message, historicalVersion: version.versionNumber });
    return { clean: true, historical: true };
  } catch (error) {
    const finalFailure = attempts >= maxAttempts();
    await Version.update({
      scanStatus: finalFailure ? 'failed' : 'pending',
      scanResult: String(error.message || error).slice(0, 1000),
      scannedAt: finalFailure ? new Date() : null,
    }, { where: { id: version.id } });
    if (finalFailure && file) writeAudit(file, 'virus_scan_failed', { error: String(error.message || error), attempts, historicalVersion: version.versionNumber });
    return { failed: finalFailure, retry: !finalFailure, historical: true };
  }
};

const getCurrentVersionIds = () => File.findAll({
  where: { currentVersionId: { [Op.ne]: null } },
  attributes: ['currentVersionId'],
}).then((rows) => rows.map((row) => row.currentVersionId));

const queueSkippedFiles = async (limit) => {
  if (!backfillEnabled() || limit <= 0) return [];
  const candidates = await File.findAll({
    where: {
      scanStatus: 'skipped',
      scanResult: DISABLED_RESULT,
      status: 'ready',
      deletedAt: null,
      size: { [Op.lte]: maxBytes() },
    },
    order: [['createdAt', 'ASC']],
    limit,
  });
  const queued = [];
  for (const candidate of candidates) {
    const [claimed] = await File.update(
      { scanStatus: 'pending', scanResult: null, scanAttempts: 0, scannedAt: null },
      {
        where: {
          id: candidate.id,
          currentVersionId: candidate.currentVersionId,
          scanStatus: 'skipped',
          scanResult: DISABLED_RESULT,
        },
      }
    );
    if (!claimed) continue;
    if (candidate.currentVersionId) {
      await Version.update(
        { scanStatus: 'pending', scanResult: null, scanAttempts: 0, scannedAt: null },
        { where: { id: candidate.currentVersionId, scanStatus: 'skipped', scanResult: DISABLED_RESULT } }
      );
    }
    queued.push(await File.findByPk(candidate.id));
  }
  return queued.filter(Boolean);
};

const queueSkippedVersions = async (limit, currentVersionIds) => {
  if (!backfillEnabled() || limit <= 0) return [];
  const where = {
    scanStatus: 'skipped',
    scanResult: DISABLED_RESULT,
    status: 'ready',
    size: { [Op.lte]: maxBytes() },
  };
  if (currentVersionIds.length) where.id = { [Op.notIn]: currentVersionIds };
  const candidates = await Version.findAll({
    where,
    order: [['createdAt', 'ASC']],
    limit,
  });
  const queued = [];
  for (const candidate of candidates) {
    const [claimed] = await Version.update(
      { scanStatus: 'pending', scanResult: null, scanAttempts: 0, scannedAt: null },
      { where: { id: candidate.id, scanStatus: 'skipped', scanResult: DISABLED_RESULT } }
    );
    if (claimed) queued.push(await Version.findByPk(candidate.id));
  }
  return queued.filter(Boolean);
};

const processPendingScans = async (limit = 2) => {
  if (!enabled()) {
    const disabledState = { scanStatus: 'skipped', scanResult: DISABLED_RESULT, scannedAt: new Date() };
    await File.update(disabledState, { where: { scanStatus: 'pending', status: 'ready', deletedAt: null } });
    await Version.update(disabledState, { where: { scanStatus: 'pending', status: 'ready' } });
  }
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  await File.update({ scanStatus: 'pending' }, { where: { scanStatus: 'scanning', updatedAt: { [Op.lt]: staleBefore }, deletedAt: null } });
  await Version.update({ scanStatus: 'pending' }, { where: { scanStatus: 'scanning', updatedAt: { [Op.lt]: staleBefore } } });
  const files = await File.findAll({
    where: { scanStatus: 'pending', status: 'ready', deletedAt: null },
    order: [['createdAt', 'ASC']], limit,
  });
  const results = [];
  for (const file of files) results.push(await scanFile(file));
  if (enabled() && results.length < limit) {
    const currentVersionIds = await getCurrentVersionIds();
    const versionWhere = { scanStatus: 'pending', status: 'ready' };
    if (currentVersionIds.length) versionWhere.id = { [Op.notIn]: currentVersionIds };
    const versions = await Version.findAll({
      where: versionWhere,
      order: [['createdAt', 'ASC']],
      limit: limit - results.length,
    });
    for (const version of versions) results.push(await scanHistoricalVersion(version));
  }
  if (enabled() && results.length < limit) {
    const queuedFiles = await queueSkippedFiles(limit - results.length);
    for (const file of queuedFiles) results.push(await scanFile(file));
  }
  if (enabled() && results.length < limit) {
    const currentVersionIds = await getCurrentVersionIds();
    const queuedVersions = await queueSkippedVersions(limit - results.length, currentVersionIds);
    for (const version of queuedVersions) results.push(await scanHistoricalVersion(version));
  }
  return { processed: results.length, results };
};

module.exports = { processPendingScans };
