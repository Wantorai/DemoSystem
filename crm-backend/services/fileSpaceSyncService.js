const { Op } = require('sequelize');
const db = require('../models');

const Folder = db.FileSpaceFolder;
const File = db.FileSpaceFile;
const FolderRole = db.FileSpaceFolderRole;
const Event = db.FileSpaceSyncEvent;

const parseIdSet = (raw, fallback = '') => new Set(
  String(raw || fallback).split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)
);
const ADMIN_ROLE_IDS = new Set([
  ...parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, '1'),
  ...parseIdSet(process.env.ADMIN_ROLE_IDS, '2'),
]);
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, '');
const isAdmin = (user) => ADMIN_ROLE_IDS.has(Number(user?.roleId)) || SUPER_ADMIN_USER_IDS.has(Number(user?.id));
const retentionDays = () => Math.max(Number(process.env.FILESPACE_SYNC_EVENT_RETENTION_DAYS || 90), 1);
const supportsNamedPersonalRoots = (version) => {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 0 || minor > 1 || (minor === 1 && patch >= 1);
};

const ensurePersonalRoot = (userId) => Folder.findOrCreate({
  where: { ownerId: userId, parentId: null, kind: 'personal', deletedAt: null },
  defaults: { name: 'Мои файлы', ownerId: userId, kind: 'personal' },
}).then(([folder]) => folder);

