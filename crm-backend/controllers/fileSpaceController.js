const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodeXlsx = require('node-xlsx');
const { Op } = require('sequelize');
const db = require('../models');
const s3 = require('../services/fileSpaceS3Service');
const { createMediaPath, verifyMediaSignature } = require('../services/fileSpaceMediaService');
const { ensureRoomAllowsMessage } = require('../services/roomDeletionAccess');
const getIO = require('../socket').getIO;

const Folder = db.FileSpaceFolder;
const File = db.FileSpaceFile;
const Version = db.FileSpaceFileVersion;
const FolderRole = db.FileSpaceFolderRole;
const Audit = db.FileSpaceAuditLog;
const Role = db.Role;
const MAX_FILE_SIZE = Number(process.env.FILESPACE_MAX_FILE_SIZE || 5 * 1024 * 1024 * 1024);
const AV_ENABLED = String(process.env.FILESPACE_ANTIVIRUS_ENABLED || 'true').toLowerCase() !== 'false';
const AV_MAX_FILE_SIZE = Math.max(Number(process.env.FILESPACE_AV_MAX_FILE_SIZE || 100 * 1024 * 1024), 1024 * 1024);
const MAX_SPREADSHEET_PREVIEW_SIZE = 15 * 1024 * 1024;
const AUDIT_RETENTION_DAYS = Math.max(Number(process.env.FILESPACE_AUDIT_RETENTION_DAYS || 180), 1);
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const parseIdSet = (raw, fallback = '') => new Set(
  String(raw || fallback).split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)
);
const ADMIN_ROLE_IDS = new Set([
  ...parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, '1'),
  ...parseIdSet(process.env.ADMIN_ROLE_IDS, '2'),
]);
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, '');
const BLOCKED_EXTENSIONS = new Set(String(process.env.FILESPACE_BLOCKED_EXTENSIONS || 'exe,bat,cmd,com,scr,msi,ps1,vbs,js,jar').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
const isFileSpaceAdmin = (user) => ADMIN_ROLE_IDS.has(Number(user?.roleId)) || SUPER_ADMIN_USER_IDS.has(Number(user?.id));
const cleanName = (value) => String(value || '').trim().replace(/[\\/\0]/g, '').slice(0, 255);
const cleanContentType = (value) => {
  const contentType = String(value || '').trim().toLowerCase().slice(0, 255);
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(contentType)
    ? contentType
    : 'application/octet-stream';
};
const conflictCopyName = (name, user, versionId) => {
  const original = cleanName(name) || 'Файл';
  const dot = original.lastIndexOf('.');
  const extension = dot > 0 ? original.slice(dot) : '';
  const base = dot > 0 ? original.slice(0, dot) : original;
  const actor = cleanName(user?.name || user?.username || `сотрудник-${user?.id || 'unknown'}`).replace(/\s+/g, ' ').slice(0, 40);
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replaceAll(':', '-');
  const suffix = ` (конфликт ${actor} ${timestamp} ${String(versionId).slice(0, 6)})`;
  return `${base.slice(0, Math.max(1, 255 - extension.length - suffix.length))}${suffix}${extension}`;
};
const audit = (user, action, entityType, entity, details = {}) => Audit.create({
  actorId: user?.id || null, action, entityType, entityId: entity?.id || null,
  entityName: entity?.name || null, folderId: entity?.folderId || entity?.parentId || null, details,
}).catch((error) => console.error('[filespace:audit]', error.message));

const forbidden = (message = 'Недостаточно прав') => {
  const error = new Error(message);
  error.status = 403;
  return error;
};

const getPersonalRoot = (userId) => Folder.findOrCreate({
  where: { ownerId: userId, parentId: null, kind: 'personal', deletedAt: null },
  defaults: { name: 'Мои файлы', ownerId: userId, kind: 'personal' },
}).then(([folder]) => folder);

const getTreeRoot = async (folder) => {
  let current = folder;
  for (let depth = 0; current.parentId && depth < 100; depth += 1) {
    current = await Folder.findOne({ where: { id: current.parentId, deletedAt: null } });
    if (!current) throw forbidden('Корневая папка недоступна');
  }
  return current;
};

const accessibleFolder = async (folderId, user, { write = false } = {}) => {
  const folder = await Folder.findOne({ where: { id: folderId, deletedAt: null } });
  if (!folder) {
    const error = new Error('Папка не найдена или недоступна');
    error.status = 404;
    throw error;
  }
  const rootFolder = await getTreeRoot(folder);
  if (rootFolder.kind === 'personal') {
    if (Number(rootFolder.ownerId) !== Number(user.id) && !isFileSpaceAdmin(user)) throw forbidden();
    return { folder, rootFolder, canWrite: true };
  }
  if (isFileSpaceAdmin(user)) return { folder, rootFolder, canWrite: true };
  const allowed = rootFolder.allRolesAccess || await FolderRole.count({ where: { folderId: rootFolder.id, roleId: user.roleId } });
  if (!allowed) throw forbidden('Эта общая папка недоступна для вашей роли');
  if (write) throw forbidden('Общая папка доступна только для чтения');
  return { folder, rootFolder, canWrite: false };
};

const accessibleFile = async (fileId, user, options) => {
  const file = await File.findOne({ where: { id: fileId, status: 'ready', deletedAt: null } });
  if (!file) {
    const error = new Error('Файл не найден');
    error.status = 404;
    throw error;
  }
  if (!options?.allowQuarantined && !['clean', 'skipped'].includes(file.scanStatus)) {
    const error = new Error(file.scanStatus === 'infected' ? 'Файл заблокирован: обнаружена угроза' : file.scanStatus === 'failed' ? 'Файл заблокирован: антивирусная проверка не выполнена' : 'Файл ещё проверяется антивирусом');
    error.status = 423;
    error.code = `FILE_SCAN_${String(file.scanStatus || 'pending').toUpperCase()}`;
    throw error;
  }
  const access = await accessibleFolder(file.folderId, user, options);
  return { file, ...access };
};

const activeSiblingExists = (model, parentField, parentId, name, excludedId) => model.findOne({ where: {
  [parentField]: parentId, name: { [Op.iLike]: name }, deletedAt: null,
  ...(excludedId ? { id: { [Op.ne]: excludedId } } : {}),
} });

const folderPath = async (folder) => {
  const names = [];
  let current = folder;
  for (let depth = 0; current && depth < 100; depth += 1) {
    names.unshift(current.name);
    current = current.parentId ? await Folder.findByPk(current.parentId) : null;
  }
  return names.join(' / ');
};

const canManageDeleted = (entity, user) => isFileSpaceAdmin(user) || Number(entity.ownerId) === Number(user.id);

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
  for (const objectKey of objectKeys) {
    await s3.deleteObject(objectKey).catch((error) => console.warn('[filespace] S3 delete failed', { fileId: file.id, code: error?.name || error?.code }));
  }
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

const withFileCounts = async (folders) => {
  if (!folders.length) return [];
  const [allFolders, groupedFiles] = await Promise.all([
    Folder.findAll({ where: { deletedAt: null }, attributes: ['id', 'parentId'], raw: true }),
    File.findAll({
      where: { status: 'ready', deletedAt: null },
      attributes: ['folderId', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      group: ['folderId'], raw: true,
    }),
  ]);
  const children = new Map();
  allFolders.forEach((folder) => {
    if (!folder.parentId) return;
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  });
  const directCounts = new Map(groupedFiles.map((row) => [row.folderId, Number(row.count)]));
  const totals = new Map();
  const totalFor = (folderId, visiting = new Set()) => {
    if (totals.has(folderId)) return totals.get(folderId);
    if (visiting.has(folderId)) return directCounts.get(folderId) || 0;
    const nextVisiting = new Set(visiting).add(folderId);
    const total = (directCounts.get(folderId) || 0) + (children.get(folderId) || []).reduce((sum, childId) => sum + totalFor(childId, nextVisiting), 0);
    totals.set(folderId, total);
    return total;
  };
  return folders.map((folder) => {
    const plain = typeof folder.toJSON === 'function' ? folder.toJSON() : folder;
    return { ...plain, fileCount: totalFor(plain.id) };
  });
};

const media = async (req, res, next) => {
  try {
    if (!verifyMediaSignature(req.params.fileId, req.query.signature)) return res.status(403).json({ error: 'Недействительная ссылка на файл' });
    const file = await File.findOne({ where: { id: req.params.fileId, status: 'ready', scanStatus: { [Op.in]: ['clean', 'skipped'] }, deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    try {
      const object = await s3.getObject(file.objectKey);
      res.setHeader('Content-Type', object.ContentType || file.contentType || 'application/octet-stream');
      if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      object.Body.on('error', next);
      return object.Body.pipe(res);
    } catch (s3Error) {
      const relativePath = String(file.legacyPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
      const relativeToRoot = path.relative(UPLOAD_ROOT, absolutePath);
      if (!relativePath || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) throw s3Error;
      const stats = await fs.promises.stat(absolutePath).catch(() => null);
      if (!stats?.isFile()) throw s3Error;
      console.warn('[filespace] S3 media unavailable, serving legacy upload', { fileId: file.id, code: s3Error?.name || s3Error?.code });
      res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(stats.size));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
      res.setHeader('Cache-Control', 'private, max-age=60');
      const stream = fs.createReadStream(absolutePath);
      stream.on('error', next);
      return stream.pipe(res);
    }
  } catch (error) { next(error); }
};

const root = async (req, res, next) => {
  try {
    const personalRoot = await getPersonalRoot(req.user.id);
    const admin = isFileSpaceAdmin(req.user);
    let personalFolders = [];
    if (admin) {
      const users = await db.User.findAll({
        where: { isActive: true, system: false },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
      });
      const folders = await Promise.all(users.map((user) => getPersonalRoot(user.id)));
      const userNames = new Map(users.map((user) => [Number(user.id), user.name]));
      personalFolders = folders.map((folder) => ({ ...folder.toJSON(), ownerName: userNames.get(Number(folder.ownerId)) || `Сотрудник #${folder.ownerId}` }))
        .sort((left, right) => left.ownerName.localeCompare(right.ownerName, 'ru'));
    }
    let sharedFolders;
    if (admin) {
      sharedFolders = await Folder.findAll({ where: { parentId: null, kind: 'shared', deletedAt: null }, order: [['name', 'ASC']] });
    } else {
      const grants = await FolderRole.findAll({ where: { roleId: req.user.roleId }, attributes: ['folderId'] });
      sharedFolders = await Folder.findAll({
        where: {
          [Op.or]: [{ allRolesAccess: true }, { id: { [Op.in]: grants.map((grant) => grant.folderId) } }],
          parentId: null, kind: 'shared', deletedAt: null,
        },
        order: [['name', 'ASC']],
      });
    }
    const countedFolders = await withFileCounts([personalRoot, ...personalFolders, ...sharedFolders]);
    const countsById = new Map(countedFolders.map((folder) => [folder.id, folder]));
    const [trashFileCount, auditCount] = await Promise.all([
      File.count({ where: { ...(admin ? {} : { ownerId: req.user.id }), status: 'ready', deletedAt: { [Op.ne]: null } } }),
      Audit.count({ where: admin ? {} : { actorId: req.user.id } }),
    ]);
    res.json({
      personalRoot: countsById.get(personalRoot.id),
      personalFolders: personalFolders.map((folder) => countsById.get(folder.id)),
      sharedFolders: sharedFolders.map((folder) => {
        const counted = countsById.get(folder.id);
        return { ...counted, canDelete: Number(counted.ownerId) === Number(req.user.id) };
      }),
      isAdmin: admin, trashFileCount, auditCount, auditRetentionDays: AUDIT_RETENTION_DAYS,
    });
  } catch (error) { next(error); }
};

const list = async (req, res, next) => {
  try {
    const { folder, rootFolder, canWrite } = await accessibleFolder(req.params.folderId, req.user);
    const [folders, files] = await Promise.all([
      Folder.findAll({ where: { parentId: folder.id, deletedAt: null }, order: [['name', 'ASC']] }),
      File.findAll({ where: { folderId: folder.id, status: 'ready', deletedAt: null }, order: [['name', 'ASC']] }),
    ]);
    const countedFolders = await withFileCounts(folders);
    res.json({
      folder, rootFolder, canWrite,
      folders: countedFolders.map((child) => ({ ...child, canDelete: canWrite && Boolean(child.parentId) && Number(child.ownerId) === Number(req.user.id) })),
      files,
    });
  } catch (error) { next(error); }
};

const createFolder = async (req, res, next) => {
  try {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Укажите название папки' });
    if (!req.body.parentId) {
      if (req.body.kind !== 'shared' || !isFileSpaceAdmin(req.user)) throw forbidden('Только администратор может создавать общие папки');
      const exists = await Folder.findOne({ where: { parentId: null, kind: 'shared', name: { [Op.iLike]: name }, deletedAt: null } });
      if (exists) return res.status(409).json({ error: 'Общая папка с таким названием уже существует' });
      const folder = await db.sequelize.transaction(async (transaction) => {
        const created = await Folder.create({ name, parentId: null, ownerId: req.user.id, kind: 'shared', allRolesAccess: true }, { transaction });
        const roles = await Role.findAll({ attributes: ['id'], transaction });
        if (roles.length) await FolderRole.bulkCreate(roles.map((role) => ({ folderId: created.id, roleId: role.id })), { transaction });
        return created;
      });
      audit(req.user, 'create', 'folder', folder);
      return res.status(201).json(folder);
    }
    const { folder: parent, rootFolder } = await accessibleFolder(req.body.parentId, req.user, { write: true });
    const exists = await Folder.findOne({ where: { parentId: parent.id, name: { [Op.iLike]: name }, deletedAt: null } });
    if (exists) return res.status(409).json({ error: 'Папка с таким названием уже существует' });
    const folder = await Folder.create({ name, parentId: parent.id, ownerId: req.user.id, kind: rootFolder.kind });
    audit(req.user, 'create', 'folder', folder);
    return res.status(201).json(folder);
  } catch (error) { next(error); }
};

const getFolderAccess = async (req, res, next) => {
  try {
    if (!isFileSpaceAdmin(req.user)) throw forbidden();
    const { folder, rootFolder } = await accessibleFolder(req.params.folderId, req.user);
    if (folder.id !== rootFolder.id || rootFolder.kind !== 'shared') return res.status(400).json({ error: 'Права задаются для корневой общей папки' });
    const [roles, grants] = await Promise.all([
      Role.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
      FolderRole.findAll({ where: { folderId: folder.id }, attributes: ['roleId'] }),
    ]);
    const allowed = new Set(grants.map((grant) => Number(grant.roleId)));
    res.json({ folder, roles: roles.map((role) => ({ id: role.id, name: role.name, allowed: folder.allRolesAccess || allowed.has(Number(role.id)) })) });
  } catch (error) { next(error); }
};

const updateFolderAccess = async (req, res, next) => {
  try {
    if (!isFileSpaceAdmin(req.user)) throw forbidden();
    const { folder, rootFolder } = await accessibleFolder(req.params.folderId, req.user);
    if (folder.id !== rootFolder.id || rootFolder.kind !== 'shared') return res.status(400).json({ error: 'Права задаются для корневой общей папки' });
    const requestedIds = [...new Set(Array.isArray(req.body.roleIds) ? req.body.roleIds.map(Number).filter(Number.isInteger) : [])];
    const allRoles = await Role.findAll({ attributes: ['id'] });
    const roles = requestedIds.length ? allRoles.filter((role) => requestedIds.includes(Number(role.id))) : [];
    const allRolesAccess = allRoles.length > 0 && roles.length === allRoles.length;
    await db.sequelize.transaction(async (transaction) => {
      await folder.update({ allRolesAccess }, { transaction });
      await FolderRole.destroy({ where: { folderId: folder.id }, transaction });
      if (roles.length) await FolderRole.bulkCreate(roles.map((role) => ({ folderId: folder.id, roleId: role.id })), { transaction });
    });
    audit(req.user, 'permissions', 'folder', folder, { roleIds: roles.map((role) => role.id) });
    res.json({ roleIds: roles.map((role) => role.id) });
  } catch (error) { next(error); }
};

const startUpload = async (req, res, next) => {
  try {
    const { folder } = await accessibleFolder(req.body.folderId, req.user, { write: true });
    const name = cleanName(req.body.name);
    const size = Number(req.body.size);
    const contentType = cleanContentType(req.body.contentType);
    if (!name || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) return res.status(400).json({ error: 'Некорректное имя или размер файла' });
    if (AV_ENABLED && size > AV_MAX_FILE_SIZE) return res.status(413).json({ error: `Файл превышает лимит антивирусной проверки (${Math.round(AV_MAX_FILE_SIZE / 1024 / 1024)} МБ)` });
    const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (BLOCKED_EXTENSIONS.has(extension)) return res.status(415).json({ error: `Загрузка файлов .${extension} запрещена политикой безопасности` });
    const id = crypto.randomUUID();
    const objectKey = `users/${req.user.id}/${id}/original`;
    const file = await File.create({ id, folderId: folder.id, ownerId: req.user.id, name, objectKey, contentType, size });
    const uploadUrl = await s3.createUploadUrl({ objectKey, contentType });
    res.status(201).json({ file, uploadUrl, method: 'PUT', headers: { 'Content-Type': contentType } });
  } catch (error) { next(error); }
};

const uploadContent = async (req, res, next) => {
  try {
    const file = await File.findOne({ where: {
      id: req.params.fileId, ownerId: req.user.id, status: 'pending', deletedAt: null,
    } });
    if (!file) return res.status(404).json({ error: 'Загрузка не найдена' });
    await accessibleFolder(file.folderId, req.user, { write: true });
    const contentLength = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(contentLength) || contentLength !== Number(file.size)) {
      return res.status(409).json({ error: 'Размер передаваемого файла не совпадает' });
    }
    await s3.putObject({
      objectKey: file.objectKey,
      body: req,
      contentType: file.contentType,
      contentLength,
    });
    res.status(204).end();
  } catch (error) { next(error); }
};

const completeUpload = async (req, res, next) => {
  try {
    const file = await File.findOne({ where: { id: req.params.fileId, ownerId: req.user.id, status: 'pending', deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Загрузка не найдена' });
    await accessibleFolder(file.folderId, req.user, { write: true });
    const object = await s3.headObject(file.objectKey);
    if (Number(object.ContentLength) !== Number(file.size)) return res.status(409).json({ error: 'Размер загруженного файла не совпадает' });
    const etag = String(object.ETag || '').replaceAll('"', '') || null;
    const scanStatus = AV_ENABLED ? 'pending' : 'skipped';
    const scanResult = AV_ENABLED ? null : 'Antivirus disabled';
    const scannedAt = AV_ENABLED ? null : new Date();
    await db.sequelize.transaction(async (transaction) => {
      const version = await Version.create({
        fileId: file.id,
        versionNumber: 1,
        objectKey: file.objectKey,
        authorId: req.user.id,
        name: file.name,
        contentType: file.contentType,
        size: file.size,
        etag,
        source: 'web',
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
    audit(req.user, 'upload', 'file', file, { size: Number(file.size) });
    res.json(file);
  } catch (error) { next(error); }
};

const download = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user);
    res.json({ url: await s3.createDownloadUrl({ objectKey: file.objectKey, fileName: file.name }) });
  } catch (error) { next(error); }
};

// Авторизованный резервный канал для сетей, где прямой TLS к S3 недоступен.
const downloadContent = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user);
    const object = await s3.getObject(file.objectKey);
    res.setHeader('Content-Type', object.ContentType || file.contentType || 'application/octet-stream');
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    object.Body.on('error', (error) => {
      if (!res.headersSent) next(error);
      else res.destroy(error);
    });
    req.on('aborted', () => object.Body.destroy());
    object.Body.pipe(res);
  } catch (error) { next(error); }
};

const open = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user);
    res.json({ url: await s3.createViewUrl({ objectKey: file.objectKey }) });
  } catch (error) { next(error); }
};

const preview = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user);
    const type = String(file.contentType || '').toLowerCase();
    const extension = String(file.name || '').split('.').pop()?.toLowerCase();
    const image = type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension);
    const pdf = type === 'application/pdf' || extension === 'pdf';
    const spreadsheet = extension === 'xlsx';
    if (!image && !pdf && !spreadsheet) return res.status(415).json({ error: 'Предпросмотр для этого типа файла недоступен' });
    if (spreadsheet && Number(file.size) > MAX_SPREADSHEET_PREVIEW_SIZE) return res.status(413).json({ error: 'Таблица слишком большая для предпросмотра' });
    const object = await s3.getObject(file.objectKey);
    if (spreadsheet) {
      const bytes = await object.Body.transformToByteArray();
      const sheets = nodeXlsx.parse(Buffer.from(bytes));
      const sheet = sheets[0] || { name: 'Лист 1', data: [] };
      const rows = (sheet.data || []).slice(0, 100).map((row) => (row || []).slice(0, 30).map((cell) => (
        cell == null ? '' : typeof cell === 'object' ? String(cell.result ?? cell.value ?? '') : String(cell)
      )));
      return res.json({ kind: 'spreadsheet', sheetName: sheet.name, rows, truncated: (sheet.data || []).length > 100 });
    }
    res.setHeader('Content-Type', pdf ? 'application/pdf' : (object.ContentType || file.contentType || 'application/octet-stream'));
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    object.Body.on('error', next);
    object.Body.pipe(res);
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user, { write: true, allowQuarantined: true });
    await file.update({ deletedAt: new Date() });
    audit(req.user, 'trash', 'file', file);
    res.status(204).end();
  } catch (error) { next(error); }
};

