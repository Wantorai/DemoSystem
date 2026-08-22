const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

const compareVersions = (left, right) => {
  if (!VERSION_PATTERN.test(String(left)) || !VERSION_PATTERN.test(String(right))) return 0;
  const leftParts = String(left).split('.').map(Number);
  const rightParts = String(right).split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
};

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
};

class UpdateService {
  constructor({ currentVersion, downloadsDir, getApiClient, onState = () => {} }) {
    this.currentVersion = currentVersion;
    this.downloadsDir = downloadsDir;
    this.getApiClient = getApiClient;
    this.onState = onState;
    this.state = {
      available: false,
      version: '',
      size: 0,
      sha256: '',
      checking: false,
      downloading: false,
      progress: null,
      error: '',
    };
  }

  publicState() {
    return { ...this.state };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.publicState());
  }

  clear() {
    this.setState({
      available: false,
      version: '',
      size: 0,
      sha256: '',
      checking: false,
      downloading: false,
      progress: null,
      error: '',
    });
  }

  async check() {
    if (this.state.checking || this.state.downloading) return this.publicState();
    const api = this.getApiClient();
    if (!api) {
      this.clear();
      return this.publicState();
    }
    this.setState({ checking: true, error: '' });
    try {
      const metadata = await api.request('/filespace-desktop/version');
      const version = String(metadata?.version || '');
      const sha256 = String(metadata?.sha256 || '').toLowerCase();
      const available = metadata?.available === true
        && compareVersions(version, this.currentVersion) > 0
        && /^[a-f0-9]{64}$/.test(sha256);
      this.setState({
        available,
        version: available ? version : '',
        size: available ? Number(metadata.size || 0) : 0,
        sha256: available ? sha256 : '',
        progress: null,
        error: '',
      });
      return this.publicState();
    } finally {
      this.setState({ checking: false });
    }
  }

  async download() {
    if (!this.state.available || this.state.downloading) return null;
    const api = this.getApiClient();
    if (!api) throw new Error('Для скачивания обновления необходимо войти в CRM');
    const version = this.state.version;
    const expectedHash = this.state.sha256;
    const destination = path.join(this.downloadsDir, `OrderSpace-FileSpace-Setup-${version}.exe`);
    this.setState({ downloading: true, progress: 0, error: '' });
    try {
      let lastProgress = 0;
      await api.downloadAuthenticated('/filespace-desktop/download', destination, {
        onProgress: ({ percent }) => {
          if (percent === lastProgress) return;
          lastProgress = percent;
          this.setState({ progress: percent });
        },
      });
      const actualHash = await sha256File(destination);
      if (actualHash.toLowerCase() !== expectedHash) {
        await fs.promises.unlink(destination).catch(() => {});
        throw new Error('Проверка целостности обновления не пройдена');
      }
      this.setState({ progress: 100 });
      return destination;
    } catch (error) {
      this.setState({ error: error.message, progress: null });
      throw error;
    } finally {
      this.setState({ downloading: false });
    }
  }
}

module.exports = { UpdateService, compareVersions, sha256File };