const getAccessibleRoots = async (user, { namedPersonalRoots = false } = {}) => {
  await ensurePersonalRoot(user.id);
  const admin = isAdmin(user);
  let roots;
  if (admin) {
    roots = await Folder.findAll({
      where: { parentId: null, deletedAt: null },
      order: [['kind', 'ASC'], ['name', 'ASC']],
    });
  } else {
    const grants = await FolderRole.findAll({ where: { roleId: user.roleId }, attributes: ['folderId'], raw: true });
    roots = await Folder.findAll({
      where: {
        parentId: null,
        deletedAt: null,
        [Op.or]: [
          { kind: 'personal', ownerId: user.id },
          { kind: 'shared', allRolesAccess: true },
          { kind: 'shared', id: { [Op.in]: grants.map((grant) => grant.folderId) } },
        ],
      },
      order: [['kind', 'ASC'], ['name', 'ASC']],
    });
  }
  const personalOwnerIds = [...new Set(
    roots
      .filter((root) => root.kind === 'personal')
      .map((root) => Number(root.ownerId))
      .filter(Number.isInteger)
  )];
  const owners = personalOwnerIds.length
    ? await db.User.findAll({
      where: { id: { [Op.in]: personalOwnerIds } },
      attributes: ['id', 'name'],
      raw: true,
    })
    : [];
  const ownerNames = new Map(owners.map((owner) => [Number(owner.id), owner.name]));

  return roots
    .map((root) => {
      const ownPersonalRoot = root.kind === 'personal' && Number(root.ownerId) === Number(user.id);
      const displayName = namedPersonalRoots && root.kind === 'personal'
        ? (ownPersonalRoot ? 'Мои файлы' : ownerNames.get(Number(root.ownerId)) || `Сотрудник #${root.ownerId}`)
        : root.name;
      return {
        id: root.id,
        name: displayName,
        kind: root.kind,
        ownerId: root.ownerId,
        ownerName: root.kind === 'personal' ? ownerNames.get(Number(root.ownerId)) || null : null,
        canWrite: admin || ownPersonalRoot,
        updatedAt: root.updatedAt,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
};

const accessibleTree = async (user, options) => {
  const roots = await getAccessibleRoots(user, options);
  const allowedRootIds = new Set(roots.map((root) => root.id));
  const allFolders = await Folder.findAll({ where: { deletedAt: null }, order: [['id', 'ASC']], raw: true });
  const byId = new Map(allFolders.map((folder) => [folder.id, folder]));
  const rootCache = new Map();
  const findRootId = (folder) => {
    if (!folder) return null;
    if (rootCache.has(folder.id)) return rootCache.get(folder.id);
    const visited = [];
    let current = folder;
    for (let depth = 0; current && depth < 100; depth += 1) {
      visited.push(current.id);
      if (!current.parentId) {
        visited.forEach((id) => rootCache.set(id, current.id));
        return current.id;
      }
      current = byId.get(current.parentId);
    }
    visited.forEach((id) => rootCache.set(id, null));
    return null;
  };
  const folders = allFolders
    .map((folder) => ({ ...folder, rootFolderId: findRootId(folder) }))
    .filter((folder) => allowedRootIds.has(folder.rootFolderId));
  return { roots, folders, folderIds: folders.map((folder) => folder.id) };
};

const serializeFolder = (folder) => ({
  type: 'folder',
  id: folder.id,
  rootFolderId: folder.rootFolderId,
  parentId: folder.parentId,
  ownerId: folder.ownerId,
  name: folder.name,
  kind: folder.kind,
  updatedAt: folder.updatedAt,
});

const serializeFile = (file, rootByFolder) => ({
  type: 'file',
  id: file.id,
  rootFolderId: rootByFolder.get(file.folderId) || null,
  folderId: file.folderId,
  ownerId: file.ownerId,
  name: file.name,
  contentType: file.contentType,
  size: file.size,
  etag: file.etag,
  currentVersionId: file.currentVersionId,
  versionNumber: file.versionNumber,
  conflictOfFileId: file.conflictOfFileId,
  conflictBaseVersionId: file.conflictBaseVersionId,
  scanStatus: file.scanStatus,
  available: ['clean', 'skipped'].includes(file.scanStatus),
  updatedAt: file.updatedAt,
});

const decodeSnapshotCursor = (value) => {
  if (!value) return '';
  try {
    const decoded = Buffer.from(String(value), 'base64url').toString('utf8');
    return /^[01]:[0-9a-f-]{36}$/i.test(decoded) ? decoded : '';
  } catch (_) {
    return '';
  }
};
const encodeSnapshotCursor = (value) => Buffer.from(value).toString('base64url');
const normalizeSequence = (value) => {
  const sequence = String(value ?? '');
  return /^\d{1,19}$/.test(sequence) && BigInt(sequence) <= 9223372036854775807n ? sequence : null;
};

const latestEventSequence = async () => String(await Event.max('sequence') || '0');

const createSnapshotPage = async (user, {
  cursor, limit = 500, eventCursor, clientVersion,
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const tree = await accessibleTree(user, {
    namedPersonalRoots: supportsNamedPersonalRoots(clientVersion),
  });
  const rootByFolder = new Map(tree.folders.map((folder) => [folder.id, folder.rootFolderId]));
  const files = tree.folderIds.length
    ? await File.findAll({
      where: { folderId: { [Op.in]: tree.folderIds }, status: 'ready', deletedAt: null },
      order: [['id', 'ASC']],
      raw: true,
    })
    : [];
  const items = [
    ...tree.folders.map((folder) => ({ key: `0:${folder.id}`, value: serializeFolder(folder) })),
    ...files.map((file) => ({ key: `1:${file.id}`, value: serializeFile(file, rootByFolder) })),
  ].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const after = decodeSnapshotCursor(cursor);
  const remaining = after ? items.filter((item) => item.key > after) : items;
  const page = remaining.slice(0, safeLimit);
  const hasMore = remaining.length > page.length;
  const latestCursor = await latestEventSequence();
  const requestedEventCursor = normalizeSequence(eventCursor);
  const stableEventCursor = requestedEventCursor && BigInt(requestedEventCursor) <= BigInt(latestCursor)
    ? requestedEventCursor
    : latestCursor;
  return {
    roots: tree.roots,
    items: page.map((item) => item.value),
    nextCursor: hasMore && page.length ? encodeSnapshotCursor(page.at(-1).key) : null,
    hasMore,
    eventCursor: stableEventCursor,
  };
};

const normalizeEvent = (event) => ({
  sequence: String(event.sequence),
  eventType: event.eventType,
  entityType: event.entityType,
  entityId: event.entityId,
  rootFolderId: event.rootFolderId,
  folderId: event.folderId,
  versionId: event.versionId,
  payload: event.payload,
  createdAt: event.createdAt,
});

const getChanges = async (user, { cursor = '0', limit = 500, clientVersion } = {}) => {
  const safeCursor = normalizeSequence(cursor) || '0';
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const [roots, minimum, latest] = await Promise.all([
    getAccessibleRoots(user, {
      namedPersonalRoots: supportsNamedPersonalRoots(clientVersion),
    }),
    Event.min('sequence'),
    Event.max('sequence'),
  ]);
  const minimumCursor = String(minimum || '0');
  const latestCursor = String(latest || '0');
  const cursorValue = BigInt(safeCursor);
  const resetRequired = safeCursor !== '0' && (
    (!minimum && cursorValue > 0n)
    || (minimum && cursorValue < BigInt(minimumCursor) - 1n)
    || cursorValue > BigInt(latestCursor)
  );
  if (resetRequired) {
    return {
      roots, events: [], nextCursor: latestCursor, latestCursor,
      hasMore: false, resetRequired: true, retentionDays: retentionDays(),
    };
  }
  const rows = await Event.findAll({
    where: { sequence: { [Op.gt]: safeCursor } },
    order: [['sequence', 'ASC']],
    limit: safeLimit + 1,
  });
  const scanned = rows.slice(0, safeLimit);
  const allowedRootIds = new Set(roots.map((root) => root.id));
  const visible = scanned.filter((event) => event.rootFolderId && allowedRootIds.has(event.rootFolderId));
  const nextCursor = scanned.length ? String(scanned.at(-1).sequence) : latestCursor;
  return {
    roots,
    events: visible.map(normalizeEvent),
    nextCursor,
    latestCursor,
    hasMore: rows.length > safeLimit,
    resetRequired: false,
    retentionDays: retentionDays(),
  };
};

module.exports = {
  createSnapshotPage,
  getChanges,
  retentionDays,
  supportsNamedPersonalRoots,
};