const removeMany = async (req, res, next) => {
  try {
    const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : [])].slice(0, 200);
    if (!ids.length) return res.status(400).json({ error: 'Не выбраны файлы' });
    const files = await File.findAll({ where: { id: { [Op.in]: ids }, status: 'ready', deletedAt: null } });
    for (const folderId of new Set(files.map((file) => file.folderId))) await accessibleFolder(folderId, req.user, { write: true });
    const [count] = await File.update({ deletedAt: new Date() }, { where: { id: { [Op.in]: files.map((file) => file.id) } } });
    files.forEach((file) => audit(req.user, 'trash', 'file', file));
    res.json({ count });
  } catch (error) { next(error); }
};

const renameFolder = async (req, res, next) => {
  try {
    const { folder, rootFolder } = await accessibleFolder(req.params.folderId, req.user, { write: true });
    if (folder.id === rootFolder.id && rootFolder.kind === 'personal') return res.status(400).json({ error: 'Личную корневую папку нельзя переименовать' });
    if (!folder.parentId && rootFolder.kind === 'shared' && Number(folder.ownerId) !== Number(req.user.id)) {
      throw forbidden('Переименовать общую папку может только её создатель');
    }
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Укажите новое название' });
    if (await activeSiblingExists(Folder, 'parentId', folder.parentId, name, folder.id)) return res.status(409).json({ error: 'Папка с таким названием уже существует' });
    const oldName = folder.name;
    await folder.update({ name });
    audit(req.user, 'rename', 'folder', folder, { oldName });
    res.json(folder);
  } catch (error) { next(error); }
};

