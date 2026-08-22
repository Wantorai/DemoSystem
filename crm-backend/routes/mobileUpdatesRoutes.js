'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { recordMobileUpdateRequest } = require('../services/mobileDiagnosticsRuntime');

const router = express.Router();
const updatesRoot = path.resolve(
  process.env.MOBILE_UPDATES_ROOT ||
    (process.platform === 'win32'
      ? path.join(__dirname, '..', 'mobile-updates')
      : '/home/nodeapp/mobile-updates')
);
const manifestCache = new Map();

const safeSegment = (value) => {
  const normalized = String(value || '').trim();
  return /^[a-zA-Z0-9._-]+$/.test(normalized) ? normalized : null;
};

const toBase64Url = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const sha256 = (buffer) => toBase64Url(crypto.createHash('sha256').update(buffer).digest());
const md5 = (buffer) => crypto.createHash('md5').update(buffer).digest('hex');
const hashHex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const hashToUuid = (value) =>
  `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;

const contentTypeForExtension = (extension, launchAsset = false) => {
  if (launchAsset) return 'application/javascript';
  const ext = String(extension || '').toLowerCase();
  const types = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    json: 'application/json',
  };
  return types[ext] || 'application/octet-stream';
};

const resolveInside = (root, relativePath) => {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(root, normalized);
  const rootWithSeparator = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(rootWithSeparator)) return null;
  return resolved;
};

const readCurrentRelease = async (appKey, runtimeVersion) => {
  const runtimeRoot = path.join(updatesRoot, appKey, runtimeVersion);
  const currentPath = path.join(runtimeRoot, 'current.json');
  const current = JSON.parse(await fsPromises.readFile(currentPath, 'utf8'));
  const releaseId = safeSegment(current?.releaseId);
  if (!releaseId) throw new Error('Invalid current release');
  const releaseRoot = path.join(runtimeRoot, releaseId);
  return { releaseId, releaseRoot };
};

const publicBaseUrl = (req) => {
  const configured = String(process.env.MOBILE_UPDATES_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const host = String(req.get('host') || '');
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const protocol = isLocalHost ? forwardedProto || req.protocol || 'http' : 'https';
  return `${protocol}://${host}`;
};

const setManifestHeaders = (res) => {
  res.set('expo-protocol-version', '1');
  res.set('expo-sfv-version', '0');
  res.set('expo-manifest-filters', '');
  res.set('expo-server-defined-headers', '');
  res.set('cache-control', 'private, max-age=0');
};

const createAssetDescriptor = async ({
  req,
  appKey,
  runtimeVersion,
  releaseId,
  releaseRoot,
  relativePath,
  extension,
  launchAsset,
}) => {
  const absolutePath = resolveInside(releaseRoot, relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    throw new Error(`Missing update asset: ${relativePath}`);
  }
  const data = await fsPromises.readFile(absolutePath);
  const encodedPath = String(relativePath)
    .replace(/\\/g, '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return {
    hash: sha256(data),
    key: md5(data),
    ...(launchAsset ? {} : { fileExtension: `.${extension}` }),
    contentType: contentTypeForExtension(extension, launchAsset),
    url: `${publicBaseUrl(req)}/api/mobile-updates/${encodeURIComponent(appKey)}/${encodeURIComponent(runtimeVersion)}/${encodeURIComponent(releaseId)}/assets/${encodedPath}`,
  };
};

const buildManifest = async (req, appKey, runtimeVersion, platform, releaseId, releaseRoot) => {
  const metadataPath = path.join(releaseRoot, 'metadata.json');
  const expoConfigPath = path.join(releaseRoot, 'expoConfig.json');
  const releaseInfoPath = path.join(releaseRoot, 'release.json');
  const [metadataBuffer, expoConfigBuffer] = await Promise.all([
    fsPromises.readFile(metadataPath),
    fsPromises.readFile(expoConfigPath),
  ]);
  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  const expoConfig = JSON.parse(expoConfigBuffer.toString('utf8'));
  let releaseInfo = {};
  try {
    releaseInfo = JSON.parse(await fsPromises.readFile(releaseInfoPath, 'utf8'));
  } catch {}

  const platformMetadata = metadata?.fileMetadata?.[platform];
  if (!platformMetadata?.bundle) throw new Error(`No ${platform} bundle in release`);
  const assets = [];
  const seenPaths = new Set();
  for (const asset of platformMetadata.assets || []) {
    const relativePath = String(asset?.path || '').replace(/\\/g, '/');
    if (!relativePath || seenPaths.has(relativePath)) continue;
    seenPaths.add(relativePath);
    assets.push(await createAssetDescriptor({
      req,
      appKey,
      runtimeVersion,
      releaseId,
      releaseRoot,
      relativePath,
      extension: asset.ext,
      launchAsset: false,
    }));
  }

  const idSource = Buffer.from(`${hashHex(metadataBuffer)}:${releaseId}:${platform}`);
  return {
    id: hashToUuid(hashHex(idSource)),
    createdAt: releaseInfo.createdAt || new Date((await fsPromises.stat(metadataPath)).mtimeMs).toISOString(),
    runtimeVersion,
    launchAsset: await createAssetDescriptor({
      req,
      appKey,
      runtimeVersion,
      releaseId,
      releaseRoot,
      relativePath: String(platformMetadata.bundle).replace(/\\/g, '/'),
      extension: null,
      launchAsset: true,
    }),
    assets,
    metadata: {
      updateMessage: releaseInfo.message || '',
      releaseId,
    },
    extra: {
      expoClient: expoConfig,
    },
  };
};

