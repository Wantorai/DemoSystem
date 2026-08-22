const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { version: clientVersion } = require('../package.json');

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class ApiConnectionError extends Error {
  constructor(error) {
    const code = error?.cause?.code || error?.code || '';
    super(`Нет соединения с сервером${code ? ` (${code})` : ''}`);
    this.name = 'ApiConnectionError';
    this.code = code;
    this.cause = error;
    this.transient = true;
  }
}

class StorageConnectionError extends Error {
  constructor(operation, error) {
    const code = error?.cause?.code || error?.code || '';
    super(`Нет соединения с файловым хранилищем при ${operation}${code ? ` (${code})` : ''}`);
    this.name = 'StorageConnectionError';
    this.code = code;
    this.cause = error;
    this.transient = true;
  }
}

const normalizeApiUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const contentTypeForPath = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain',
    '.csv': 'text/csv', '.json': 'application/json', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  })[extension] || 'application/octet-stream';
};

class ApiClient {
  constructor(apiUrl, token = '', { fetchImpl = globalThis.fetch } = {}) {
    this.apiUrl = normalizeApiUrl(apiUrl);
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async request(endpoint, options = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
        ...options,
        signal: options.signal || AbortSignal.timeout(30_000),
        headers: {
          ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'X-FileSpace-Client-Version': clientVersion,
          ...options.headers,
        },
      });
    } catch (error) {
      throw new ApiConnectionError(error);
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data?.error || data?.message || `Ошибка сервера ${response.status}`, response.status, data);
    return data;
  }

  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async uploadToSignedUrl(url, filePath, headers) {
    const stats = await fs.promises.stat(filePath);
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Length': String(stats.size) },
        body: fs.createReadStream(filePath),
        duplex: 'half',
        signal: AbortSignal.timeout(15 * 60_000),
      });
    } catch (error) {
      throw new StorageConnectionError('загрузке файла', error);
    }
    if (!response.ok) throw new ApiError(`Хранилище отклонило загрузку (${response.status})`, response.status, null);
  }

  async uploadAuthenticated(endpoint, filePath, headers = {}) {
    const stats = await fs.promises.stat(filePath);
    let response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
        method: 'PUT',
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'X-FileSpace-Client-Version': clientVersion,
          ...headers,
          'Content-Length': String(stats.size),
        },
        body: fs.createReadStream(filePath),
        duplex: 'half',
        signal: AbortSignal.timeout(15 * 60_000),
      });
    } catch (error) {
      throw new ApiConnectionError(error);
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data?.error || `Сервер отклонил загрузку (${response.status})`, response.status, data);
    }
  }

  async downloadSignedUrl(url, destination) {
    let response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15 * 60_000) });
    } catch (error) {
      throw new StorageConnectionError('скачивании файла', error);
    }
    if (!response.ok || !response.body) throw new ApiError(`Хранилище отклонило скачивание (${response.status})`, response.status, null);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.orderspace-download-${process.pid}`;
    try {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      if (error instanceof ApiError) throw error;
      throw new StorageConnectionError('скачивании файла', error);
    }
  }

  async downloadAuthenticated(endpoint, destination, { onProgress } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'X-FileSpace-Client-Version': clientVersion,
        },
      });
    } catch (error) {
      throw new ApiConnectionError(error);
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data?.error || `Не удалось скачать обновление (${response.status})`, response.status, data);
    }

    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.download`;
    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        onProgress?.({ received, total, percent: total ? Math.min(100, Math.round((received / total) * 100)) : null });
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(temporary));
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
    return { received, total };
  }
}

module.exports = {
  ApiClient,
  ApiError,
  ApiConnectionError,
  StorageConnectionError,
  normalizeApiUrl,
  contentTypeForPath,
};