const renameFile = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user, { write: true, allowQuarantined: true });
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Укажите новое название' });
    if (await activeSiblingExists(File, 'folderId', file.folderId, name, file.id)) return res.status(409).json({ error: 'Файл с таким названием уже существует' });
    const oldName = file.name;
    await file.update({ name });
    audit(req.user, 'rename', 'file', file, { oldName });
    res.json(file);
  } catch (error) { next(error); }
};

const move = async (req, res, next) => {
  try {
    const type = req.body.type === 'folder' ? 'folder' : 'file';
    const ids = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : [])].slice(0, 200);
    if (!ids.length) return res.status(400).json({ error: 'Не выбраны элементы' });
    const destination = await accessibleFolder(req.body.destinationFolderId, req.user, { write: true });
    let count = 0;
    for (const id of ids) {
      if (type === 'file') {
        const { file, rootFolder } = await accessibleFile(id, req.user, { write: true, allowQuarantined: true });
        if (rootFolder.id !== destination.rootFolder.id) throw forbidden('Перемещение между личными и общими пространствами пока недоступно');
        if (await activeSiblingExists(File, 'folderId', destination.folder.id, file.name, file.id)) throw Object.assign(new Error(`В папке назначения уже есть файл «${file.name}»`), { status: 409 });
        const oldFolderId = file.folderId;
        await file.update({ folderId: destination.folder.id });
        audit(req.user, 'move', 'file', file, { oldFolderId, destinationFolderId: destination.folder.id });
      } else {
        const source = await accessibleFolder(id, req.user, { write: true });
        if (!source.folder.parentId) return res.status(400).json({ error: 'Корневую папку нельзя перемещать' });
        if (source.rootFolder.id !== destination.rootFolder.id) throw forbidden('Перемещение между пространствами пока недоступно');
        const descendants = await descendantFolderIds(source.folder.id);
        if (descendants.includes(destination.folder.id)) return res.status(400).json({ error: 'Нельзя переместить папку внутрь самой себя' });
        if (await activeSiblingExists(Folder, 'parentId', destination.folder.id, source.folder.name, source.folder.id)) throw Object.assign(new Error(`В папке назначения уже есть папка «${source.folder.name}»`), { status: 409 });
        const oldParentId = source.folder.parentId;
        await source.folder.update({ parentId: destination.folder.id });
        audit(req.user, 'move', 'folder', source.folder, { oldParentId, destinationFolderId: destination.folder.id });
      }
      count += 1;
    }
    res.json({ count });
  } catch (error) { next(error); }
};

