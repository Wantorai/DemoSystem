const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { ApiClient, contentTypeForPath } = require('./apiClient');
const { EMPTY_SYNC_STATE } = require('./stateStore');
const { safeJoin, relativeKey, uniqueSegment, isInside } = require('./pathUtils');

const POLL_INTERVAL_MS = 10_000;
const WATCH_DEBOUNCE_MS = 1_500;
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

const isAuthenticationError = (error) => [401, 403].includes(Number(error?.status));
const isTransientRemoteError = (error) => Boolean(
  error?.transient
  || Number(error?.status) === 408
  || Number(error?.status) === 429
  || Number(error?.status) >= 500
);

const fingerprint = async (filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile() ? { size: stats.size, mtimeMs: Math.round(stats.mtimeMs) } : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const sameFingerprint = (left, right) => Boolean(
  left && right && Number(left.size) === Number(right.size) && Math.abs(Number(left.mtimeMs) - Number(right.mtimeMs)) < 2
);

class SyncEngine extends EventEmitter {
  constructor({ syncStateStore, trashPath }) {
    super();
    this.syncStateStore = syncStateStore;
    this.trashPath = trashPath;
    this.state = structuredClone(EMPTY_SYNC_STATE);
    this.api = null;
    this.syncPath = '';
    this.running = false;
    this.busy = false;
    this.watcher = null;
    this.pollTimer = null;
    this.reconcileTimer = null;
    this.needsSnapshot = false;
    this.connectionError = '';
    this.remoteFailureCount = 0;
  }

  status(extra = {}) {
    this.emit('status', {
      running: this.running,
      busy: this.busy,
      initialized: this.state.initialized,
      cursor: this.state.cursor,
      roots: Object.keys(this.state.roots || {}).length,
      files: Object.keys(this.state.files || {}).length,
      error: this.connectionError,
      ...extra,
    });
  }

  log(message, level = 'info') {
    this.emit('log', { message, level, createdAt: new Date().toISOString() });
  }

  async configure({ apiUrl, token, syncPath }) {
    this.api = new ApiClient(apiUrl, token);
    this.syncPath = path.resolve(syncPath);
    this.state = await this.syncStateStore.load();
  }

  async resetState() {
    this.state = structuredClone(EMPTY_SYNC_STATE);
    await this.saveState();
  }

  async saveState() {
    this.state.updatedAt = new Date().toISOString();
    await this.syncStateStore.save(this.state);
  }

  async start() {
    if (this.running) return;
    if (!this.api || !this.syncPath) throw new Error('Клиент синхронизации не настроен');
    await fs.promises.mkdir(this.syncPath, { recursive: true });
    this.connectionError = '';
    this.remoteFailureCount = 0;
    this.running = true;
    this.status();
    try {
      if (!this.state.initialized) await this.fullSnapshot();
      else await this.syncNow({ trackConnection: false });
      this.startWatcher();
      this.markConnectionHealthy();
      this.schedulePoll();
      this.log('Синхронизация запущена');
    } catch (error) {
      if (isTransientRemoteError(error)) {
        if (this.state.initialized) this.startWatcher();
        this.markConnectionFailure(error);
        this.schedulePoll();
        return;
      }
      this.running = false;
      this.connectionError = error.message;
      this.status();
      throw error;
    }
  }

  stop({ preserveError = false } = {}) {
    this.running = false;
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.pollTimer);
    clearTimeout(this.reconcileTimer);
    this.pollTimer = null;
    this.reconcileTimer = null;
    if (!preserveError) {
      this.connectionError = '';
      this.remoteFailureCount = 0;
    }
    this.status();
  }

  retryDelay() {
    if (!this.remoteFailureCount) return POLL_INTERVAL_MS;
    return RETRY_DELAYS_MS[Math.min(this.remoteFailureCount - 1, RETRY_DELAYS_MS.length - 1)];
  }

  markConnectionFailure(error) {
    const firstFailure = this.remoteFailureCount === 0;
    this.remoteFailureCount += 1;
    this.connectionError = error.message || 'Нет соединения с сервером';
    if (firstFailure) this.log(`${this.connectionError}. Повторяем автоматически.`, 'warning');
    this.status();
  }

  markConnectionHealthy() {
    const recovered = this.remoteFailureCount > 0;
    this.remoteFailureCount = 0;
    this.connectionError = '';
    if (recovered) this.log('Соединение с сервером восстановлено');
    this.status();
  }

  schedulePoll(delay = this.retryDelay()) {
    clearTimeout(this.pollTimer);
    if (!this.running) return;
    this.pollTimer = setTimeout(async () => {
      if (this.busy) {
        this.schedulePoll();
        return;
      }
      try {
        if (!this.state.initialized) await this.fullSnapshot();
        else if (this.remoteFailureCount) await this.syncNow({ trackConnection: false });
        else await this.pullChanges();
        if (!this.watcher) this.startWatcher();
        this.markConnectionHealthy();
      } catch (error) {
        if (isAuthenticationError(error)) {
          this.connectionError = 'Сеанс завершён. Войдите в CRM заново.';
          this.log(this.connectionError, 'error');
          this.stop({ preserveError: true });
          this.status({ error: this.connectionError });
          return;
        }
        if (isTransientRemoteError(error)) this.markConnectionFailure(error);
        else {
          this.connectionError = error.message;
          this.log(`Ошибка синхронизации: ${error.message}`, 'error');
          this.status();
        }
      } finally {
        if (this.running) this.schedulePoll();
      }
    }, delay);
  }

  resumeAfterWake() {
    if (!this.running) return;
    this.schedulePoll(5_000);
  }

  suspendForSleep() {
    clearTimeout(this.pollTimer);
    clearTimeout(this.reconcileTimer);
    this.pollTimer = null;
    this.reconcileTimer = null;
  }

  startWatcher() {
    this.watcher?.close();
    this.watcher = fs.watch(this.syncPath, { recursive: true }, (_eventType, filename) => {
      if (!filename || !this.running || this.busy || String(filename).includes('.orderspace-download-')) return;
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = setTimeout(() => this.reconcileLocal().catch((error) => {
        if (isTransientRemoteError(error)) {
          this.markConnectionFailure(error);
          this.schedulePoll();
        } else {
          this.log(`Ошибка локальной синхронизации: ${error.message}`, 'error');
          this.connectionError = error.message;
          this.status();
        }
      }), WATCH_DEBOUNCE_MS);
    });
    this.watcher.on('error', (error) => this.log(`Наблюдение за папкой остановлено: ${error.message}`, 'error'));
  }

  async runExclusive(label, operation) {
    if (this.busy) return false;
    this.busy = true;
    this.status({ activity: label });
    try {
      await operation();
      return true;
    } finally {
      this.busy = false;
      this.status({ activity: '' });
    }
  }

  async syncNow({ trackConnection = true } = {}) {
    try {
      const result = await this.runExclusive('Синхронизация…', async () => {
        await this.reconcileLocalInternal();
        if (this.needsSnapshot) {
          this.needsSnapshot = false;
          await this.fullSnapshotInternal();
        } else {
          await this.pullChangesInternal();
        }
      });
      if (trackConnection) this.markConnectionHealthy();
      return result;
    } catch (error) {
      if (trackConnection && isTransientRemoteError(error)) {
        this.markConnectionFailure(error);
        this.schedulePoll();
      }
      throw error;
    }
  }

  rootsSignature(roots) {
    return roots.map((root) => `${root.id}:${root.name}:${root.canWrite}`).sort().join('|');
  }

  localFileSegment(name, fileId, folderId) {
    const occupied = new Set();
    for (const folder of Object.values(this.state.folders || {})) {
      if (folder.parentId === folderId) {
        occupied.add(path.basename(folder.relativePath).toLocaleLowerCase('ru'));
      }
    }
    for (const file of Object.values(this.state.files || {})) {
      if (file.id !== fileId && file.folderId === folderId) {
        occupied.add(path.basename(file.relativePath).toLocaleLowerCase('ru'));
      }
    }
    return uniqueSegment(name, fileId, occupied);
  }

  async fullSnapshot() {
    return this.runExclusive('Первичная синхронизация…', () => this.fullSnapshotInternal());
  }

  async fullSnapshotInternal() {
    const previous = this.state;
    const allItems = [];
    let cursor = null;
    let eventCursor = null;
    let roots = [];
    do {
      const query = new URLSearchParams({ limit: '500' });
      if (cursor) query.set('cursor', cursor);
      if (eventCursor) query.set('eventCursor', eventCursor);
      const page = await this.api.request(`/filespace/sync/snapshot?${query}`);
      if (!eventCursor) eventCursor = page.eventCursor;
      roots = page.roots;
      allItems.push(...page.items);
      cursor = page.nextCursor;
      this.status({ activity: `Получено объектов: ${allItems.length}` });
    } while (cursor);

    const nextState = this.buildSnapshotState(roots, allItems, eventCursor);
    await this.materializeSnapshot(nextState, previous);
    this.state = nextState;
    this.state.initialized = true;
    await this.saveState();
    this.log(`Первичная синхронизация завершена: ${Object.keys(this.state.files).length} файлов`);
  }

  buildSnapshotState(roots, items, eventCursor) {
    const next = {
      initialized: false,
      cursor: String(eventCursor || '0'),
      roots: {},
      folders: {},
      files: {},
      updatedAt: null,
    };
    const folderItems = new Map(items.filter((item) => item.type === 'folder').map((item) => [item.id, item]));
    const rootNames = new Set();
    for (const root of roots) {
      const localName = uniqueSegment(root.name, root.id, rootNames);
      next.roots[root.id] = { ...root, localName };
    }
    const siblingNames = new Map();
    const resolveFolder = (folderId, visiting = new Set()) => {
      if (next.folders[folderId]) return next.folders[folderId];
      const item = folderItems.get(folderId);
      if (!item || visiting.has(folderId)) return null;
      const root = next.roots[item.rootFolderId];
      if (!root) return null;
      if (!item.parentId) {
        const record = { ...item, relativePath: root.localName };
        next.folders[item.id] = record;
        return record;
      }
      const parent = resolveFolder(item.parentId, new Set(visiting).add(folderId));
      if (!parent) return null;
      if (!siblingNames.has(parent.id)) siblingNames.set(parent.id, new Set());
      const segment = uniqueSegment(item.name, item.id, siblingNames.get(parent.id));
      const record = { ...item, relativePath: relativeKey(path.join(parent.relativePath, segment)) };
      next.folders[item.id] = record;
      return record;
    };
    folderItems.forEach((_item, id) => resolveFolder(id));

    const fileNames = new Map();
    for (const item of items.filter((value) => value.type === 'file')) {
      const parent = next.folders[item.folderId];
      if (!parent) continue;
      if (!fileNames.has(parent.id)) {
        const occupied = siblingNames.get(parent.id) || new Set();
        fileNames.set(parent.id, new Set(occupied));
      }
      const segment = uniqueSegment(item.name, item.id, fileNames.get(parent.id));
      next.files[item.id] = {
        ...item,
        relativePath: relativeKey(path.join(parent.relativePath, segment)),
        local: null,
        localVersionId: null,
      };
    }
    return next;
  }

  async materializeSnapshot(next, previous) {
    const oldRoots = previous.roots || {};
    for (const [rootId, root] of Object.entries(oldRoots)) {
      if (!next.roots[rootId]) await this.trashRelative(root.localName);
    }
    await this.relocateRoots(next.roots, oldRoots);
    const orderedFolders = Object.values(next.folders).sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length);
    for (const folder of orderedFolders) {
      const previousFolder = previous.folders?.[folder.id];
      if (!previousFolder || previousFolder.relativePath === folder.relativePath) continue;
      const oldPath = safeJoin(this.syncPath, previousFolder.relativePath);
      const target = safeJoin(this.syncPath, folder.relativePath);
      if (await this.pathExists(oldPath) && !await this.pathExists(target)) {
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.rename(oldPath, target);
      }
    }
    for (const folder of orderedFolders) {
      await fs.promises.mkdir(safeJoin(this.syncPath, folder.relativePath), { recursive: true });
    }

    let completed = 0;
    const nextIds = new Set(Object.keys(next.files));
    for (const old of Object.values(previous.files || {})) {
      if (!nextIds.has(old.id)) await this.trashRelative(old.relativePath);
    }
    for (const record of Object.values(next.files)) {
      const previousRecord = previous.files?.[record.id];
      const target = safeJoin(this.syncPath, record.relativePath);
      if (previousRecord?.relativePath && previousRecord.relativePath !== record.relativePath) {
        const oldPath = safeJoin(this.syncPath, previousRecord.relativePath);
        if (await fingerprint(oldPath)) {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.rename(oldPath, target).catch(() => {});
        }
      }
      const local = await fingerprint(target);
      const locallyModified = previousRecord?.local && local && !sameFingerprint(local, previousRecord.local);
      if (locallyModified && previousRecord.localVersionId === record.currentVersionId) {
        record.local = previousRecord.local;
        record.localVersionId = previousRecord.localVersionId || previousRecord.currentVersionId;
      } else if (locallyModified) {
        await this.preserveCollision(target);
        if (record.available) await this.downloadFile(record, target);
      } else if (previousRecord && local && previousRecord.localVersionId === record.currentVersionId) {
        record.local = local;
        record.localVersionId = previousRecord.localVersionId || record.currentVersionId;
      } else if (record.available) {
        if (local && !previousRecord) await this.preserveCollision(target);
        await this.downloadFile(record, target);
      } else if (previousRecord && local) {
        record.local = local;
        record.localVersionId = previousRecord.localVersionId || previousRecord.currentVersionId;
      }
      completed += 1;
      if (completed % 10 === 0) this.status({ activity: `Скачано файлов: ${completed} из ${Object.keys(next.files).length}` });
    }
  }

  async relocateRoots(nextRoots, previousRoots) {
    const moves = [];
    for (const [rootId, root] of Object.entries(nextRoots || {})) {
      const previous = previousRoots?.[rootId];
      if (!previous?.localName || previous.localName === root.localName) continue;
      const source = safeJoin(this.syncPath, previous.localName);
      if (!await this.pathExists(source)) continue;
      const staged = safeJoin(this.syncPath, `.orderspace-root-${rootId}`);
      if (await this.pathExists(staged)) {
        throw new Error(`Не удалось переименовать папку «${previous.localName}»: временный путь уже существует`);
      }
      await fs.promises.rename(source, staged);
      moves.push({ rootId, staged, target: safeJoin(this.syncPath, root.localName), name: root.localName });
    }

    for (const move of moves) {
      if (await this.pathExists(move.target)) {
        const extension = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
        await fs.promises.rename(move.target, `${move.target} (локальная копия ${extension})`);
        this.log(`Сохранена локальная папка, конфликтующая с «${move.name}»`, 'warning');
      }
      await fs.promises.rename(move.staged, move.target);
      this.log(`Папка синхронизации переименована в «${move.name}»`);
    }
  }

  async preserveCollision(filePath) {
    const extension = path.extname(filePath);
    const base = extension ? filePath.slice(0, -extension.length) : filePath;
    const suffix = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
    await fs.promises.rename(filePath, `${base} (локальная копия ${suffix})${extension}`);
  }

  async downloadFile(record, target = safeJoin(this.syncPath, record.relativePath)) {
    const { url } = await this.api.request(`/filespace/files/${record.id}/download`);
    try {
      await this.api.downloadSignedUrl(url, target);
    } catch (error) {
      if (error?.name !== 'StorageConnectionError') throw error;
      this.log(`Прямое подключение к хранилищу недоступно. Скачиваем «${record.name}» через OrderSpace.`, 'warning');
      await this.api.downloadAuthenticated(`/filespace/files/${record.id}/content`, target);
    }
    record.local = await fingerprint(target);
    record.localVersionId = record.currentVersionId;
  }

  async pullChanges() {
    if (!this.running || this.busy) return;
    return this.runExclusive('Получение изменений…', () => this.pullChangesInternal());
  }

  async pullChangesInternal() {
    let hasMore;
    do {
      const changes = await this.api.request(`/filespace/sync/changes?cursor=${encodeURIComponent(this.state.cursor || '0')}&limit=500`);
      if (changes.resetRequired || this.rootsSignature(changes.roots) !== this.rootsSignature(Object.values(this.state.roots || {}))) {
        await this.fullSnapshotInternal();
        return;
      }
      if (changes.events.some((event) => event.entityType === 'folder')) {
        await this.fullSnapshotInternal();
        return;
      }
      for (const event of changes.events) await this.applyFileEvent(event);
      if (this.needsSnapshot) {
        this.needsSnapshot = false;
        await this.fullSnapshotInternal();
        return;
      }
      this.state.cursor = changes.nextCursor;
      await this.saveState();
      hasMore = changes.hasMore;
    } while (hasMore);
  }

  async applyFileEvent(event) {
    const existing = this.state.files[event.entityId];
    if (['delete', 'purge'].includes(event.eventType)) {
      if (existing) await this.trashRelative(existing.relativePath);
      delete this.state.files[event.entityId];
      return;
    }
    const payload = event.payload || {};
    const parent = this.state.folders[payload.folderId || event.folderId];
    if (!parent) return;
    const record = {
      ...existing,
      ...payload,
      type: 'file',
      id: event.entityId,
      rootFolderId: event.rootFolderId,
      folderId: payload.folderId || event.folderId,
      currentVersionId: payload.currentVersionId || event.versionId,
      available: ['clean', 'skipped'].includes(payload.scanStatus),
    };
    const targetSegment = this.localFileSegment(
      payload.name || existing?.name || 'Файл',
      event.entityId,
      record.folderId,
    );
    record.relativePath = relativeKey(path.join(parent.relativePath, targetSegment));
    const oldPath = existing?.relativePath ? safeJoin(this.syncPath, existing.relativePath) : null;
    const target = safeJoin(this.syncPath, record.relativePath);

    if (existing && oldPath && oldPath !== target && await fingerprint(oldPath)) {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (await fingerprint(target)) await this.preserveCollision(target);
      await fs.promises.rename(oldPath, target);
    }
    const local = await fingerprint(target);
    if (existing && local && !sameFingerprint(local, existing.local) && existing.localVersionId !== record.currentVersionId) {
      if (await this.uploadVersion(existing, target)) return;
    }
    if (record.available && (!existing || existing.localVersionId !== record.currentVersionId || !await fingerprint(target))) {
      await this.downloadFile(record, target);
    } else {
      record.local = await fingerprint(target);
    }
    if (record.scanStatus === 'infected') {
      await this.trashAbsolute(target);
      record.local = null;
      record.localVersionId = null;
    }
    this.state.files[record.id] = record;
  }

  async reconcileLocal() {
    if (!this.running || this.busy) return;
    return this.runExclusive('Отправка локальных изменений…', async () => {
      await this.reconcileLocalInternal();
      if (this.needsSnapshot) {
        this.needsSnapshot = false;
        await this.fullSnapshotInternal();
      } else {
        await this.pullChangesInternal();
      }
    });
  }

  async scanLocal() {
    const directories = new Map();
    const files = new Map();
    const walk = async (absolute, relative = '') => {
      const entries = await fs.promises.readdir(absolute, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.includes('.orderspace-download-')) continue;
        const nextRelative = relativeKey(path.join(relative, entry.name));
        const nextAbsolute = safeJoin(this.syncPath, nextRelative);
        if (entry.isDirectory()) {
          directories.set(nextRelative, true);
          await walk(nextAbsolute, nextRelative);
        } else if (entry.isFile()) {
          files.set(nextRelative, await fingerprint(nextAbsolute));
        }
      }
    };
    await walk(this.syncPath);
    return { directories, files };
  }

  async reconcileLocalInternal() {
    const scanned = await this.scanLocal();
    const folderByPath = new Map(Object.values(this.state.folders).map((folder) => [relativeKey(folder.relativePath).toLocaleLowerCase('ru'), folder]));
    const fileByPath = new Map(Object.values(this.state.files).map((file) => [relativeKey(file.relativePath).toLocaleLowerCase('ru'), file]));

    const newDirectories = [...scanned.directories.keys()]
      .filter((relative) => !folderByPath.has(relative.toLocaleLowerCase('ru')))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    for (const relative of newDirectories) {
      const parentPath = relativeKey(path.dirname(relative)) === '.' ? '' : relativeKey(path.dirname(relative));
      const parent = folderByPath.get(parentPath.toLocaleLowerCase('ru'));
      if (!parent) continue;
      const created = await this.api.request('/filespace/folders', {
        method: 'POST',
        body: JSON.stringify({ parentId: parent.id, name: path.basename(relative) }),
      });
      const record = { ...created, rootFolderId: parent.rootFolderId, relativePath: relative };
      this.state.folders[record.id] = record;
      folderByPath.set(relative.toLocaleLowerCase('ru'), record);
    }

    const missingFiles = Object.values(this.state.files).filter((file) => file.local && !scanned.files.has(relativeKey(file.relativePath)));
    const newFilePaths = [...scanned.files.keys()].filter((relative) => !fileByPath.has(relative.toLocaleLowerCase('ru')));
    for (const missing of [...missingFiles]) {
      const match = newFilePaths.find((relative) => sameFingerprint(scanned.files.get(relative), missing.local));
      if (!match) continue;
      await this.renameOrMoveFile(missing, match, folderByPath);
      newFilePaths.splice(newFilePaths.indexOf(match), 1);
      missingFiles.splice(missingFiles.indexOf(missing), 1);
    }

    for (const missing of missingFiles) {
      await this.api.request(`/filespace/files/${missing.id}`, { method: 'DELETE' }).catch((error) => {
        if (error.status !== 404) throw error;
      });
      delete this.state.files[missing.id];
    }
    for (const relative of newFilePaths) {
      const parentPath = relativeKey(path.dirname(relative)) === '.' ? '' : relativeKey(path.dirname(relative));
      const parent = folderByPath.get(parentPath.toLocaleLowerCase('ru'));
      if (parent) await this.uploadNewFile(relative, parent);
    }
    for (const record of Object.values(this.state.files)) {
      const current = scanned.files.get(relativeKey(record.relativePath));
      if (current && record.local && !sameFingerprint(current, record.local)) {
        if (await this.uploadVersion(record, safeJoin(this.syncPath, record.relativePath))) break;
      }
    }

    const rootFolderIds = new Set(Object.keys(this.state.roots));
    const missingFolders = Object.values(this.state.folders)
      .filter((folder) => !rootFolderIds.has(folder.id) && !scanned.directories.has(relativeKey(folder.relativePath)))
      .sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length);
    const missingFolderIds = new Set(missingFolders.map((folder) => folder.id));
    for (const folder of missingFolders.filter((value) => !missingFolderIds.has(value.parentId))) {
      await this.api.request(`/filespace/folders/${folder.id}`, { method: 'DELETE' }).catch((error) => {
        if (error.status !== 404) throw error;
      });
      Object.values(this.state.folders).filter((item) => item.relativePath === folder.relativePath || item.relativePath.startsWith(`${folder.relativePath}/`))
        .forEach((item) => delete this.state.folders[item.id]);
    }
    await this.saveState();
  }

  async renameOrMoveFile(record, nextRelative, folderByPath) {
    const parentPath = relativeKey(path.dirname(nextRelative)) === '.' ? '' : relativeKey(path.dirname(nextRelative));
    const destination = folderByPath.get(parentPath.toLocaleLowerCase('ru'));
    if (!destination) return;
    if (record.folderId !== destination.id) {
      await this.api.request('/filespace/move', {
        method: 'POST',
        body: JSON.stringify({ type: 'file', ids: [record.id], destinationFolderId: destination.id }),
      });
    }
    const nextName = path.basename(nextRelative);
    if (record.name !== nextName) {
      await this.api.request(`/filespace/files/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
    }
    record.folderId = destination.id;
    record.name = nextName;
    record.relativePath = nextRelative;
    record.local = await fingerprint(safeJoin(this.syncPath, nextRelative));
  }

  async uploadNewFile(relative, parent) {
    const absolute = safeJoin(this.syncPath, relative);
    const stats = await fs.promises.stat(absolute);
    if (!stats.isFile() || stats.size === 0) return;
    const contentType = contentTypeForPath(absolute);
    const started = await this.api.request('/filespace/uploads', {
      method: 'POST',
      body: JSON.stringify({ folderId: parent.id, name: path.basename(relative), size: stats.size, contentType }),
    });
    try {
      await this.api.uploadToSignedUrl(started.uploadUrl, absolute, started.headers);
    } catch (error) {
      if (error?.name !== 'StorageConnectionError') throw error;
      this.log(`Прямое подключение к хранилищу недоступно. Загружаем «${path.basename(relative)}» через OrderSpace.`, 'warning');
      await this.api.uploadAuthenticated(`/filespace/uploads/${started.file.id}/content`, absolute, started.headers);
    }
    const completed = await this.api.request(`/filespace/uploads/${started.file.id}/complete`, { method: 'POST' });
    this.state.files[completed.id] = {
      ...completed,
      rootFolderId: parent.rootFolderId,
      relativePath: relative,
      available: ['clean', 'skipped'].includes(completed.scanStatus),
      local: await fingerprint(absolute),
      localVersionId: completed.currentVersionId,
    };
    this.log(`Загружен новый файл «${path.basename(relative)}»`);
  }

  async uploadVersion(record, absolute) {
    const stats = await fs.promises.stat(absolute);
    if (!stats.isFile() || stats.size === 0) return;
    const started = await this.api.request(`/filespace/files/${record.id}/versions/initiate`, {
      method: 'POST',
      body: JSON.stringify({
        baseVersionId: record.localVersionId || record.currentVersionId,
        sourceName: path.basename(absolute),
        size: stats.size,
        contentType: contentTypeForPath(absolute),
      }),
    });
    try {
      await this.api.uploadToSignedUrl(started.uploadUrl, absolute, started.headers);
    } catch (error) {
      if (error?.name !== 'StorageConnectionError') throw error;
      this.log(`Прямое подключение к хранилищу недоступно. Загружаем новую версию «${record.name}» через OrderSpace.`, 'warning');
      await this.api.uploadAuthenticated(
        `/filespace/files/${record.id}/versions/${started.version.id}/content`,
        absolute,
        started.headers,
      );
    }
    const completed = await this.api.request(`/filespace/files/${record.id}/versions/${started.version.id}/complete`, { method: 'POST' });
    if (completed.conflict) {
      const parent = this.state.folders[completed.file.folderId];
      if (parent) {
        const nextRelative = relativeKey(path.join(
          parent.relativePath,
          this.localFileSegment(completed.file.name, completed.file.id, completed.file.folderId),
        ));
        const nextAbsolute = safeJoin(this.syncPath, nextRelative);
        await fs.promises.mkdir(path.dirname(nextAbsolute), { recursive: true });
        if (absolute !== nextAbsolute) await fs.promises.rename(absolute, nextAbsolute);
        this.state.files[completed.file.id] = {
          ...completed.file,
          rootFolderId: parent.rootFolderId,
          relativePath: nextRelative,
          available: ['clean', 'skipped'].includes(completed.file.scanStatus),
          local: await fingerprint(nextAbsolute),
          localVersionId: completed.file.currentVersionId,
        };
      }
      this.log(`Создана конфликтная копия «${completed.file.name}»`, 'warning');
      await this.saveState();
      this.needsSnapshot = true;
      return true;
    }
    record.currentVersionId = completed.id;
    record.versionNumber = completed.versionNumber;
    record.local = await fingerprint(absolute);
    record.localVersionId = completed.id;
    this.log(`Загружена новая версия «${record.name}»`);
    return false;
  }

  async pathExists(target) {
    try {
      await fs.promises.access(target);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async trashRelative(relative) {
    if (!relative) return;
    return this.trashAbsolute(safeJoin(this.syncPath, relative));
  }

  async trashAbsolute(absolute) {
    if (!isInside(this.syncPath, absolute) || path.resolve(absolute) === this.syncPath) return;
    try {
      await fs.promises.access(absolute);
      await this.trashPath(absolute);
    } catch (error) {
      if (error.code !== 'ENOENT') this.log(`Не удалось переместить в корзину ${absolute}: ${error.message}`, 'error');
    }
  }
}

module.exports = {
  SyncEngine,
  fingerprint,
  sameFingerprint,
  isAuthenticationError,
  isTransientRemoteError,
};