router.get('/mobile-updates/:appKey', async (req, res) => {
  let requestInfo = {
    type: 'manifest',
    appKey: req.params.appKey,
    runtimeVersion: req.get('expo-runtime-version') || req.query.runtimeVersion,
    platform: req.get('expo-platform') || req.query.platform,
    userAgent: req.get('user-agent') || '',
    ip: req.ip || req.socket?.remoteAddress || '',
  };
  try {
    const appKey = safeSegment(req.params.appKey);
    const platform = safeSegment(req.get('expo-platform') || req.query.platform);
    const runtimeVersion = safeSegment(req.get('expo-runtime-version') || req.query.runtimeVersion);
    if (!appKey || !runtimeVersion || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid appKey, platform or runtimeVersion' });
    }

    const { releaseId, releaseRoot } = await readCurrentRelease(appKey, runtimeVersion);
    const cacheKey = `${appKey}:${runtimeVersion}:${platform}:${releaseId}:${publicBaseUrl(req)}`;
    let manifest = manifestCache.get(cacheKey);
    if (!manifest) {
      manifest = await buildManifest(req, appKey, runtimeVersion, platform, releaseId, releaseRoot);
      manifestCache.clear();
      manifestCache.set(cacheKey, manifest);
    }

    if (req.get('expo-protocol-version') === '1' && req.get('expo-current-update-id') === manifest.id) {
      setManifestHeaders(res);
      recordMobileUpdateRequest({ ...requestInfo, appKey, runtimeVersion, platform, releaseId, statusCode: 204 });
      return res.status(204).end();
    }

    setManifestHeaders(res);
    res.type('application/expo+json');
    recordMobileUpdateRequest({ ...requestInfo, appKey, runtimeVersion, platform, releaseId, statusCode: 200 });
    return res.json(manifest);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      recordMobileUpdateRequest({ ...requestInfo, statusCode: 404 });
      return res.status(404).json({ error: 'No compatible update published' });
    }
    console.error('[mobile-updates] manifest failed:', error);
    recordMobileUpdateRequest({ ...requestInfo, statusCode: 500 });
    return res.status(500).json({ error: 'Unable to create update manifest' });
  }
});

router.get('/mobile-updates/:appKey/:runtimeVersion/:releaseId/assets/*', async (req, res) => {
  let requestInfo = {
    type: 'asset',
    appKey: req.params.appKey,
    runtimeVersion: req.params.runtimeVersion,
    releaseId: req.params.releaseId,
    platform: req.query.platform || '',
    userAgent: req.get('user-agent') || '',
    ip: req.ip || req.socket?.remoteAddress || '',
  };
  try {
    const appKey = safeSegment(req.params.appKey);
    const runtimeVersion = safeSegment(req.params.runtimeVersion);
    const releaseId = safeSegment(req.params.releaseId);
    if (!appKey || !runtimeVersion || !releaseId) {
      recordMobileUpdateRequest({ ...requestInfo, statusCode: 400 });
      return res.status(400).end();
    }

    const releaseRoot = path.join(updatesRoot, appKey, runtimeVersion, releaseId);
    const relativePath = decodeURIComponent(String(req.params[0] || ''));
    const absolutePath = resolveInside(releaseRoot, relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      recordMobileUpdateRequest({ ...requestInfo, appKey, runtimeVersion, releaseId, statusCode: 404 });
      return res.status(404).end();
    }

    const extension = path.extname(relativePath).replace('.', '');
    const launchAsset = relativePath.includes('/static/js/') || relativePath.endsWith('.hbc');
    res.set('cache-control', 'public, max-age=31536000, immutable');
    res.type(contentTypeForExtension(extension, launchAsset));
    recordMobileUpdateRequest({ ...requestInfo, appKey, runtimeVersion, releaseId, statusCode: 200 });
    return res.sendFile(absolutePath);
  } catch (error) {
    console.error('[mobile-updates] asset failed:', error);
    recordMobileUpdateRequest({ ...requestInfo, statusCode: 500 });
    return res.status(500).end();
  }
});

module.exports = router;