const removeFolder = async (req, res, next) => {
  try {
    const { folder, rootFolder } = await accessibleFolder(req.params.folderId, req.user, { write: true });
    if (!folder.parentId && rootFolder.kind === 'personal') return res.status(400).json({ error: 'Корневую личную папку нельзя переместить в корзину' });
    if (!folder.parentId && Number(folder.ownerId) !== Number(req.user.id)) throw forbidden('Удалить общую папку может только её создатель');
    await folder.update({ deletedAt: new Date() });
    audit(req.user, 'trash', 'folder', folder);
    res.status(204).end();
  } catch (error) { next(error); }
};

const trash = async (req, res, next) => {
  try {
    const scope = isFileSpaceAdmin(req.user) ? {} : { ownerId: req.user.id };
    const [folders, files, fileCount] = await Promise.all([
      Folder.findAll({ where: { ...scope, deletedAt: { [Op.ne]: null } }, order: [['deletedAt', 'DESC']], limit: 200 }),
      File.findAll({ where: { ...scope, status: 'ready', deletedAt: { [Op.ne]: null } }, order: [['deletedAt', 'DESC']], limit: 200 }),
      File.count({ where: { ...scope, status: 'ready', deletedAt: { [Op.ne]: null } } }),
    ]);
    res.json({ folders, files, fileCount });
  } catch (error) { next(error); }
};

