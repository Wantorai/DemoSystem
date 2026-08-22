const fs = require('fs');
const path = require('path');

const EMPTY_SYNC_STATE = Object.freeze({
  initialized: false,
  cursor: '0',
  roots: {},
  folders: {},
  files: {},
  updatedAt: null,
});

class JsonStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  async load() {
    try {
      const content = await fs.promises.readFile(this.filePath, 'utf8');
      return { ...structuredClone(this.defaults), ...JSON.parse(content) };
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[desktop:store] read failed', this.filePath, error.message);
      return structuredClone(this.defaults);
    }
  }

  async save(value) {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.promises.rename(temporary, this.filePath);
  }
}

const createStores = (userDataPath) => ({
  settings: new JsonStore(path.join(userDataPath, 'settings.json'), {
    apiUrl: 'https://orderspace.ru/api',
    syncPath: '',
    encryptedToken: '',
    user: null,
    autoStart: false,
    lastNotifiedVersion: '',
  }),
  syncState: new JsonStore(path.join(userDataPath, 'sync-state.json'), EMPTY_SYNC_STATE),
});

module.exports = { JsonStore, EMPTY_SYNC_STATE, createStores };
