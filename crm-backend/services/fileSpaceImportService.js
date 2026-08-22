const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../models');
const s3 = require('./fileSpaceS3Service');

const Folder = db.FileSpaceFolder;
const File = db.FileSpaceFile;
const Version = db.FileSpaceFileVersion;
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const BLOCKED_EXTENSIONS = new Set(String(process.env.FILESPACE_BLOCKED_EXTENSIONS || 'exe,bat,cmd,com,scr,msi,ps1,vbs,js,jar').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
const AV_ENABLED = String(process.env.FILESPACE_ANTIVIRUS_ENABLED || 'true').toLowerCase() !== 'false';
const AV_MAX_FILE_SIZE = Math.max(Number(process.env.FILESPACE_AV_MAX_FILE_SIZE || 100 * 1024 * 1024), 1024 * 1024);

const getLegacyPath = (localPath) => {
  const relative = path.relative(UPLOAD_ROOT, path.resolve(localPath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.replace(/\\/g, '/');
};

const ensurePersonalRoot = (userId) => Folder.findOrCreate({
  where: { ownerId: userId, parentId: null, kind: 'personal', deletedAt: null },
  defaults: { name: 'Мои файлы', ownerId: userId, kind: 'personal' },
}).then(([folder]) => folder);

const importLocalFile = async ({ localPath, userId, name, contentType, size }) => {
  const extension = String(name || '').includes('.') ? String(name).split('.').pop().toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(extension)) throw new Error(`Загрузка файлов .${extension} запрещена политикой безопасности`);
  if (AV_ENABLED && Number(size) > AV_MAX_FILE_SIZE) throw new Error(`Файл превышает лимит антивирусной проверки ${Math.round(AV_MAX_FILE_SIZE / 1024 / 1024)} МБ`);
  const root = await ensurePersonalRoot(userId);
  const id = crypto.randomUUID();
  const objectKey = `users/${userId}/${id}/original`;
  const file = await File.create({
    id,
    folderId: root.id,
    ownerId: userId,
    name,
    objectKey,
    legacyPath: getLegacyPath(localPath),
    contentType: contentType || 'application/octet-stream',
    size,
    status: 'pending',
  });

  try {
    const result = await s3.putObject({
      objectKey,
      body: fs.createReadStream(localPath),
      contentType: file.contentType,
      contentLength: Number(size),
    });
    const etag = String(result.ETag || '').replaceAll('"', '') || null;
    const scanStatus = AV_ENABLED ? 'pending' : 'skipped';
    const scanResult = AV_ENABLED ? null : 'Antivirus disabled';
    const scannedAt = AV_ENABLED ? null : new Date();
    await db.sequelize.transaction(async (transaction) => {
      const version = await Version.create({
        fileId: file.id,
        versionNumber: 1,
        objectKey,
        authorId: userId,
        name,
        contentType: file.contentType,
        size,
        etag,
        source: 'import',
        status: 'ready',
        scanStatus,
        scanResult,
        scannedAt,
      }, { transaction });
      await file.update({
        status: 'ready', scanStatus, scanResult, scanAttempts: 0,
        scannedAt, etag, currentVersionId: version.id, versionNumber: 1,
      }, { transaction });
    });
    return file;
  } catch (error) {
    await file.update({ status: 'failed' }).catch(() => {});
    throw error;
  }
};

module.exports = { ensurePersonalRoot, importLocalFile };