const restoreTrash = async (req, res, next) => {
  try {
    const model = req.params.type === 'folder' ? Folder : File;
    const entity = await model.findOne({ where: { id: req.params.id, deletedAt: { [Op.ne]: null } } });
    if (!entity) return res.status(404).json({ error: 'Элемент не найден в корзине' });
    if (!canManageDeleted(entity, req.user)) throw forbidden();
    const parentId = req.params.type === 'folder' ? entity.parentId : entity.folderId;
    if (parentId) await accessibleFolder(parentId, req.user, { write: true });
    const parentField = req.params.type === 'folder' ? 'parentId' : 'folderId';
    if (await activeSiblingExists(model, parentField, parentId, entity.name, entity.id)) return res.status(409).json({ error: 'В исходной папке уже есть элемент с таким названием' });
    await entity.update({ deletedAt: null });
    audit(req.user, 'restore', req.params.type, entity);
    res.json(entity);
  } catch (error) { next(error); }
};

const purgeTrash = async (req, res, next) => {
  try {
    const type = req.params.type === 'folder' ? 'folder' : 'file';
    const model = type === 'folder' ? Folder : File;
    const entity = await model.findOne({ where: { id: req.params.id, deletedAt: { [Op.ne]: null } } });
    if (!entity) return res.status(404).json({ error: 'Элемент не найден в корзине' });
    if (!canManageDeleted(entity, req.user)) throw forbidden();
    if (type === 'file') {
      await destroyStoredFile(entity);
      await entity.destroy();
    } else {
      const folderIds = await descendantFolderIds(entity.id);
      const files = await File.findAll({ where: { folderId: { [Op.in]: folderIds } } });
      for (const file of files) await destroyStoredFile(file);
      await db.sequelize.transaction(async (transaction) => {
        await File.destroy({ where: { folderId: { [Op.in]: folderIds } }, transaction });
        await Folder.destroy({ where: { id: { [Op.in]: folderIds } }, transaction });
      });
    }
    audit(req.user, 'purge', type, entity);
    res.status(204).end();
  } catch (error) { next(error); }
};

const purgeTrashFiles = async (req, res, next) => {
  try {
    const scope = isFileSpaceAdmin(req.user) ? {} : { ownerId: req.user.id };
    const requestedIds = [...new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : [])];
    if (!req.body.all && !requestedIds.length) return res.status(400).json({ error: 'Не выбраны файлы' });
    const files = await File.findAll({ where: {
      ...scope, status: 'ready', deletedAt: { [Op.ne]: null },
      ...(req.body.all ? {} : { id: { [Op.in]: requestedIds.slice(0, 500) } }),
    } });
    for (const file of files) await destroyStoredFile(file);
    await File.destroy({ where: { id: { [Op.in]: files.map((file) => file.id) } } });
    files.forEach((file) => audit(req.user, 'purge', 'file', file, { bulk: true }));
    res.json({ count: files.length });
  } catch (error) { next(error); }
};

const destinations = async (req, res, next) => {
  try {
    let sourceRootId = null;
    if (req.query.sourceType === 'file' && req.query.sourceId) {
      const source = await accessibleFile(req.query.sourceId, req.user, { write: true, allowQuarantined: true });
      sourceRootId = source.rootFolder.id;
    } else if (req.query.sourceType === 'folder' && req.query.sourceId) {
      const source = await accessibleFolder(req.query.sourceId, req.user, { write: true });
      sourceRootId = source.rootFolder.id;
    }
    if (!sourceRootId) return res.status(400).json({ error: 'Не указан перемещаемый элемент' });
    const folders = await Folder.findAll({ where: { deletedAt: null }, order: [['name', 'ASC']] });
    const result = [];
    for (const folder of folders) {
      try {
        const access = await accessibleFolder(folder.id, req.user, { write: true });
        if (access.rootFolder.id === sourceRootId) result.push({ ...folder.toJSON(), path: await folderPath(folder), rootId: access.rootFolder.id });
      } catch (_) { /* inaccessible destination */ }
    }
    res.json(result);
  } catch (error) { next(error); }
};

const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ folders: [], files: [] });
    const [folderCandidates, fileCandidates] = await Promise.all([
      Folder.findAll({ where: { name: { [Op.iLike]: `%${q}%` }, deletedAt: null }, limit: 100 }),
      File.findAll({ where: { name: { [Op.iLike]: `%${q}%` }, status: 'ready', deletedAt: null }, limit: 100 }),
    ]);
    const folders = [];
    const files = [];
    for (const folder of folderCandidates) {
      try { const access = await accessibleFolder(folder.id, req.user); folders.push({ ...folder.toJSON(), path: await folderPath(folder), canWrite: access.canWrite, canDelete: access.canWrite && Boolean(folder.parentId) && Number(folder.ownerId) === Number(req.user.id) }); } catch (_) { /* hidden */ }
    }
    for (const file of fileCandidates) {
      try { const access = await accessibleFolder(file.folderId, req.user); const parent = access.folder; files.push({ ...file.toJSON(), path: `${await folderPath(parent)} / ${file.name}`, canWrite: access.canWrite }); } catch (_) { /* hidden */ }
    }
    res.json({ folders: await withFileCounts(folders), files });
  } catch (error) { next(error); }
};

