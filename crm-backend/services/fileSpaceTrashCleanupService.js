const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const db = require('../models');
const s3 = require('./fileSpaceS3Service');

const Folder = db.FileSpaceFolder;
const File = db.FileSpaceFile;
const Version = db.FileSpaceFileVersion;
const Audit = db.FileSpaceAuditLog;
const SyncEvent = db.FileSpaceSyncEvent;
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const RETENTION_DAYS = Math.max(Number(process.env.FILESPACE_TRASH_RETENTION_DAYS || 30), 1);
const AUDIT_RETENTION_DAYS = Math.max(Number(process.env.FILESPACE_AUDIT_RETENTION_DAYS || 180), 1);
const INCOMPLETE_VERSION_HOURS = Math.max(Number(process.env.FILESPACE_INCOMPLETE_VERSION_HOURS || 24), 1);
const SYNC_EVENT_RETENTION_DAYS = Math.max(Number(process.env.FILESPACE_SYNC_EVENT_RETENTION_DAYS || 90), 1);

const removeLegacyFile = async (legacyPath) => {
  const relativePath = String(legacyPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relativePath) return;
  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  const relativeToRoot = path.relative(UPLOAD_ROOT, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return;
  await fs.promises.unlink(absolutePath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
};

const destroyStoredFile = async (file) => {
  const versions = await Version.findAll({ where: { fileId: file.id }, attributes: ['objectKey'] });
  const objectKeys = new Set([file.objectKey, ...versions.map((version) => version.objectKey)].filter(Boolean));
  for (const objectKey of objectKeys) await s3.deleteObject(objectKey);
  await removeLegacyFile(file.legacyPath);
};

const descendantFolderIds = async (rootId) => {
  const ids = [rootId];
  for (let offset = 0; offset < ids.length; offset += 1) {
    const children = await Folder.findAll({ where: { parentId: ids[offset] }, attributes: ['id'] });
    ids.push(...children.map((folder) => folder.id));
  }
  return ids;
};

const purgeExpiredFileSpaceTrash = async () => {
  const incompleteCutoff = new Date(Date.now() - INCOMPLETE_VERSION_HOURS * 60 * 60 * 1000);
  const incompleteVersions = await Version.findAll({ where: { status: 'uploading', createdAt: { [Op.lte]: incompleteCutoff } } });
  for (const version of incompleteVersions) {
    await s3.deleteObject(version.objectKey).catch(() => {});
    await version.destroy();
  }
  const auditCutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const auditEntries = await Audit.destroy({ where: { createdAt: { [Op.lte]: auditCutoff } } });
  const syncCutoff = new Date(Date.now() - SYNC_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const syncEvents = await SyncEvent.destroy({ where: { createdAt: { [Op.lte]: syncCutoff } } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expiredFolders = await Folder.findAll({ where: { deletedAt: { [Op.lte]: cutoff } } });
  const expiredFolderIds = new Set(expiredFolders.map((folder) => folder.id));
  const topFolders = expiredFolders.filter((folder) => !expiredFolderIds.has(folder.parentId));
  const purgedFolderIds = new Set();
  let fileCount = 0;

  for (const folder of topFolders) {
    const folderIds = await descendantFolderIds(folder.id);
    folderIds.forEach((id) => purgedFolderIds.add(id));
    const files = await File.findAll({ where: { folderId: { [Op.in]: folderIds } } });
    for (const file of files) await destroyStoredFile(file);
    await db.sequelize.transaction(async (transaction) => {
      await File.destroy({ where: { folderId: { [Op.in]: folderIds } }, transaction });
      await Folder.destroy({ where: { id: { [Op.in]: folderIds } }, transaction });
    });
    fileCount += files.length;
    await Audit.create({ action: 'purge', entityType: 'folder', entityId: folder.id, entityName: folder.name, folderId: folder.parentId, details: { automatic: true, retentionDays: RETENTION_DAYS } });
  }

  const expiredFiles = await File.findAll({ where: { deletedAt: { [Op.lte]: cutoff } } });
  const standaloneFiles = expiredFiles.filter((file) => !purgedFolderIds.has(file.folderId));
  for (const file of standaloneFiles) {
    await destroyStoredFile(file);
    await file.destroy();
    await Audit.create({ action: 'purge', entityType: 'file', entityId: file.id, entityName: file.name, folderId: file.folderId, details: { automatic: true, retentionDays: RETENTION_DAYS } });
  }
  fileCount += standaloneFiles.length;
  return {
    folders: topFolders.length, files: fileCount, retentionDays: RETENTION_DAYS,
    auditEntries, auditRetentionDays: AUDIT_RETENTION_DAYS, incompleteVersions: incompleteVersions.length,
    syncEvents, syncEventRetentionDays: SYNC_EVENT_RETENTION_DAYS,
  };
};

module.exports = { purgeExpiredFileSpaceTrash };