const auditLog = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const filters = [];
    if (!isFileSpaceAdmin(req.user)) filters.push({ actorId: req.user.id });
    if (q) {
      const matchingUsers = await db.User.findAll({ where: { name: { [Op.iLike]: `%${q}%` } }, attributes: ['id'] });
      const actionMatches = [];
      const normalized = q.toLowerCase();
      const actionTerms = {
        create: ['созд'], upload: ['загруз'], rename: ['переимен'], move: ['перемест'],
        trash: ['корзин'], restore: ['восстанов'], purge: ['удал'], permissions: ['прав'], send_to_chat: ['чат', 'отправ'],
        version_upload: ['верси', 'обнов'], version_restore: ['верси', 'восстанов'],
        conflict_copy: ['конфликт', 'копи', 'измен'],
        virus_scan_clean: ['антивирус', 'провер', 'чист'], virus_detected: ['вирус', 'угроз', 'зараж'],
        virus_scan_failed: ['ошиб', 'не смог', 'антивирус'], virus_rescan: ['повтор', 'провер'],
      };
      Object.entries(actionTerms).forEach(([action, terms]) => { if (terms.some((term) => normalized.includes(term))) actionMatches.push(action); });
      filters.push({ [Op.or]: [
        { entityName: { [Op.iLike]: `%${q}%` } }, { action: { [Op.iLike]: `%${q}%` } },
        { entityType: { [Op.iLike]: `%${q}%` } },
        ...(matchingUsers.length ? [{ actorId: { [Op.in]: matchingUsers.map((user) => user.id) } }] : []),
        ...(actionMatches.length ? [{ action: { [Op.in]: actionMatches } }] : []),
      ] });
    }
    if (req.query.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString('utf8'));
        const createdAt = new Date(cursor.createdAt);
        if (!Number.isNaN(createdAt.getTime()) && cursor.id) filters.push({ [Op.or]: [
          { createdAt: { [Op.lt]: createdAt } },
          { createdAt, id: { [Op.lt]: String(cursor.id) } },
        ] });
      } catch (_) { return res.status(400).json({ error: 'Некорректный курсор истории' }); }
    }
    const where = filters.length ? { [Op.and]: filters } : {};
    const countFilters = req.query.cursor ? filters.slice(0, -1) : filters;
    const countWhere = countFilters.length ? { [Op.and]: countFilters } : {};
    const [entriesWithExtra, total] = await Promise.all([
      Audit.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limit + 1 }),
      Audit.count({ where: countWhere }),
    ]);
    const hasMore = entriesWithExtra.length > limit;
    const entries = entriesWithExtra.slice(0, limit);
    const actorIds = [...new Set(entries.map((entry) => entry.actorId).filter(Boolean))];
    const users = actorIds.length ? await db.User.findAll({ where: { id: { [Op.in]: actorIds } }, attributes: ['id', 'name'] }) : [];
    const names = new Map(users.map((user) => [Number(user.id), user.name]));
    const last = entries.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null;
    res.json({
      entries: entries.map((entry) => ({ ...entry.toJSON(), actorName: names.get(Number(entry.actorId)) || 'Система' })),
      nextCursor, total, retentionDays: AUDIT_RETENTION_DAYS,
    });
  } catch (error) { next(error); }
};

const fileVersions = async (req, res, next) => {
  try {
    const file = await File.findOne({ where: { id: req.params.fileId, status: 'ready', deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    const access = await accessibleFolder(file.folderId, req.user);
    const versions = await Version.findAll({
      where: { fileId: file.id, status: 'ready' },
      order: [['versionNumber', 'DESC']],
      limit: 300,
    });
    const authorIds = [...new Set(versions.map((version) => version.authorId).filter(Boolean))];
    const authors = authorIds.length
      ? await db.User.findAll({ where: { id: { [Op.in]: authorIds } }, attributes: ['id', 'name'] })
      : [];
    const authorNames = new Map(authors.map((author) => [Number(author.id), author.name]));
    res.json({
      file: { id: file.id, name: file.name, currentVersionId: file.currentVersionId, versionNumber: file.versionNumber, canWrite: access.canWrite },
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        name: version.name,
        contentType: version.contentType,
        size: version.size,
        source: version.source,
        scanStatus: version.scanStatus,
        scanResult: version.scanResult,
        scannedAt: version.scannedAt,
        createdAt: version.createdAt,
        authorName: authorNames.get(Number(version.authorId)) || (version.source === 'migration' ? 'Перенесено из FileSpace' : 'Система'),
        isCurrent: version.id === file.currentVersionId,
      })),
    });
  } catch (error) { next(error); }
};

const getVersionForAccess = async (fileId, versionId, user, { write = false } = {}) => {
  const file = await File.findOne({ where: { id: fileId, status: 'ready', deletedAt: null } });
  if (!file) {
    const error = new Error('Файл не найден');
    error.status = 404;
    throw error;
  }
  await accessibleFolder(file.folderId, user, { write });
  const version = await Version.findOne({ where: { id: versionId, fileId, status: 'ready' } });
  if (!version) {
    const error = new Error('Версия файла не найдена');
    error.status = 404;
    throw error;
  }
  return { file, version };
};

const startVersionUpload = async (req, res, next) => {
  let version;
  try {
    const file = await File.findOne({ where: { id: req.params.fileId, status: 'ready', deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    await accessibleFolder(file.folderId, req.user, { write: true });
    const size = Number(req.body.size);
    const contentType = cleanContentType(req.body.contentType);
    const sourceName = cleanName(req.body.sourceName);
    const baseVersionId = String(req.body.baseVersionId || '');
    if (!sourceName || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) return res.status(400).json({ error: 'Некорректное имя или размер файла' });
    if (AV_ENABLED && size > AV_MAX_FILE_SIZE) return res.status(413).json({ error: `Файл превышает лимит антивирусной проверки (${Math.round(AV_MAX_FILE_SIZE / 1024 / 1024)} МБ)` });
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    const sourceExtension = sourceName.includes('.') ? sourceName.split('.').pop().toLowerCase() : '';
    if (sourceExtension !== extension) return res.status(415).json({ error: 'Новая версия должна иметь то же расширение файла' });
    if (BLOCKED_EXTENSIONS.has(extension)) return res.status(415).json({ error: `Загрузка файлов .${extension} запрещена политикой безопасности` });
    const versionId = crypto.randomUUID();
    const objectKey = `users/${file.ownerId}/${file.id}/versions/${versionId}/original`;
    version = await db.sequelize.transaction(async (transaction) => {
      const lockedFile = await File.findByPk(file.id, { transaction, lock: transaction.LOCK.UPDATE });
      const baseVersion = baseVersionId
        ? await Version.findOne({ where: { id: baseVersionId, fileId: file.id, status: 'ready' }, transaction })
        : null;
      if (!baseVersion) throw Object.assign(new Error('Базовая версия файла не найдена. Выполните полную синхронизацию.'), { status: 409 });
      const willCreateConflict = lockedFile.currentVersionId !== baseVersionId;
      if (!willCreateConflict && AV_ENABLED && !['clean', 'skipped'].includes(lockedFile.scanStatus)) throw Object.assign(new Error('Дождитесь завершения проверки текущей версии файла.'), { status: 423 });
      const created = await Version.create({
        id: versionId,
        fileId: file.id,
        baseVersionId,
        versionNumber: null,
        objectKey,
        authorId: req.user.id,
        name: file.name,
        contentType,
        size,
        source: 'web',
        status: 'uploading',
        scanStatus: 'pending',
      }, { transaction });
      created.setDataValue('willCreateConflict', willCreateConflict);
      return created;
    });
    const uploadUrl = await s3.createUploadUrl({ objectKey, contentType });
    res.status(201).json({
      version: { id: version.id },
      willCreateConflict: Boolean(version.getDataValue('willCreateConflict')),
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    if (version) await version.destroy().catch(() => {});
    next(error);
  }
};

const uploadVersionContent = async (req, res, next) => {
  try {
    const version = await Version.findOne({ where: {
      id: req.params.versionId,
      fileId: req.params.fileId,
      authorId: req.user.id,
      status: 'uploading',
    } });
    if (!version) return res.status(404).json({ error: 'Загрузка версии не найдена' });
    const file = await File.findOne({ where: { id: version.fileId, status: 'ready' } });
    if (!file) return res.status(404).json({ error: 'Исходный файл больше не существует' });
    if (!file.deletedAt) await accessibleFolder(file.folderId, req.user, { write: true });
    const contentLength = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(contentLength) || contentLength !== Number(version.size)) {
      return res.status(409).json({ error: 'Размер передаваемой версии не совпадает' });
    }
    await s3.putObject({
      objectKey: version.objectKey,
      body: req,
      contentType: version.contentType,
      contentLength,
    });
    res.status(204).end();
  } catch (error) { next(error); }
};

const completeVersionUpload = async (req, res, next) => {
  let uploadedObjectKey = null;
  try {
    const version = await Version.findOne({
      where: { id: req.params.versionId, fileId: req.params.fileId, authorId: req.user.id, status: 'uploading' },
    });
    if (!version) return res.status(404).json({ error: 'Загрузка версии не найдена' });
    const file = await File.findOne({ where: { id: version.fileId, status: 'ready' } });
    if (!file) return res.status(404).json({ error: 'Исходный файл больше не существует' });
    let forcePersonalConflict = Boolean(file.deletedAt);
    if (!forcePersonalConflict) {
      try {
        await accessibleFolder(file.folderId, req.user, { write: true });
      } catch (accessError) {
        if (![403, 404].includes(accessError.status)) throw accessError;
        forcePersonalConflict = true;
      }
    }
    uploadedObjectKey = version.objectKey;
    const object = await s3.headObject(version.objectKey);
    if (Number(object.ContentLength) !== Number(version.size)) throw Object.assign(new Error('Размер загруженной версии не совпадает'), { status: 409 });
    const etag = String(object.ETag || '').replaceAll('"', '') || null;
    const scanStatus = AV_ENABLED ? 'pending' : 'skipped';
    const scanResult = AV_ENABLED ? null : 'Antivirus disabled';
    const scannedAt = AV_ENABLED ? null : new Date();
    const completion = await db.sequelize.transaction(async (transaction) => {
      const lockedFile = await File.findByPk(file.id, { transaction, lock: transaction.LOCK.UPDATE });
      const lockedVersion = await Version.findByPk(version.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedVersion || lockedVersion.status !== 'uploading') throw Object.assign(new Error('Загрузка версии уже завершена'), { status: 409 });
      if (lockedFile.currentVersionId !== lockedVersion.baseVersionId || lockedFile.deletedAt || forcePersonalConflict) {
        const conflictFileId = crypto.randomUUID();
        const conflictName = conflictCopyName(lockedFile.name, req.user, lockedVersion.id);
        const lockedFolder = await Folder.findByPk(lockedFile.folderId, { transaction, lock: transaction.LOCK.UPDATE });
        let conflictFolderId = lockedFile.folderId;
        if (!lockedFolder || lockedFolder.deletedAt || forcePersonalConflict) {
          const [personalRoot] = await Folder.findOrCreate({
            where: { ownerId: req.user.id, parentId: null, kind: 'personal', deletedAt: null },
            defaults: { name: 'Мои файлы', ownerId: req.user.id, kind: 'personal' },
            transaction,
          });
          conflictFolderId = personalRoot.id;
        }
        const conflictFile = await File.create({
          id: conflictFileId,
          folderId: conflictFolderId,
          ownerId: req.user.id,
          name: conflictName,
          objectKey: lockedVersion.objectKey,
          contentType: lockedVersion.contentType,
          size: lockedVersion.size,
          etag,
          currentVersionId: lockedVersion.id,
          versionNumber: 1,
          conflictOfFileId: lockedFile.id,
          conflictBaseVersionId: lockedVersion.baseVersionId,
          status: 'ready',
          scanStatus,
          scanResult,
          scanAttempts: 0,
          scannedAt,
        }, { transaction });
        await lockedVersion.update({
          fileId: conflictFile.id,
          versionNumber: 1,
          name: conflictName,
          source: 'conflict_copy',
          status: 'ready',
          etag,
          scanStatus,
          scanResult,
          scannedAt,
        }, { transaction });
        return { conflict: true, file: conflictFile, original: lockedFile, version: lockedVersion };
      }
      const latestNumber = Number(await Version.max('versionNumber', {
        where: { fileId: lockedFile.id, status: 'ready' },
        transaction,
      })) || 0;
      const nextNumber = latestNumber + 1;
      await lockedVersion.update({
        name: lockedFile.name,
        versionNumber: nextNumber,
        status: 'ready',
        etag,
        scanStatus,
        scanResult,
        scannedAt,
      }, { transaction });
      await lockedFile.update({
        objectKey: lockedVersion.objectKey,
        contentType: lockedVersion.contentType,
        size: lockedVersion.size,
        etag,
        currentVersionId: lockedVersion.id,
        versionNumber: nextNumber,
        scanStatus,
        scanResult,
        scanAttempts: 0,
        scannedAt,
      }, { transaction });
      return { conflict: false, file: lockedFile, version: lockedVersion };
    });
    uploadedObjectKey = null;
    if (completion.conflict) {
      audit(req.user, 'conflict_copy', 'file', completion.file, {
        originalFileId: file.id,
        baseVersionId: version.baseVersionId,
        serverVersionId: file.currentVersionId,
      });
      return res.status(201).json({
        conflict: true,
        code: 'FILE_VERSION_CONFLICT_COPY_CREATED',
        message: 'Файл изменил другой пользователь. Ваша версия сохранена отдельной конфликтной копией.',
        file: {
          id: completion.file.id,
          name: completion.file.name,
          folderId: completion.file.folderId,
          ownerId: completion.file.ownerId,
          contentType: completion.file.contentType,
          size: completion.file.size,
          etag: completion.file.etag,
          currentVersionId: completion.version.id,
          versionNumber: 1,
          scanStatus: completion.file.scanStatus,
          conflictOfFileId: completion.file.conflictOfFileId,
          conflictBaseVersionId: completion.file.conflictBaseVersionId,
        },
        original: {
          id: completion.original.id,
          name: completion.original.name,
          folderId: completion.original.folderId,
          currentVersionId: completion.original.currentVersionId,
          versionNumber: completion.original.versionNumber,
          scanStatus: completion.original.scanStatus,
          deletedAt: completion.original.deletedAt,
        },
      });
    }
    audit(req.user, 'version_upload', 'file', file, { versionNumber: completion.version.versionNumber, size: Number(completion.version.size) });
    return res.json({ conflict: false, id: completion.version.id, versionNumber: completion.version.versionNumber });
  } catch (error) {
    if (uploadedObjectKey && error.status === 409) {
      await Promise.all([
        s3.deleteObject(uploadedObjectKey).catch(() => {}),
        Version.destroy({ where: { id: req.params.versionId, status: 'uploading' } }).catch(() => {}),
      ]);
    }
    next(error);
  }
};

const downloadVersion = async (req, res, next) => {
  try {
    const { version } = await getVersionForAccess(req.params.fileId, req.params.versionId, req.user);
    if (!['clean', 'skipped'].includes(version.scanStatus)) return res.status(423).json({ error: 'Эта версия заблокирована антивирусной проверкой' });
    res.json({ url: await s3.createDownloadUrl({ objectKey: version.objectKey, fileName: version.name }) });
  } catch (error) { next(error); }
};

const openVersion = async (req, res, next) => {
  try {
    const { version } = await getVersionForAccess(req.params.fileId, req.params.versionId, req.user);
    if (!['clean', 'skipped'].includes(version.scanStatus)) return res.status(423).json({ error: 'Эта версия заблокирована антивирусной проверкой' });
    res.json({ url: await s3.createViewUrl({ objectKey: version.objectKey }) });
  } catch (error) { next(error); }
};

const restoreVersion = async (req, res, next) => {
  let destinationKey = null;
  try {
    const { file, version } = await getVersionForAccess(req.params.fileId, req.params.versionId, req.user, { write: true });
    if (!['clean', 'skipped'].includes(version.scanStatus)) return res.status(423).json({ error: 'Заблокированную версию нельзя восстановить' });
    if (version.id === file.currentVersionId) return res.status(409).json({ error: 'Эта версия уже является текущей' });
    const versionId = crypto.randomUUID();
    destinationKey = `users/${file.ownerId}/${file.id}/versions/${versionId}/original`;
    const copied = await s3.copyObject({ sourceKey: version.objectKey, destinationKey, contentType: version.contentType });
    const restored = await db.sequelize.transaction(async (transaction) => {
      const lockedFile = await File.findByPk(file.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (lockedFile.currentVersionId !== file.currentVersionId) throw Object.assign(new Error('Файл уже изменён другим пользователем. Обновите историю версий и повторите восстановление.'), { status: 409 });
      const latestNumber = Number(await Version.max('versionNumber', { where: { fileId: file.id }, transaction })) || 0;
      const nextNumber = latestNumber + 1;
      const created = await Version.create({
        id: versionId,
        fileId: lockedFile.id,
        baseVersionId: lockedFile.currentVersionId,
        versionNumber: nextNumber,
        objectKey: destinationKey,
        authorId: req.user.id,
        name: lockedFile.name,
        contentType: version.contentType,
        size: version.size,
        etag: String(copied.CopyObjectResult?.ETag || version.etag || '').replaceAll('"', '') || null,
        source: 'restore',
        status: 'ready',
        scanStatus: version.scanStatus,
        scanResult: version.scanResult,
        scannedAt: version.scannedAt,
      }, { transaction });
      await lockedFile.update({
        objectKey: destinationKey,
        contentType: version.contentType,
        size: version.size,
        etag: created.etag,
        currentVersionId: created.id,
        versionNumber: nextNumber,
        scanStatus: version.scanStatus,
        scanResult: version.scanResult,
        scannedAt: version.scannedAt,
        scanAttempts: 0,
      }, { transaction });
      return created;
    });
    audit(req.user, 'version_restore', 'file', file, { restoredFromVersionId: version.id, versionNumber: restored.versionNumber });
    res.status(201).json({ id: restored.id, versionNumber: restored.versionNumber });
  } catch (error) {
    if (destinationKey) await s3.deleteObject(destinationKey).catch(() => {});
    next(error);
  }
};

const sendToChat = async (req, res, next) => {
  try {
    const { file } = await accessibleFile(req.params.fileId, req.user);
    const kind = String(req.body.kind || '').trim().toLowerCase();
    const targetId = Number(req.body.chatId);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Некорректный чат' });
    if (!['room', 'boss'].includes(kind)) return res.status(400).json({ error: 'Отправка файлов из проводника пока доступна для внутренних чатов' });

    const mime = String(file.contentType || '').toLowerCase();
    const type = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file';
    const payload = {
      content: '', type, mediaUrl: createMediaPath(file.id), fileName: file.name,
      fileSize: file.size, userId: req.user.id, createdAt: new Date(),
    };
    let message;
    if (kind === 'room') {
      await ensureRoomAllowsMessage(targetId, req.user.id);
      message = await db.RoomMessage.create({ ...payload, roomId: targetId });
      message.setDataValue('User', { id: req.user.id, name: req.user.name || req.user.username || null });
      getIO()?.to(`room-${targetId}`).emit('newRoomMessage', message);
    } else {
      const chat = await db.BossChat.findByPk(targetId, { attributes: ['id'] });
      if (!chat) return res.status(404).json({ error: 'Чат не найден' });
      const membership = await db.BossChatUsers.count({ where: { chatId: targetId, userId: req.user.id } });
      if (!membership) throw forbidden('Этот чат вам недоступен');
      message = await db.BossMessage.create({ ...payload, chatId: targetId });
      message.setDataValue('User', { id: req.user.id, name: req.user.name || req.user.username || null });
      getIO()?.to(`chat-${targetId}`).emit('newBossChatMessage', message);
    }
    audit(req.user, 'send_to_chat', 'file', file, { kind, chatId: targetId });
    res.status(201).json(message);
  } catch (error) { next(error); }
};

const rescan = async (req, res, next) => {
  try {
    const file = await File.findOne({ where: { id: req.params.fileId, status: 'ready', deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    await accessibleFolder(file.folderId, req.user, { write: true });
    if (file.scanStatus === 'infected') return res.status(409).json({ error: 'Заражённый объект уже удалён из хранилища' });
    if (file.scanStatus === 'clean') return res.status(409).json({ error: 'Файл уже успешно проверен' });
    await file.update({ scanStatus: 'pending', scanResult: null, scanAttempts: 0, scannedAt: null });
    audit(req.user, 'virus_rescan', 'file', file);
    res.json(file);
  } catch (error) { next(error); }
};

module.exports = {
  media, root, list, createFolder, getFolderAccess, updateFolderAccess,
  startUpload, uploadContent, completeUpload, download, downloadContent, open, preview, remove, removeMany,
  renameFolder, renameFile, move, removeFolder, trash, restoreTrash, purgeTrash,
  purgeTrashFiles, destinations, search, auditLog, sendToChat, rescan,
  fileVersions, downloadVersion, openVersion, restoreVersion,
  startVersionUpload, uploadVersionContent, completeVersionUpload,
};
