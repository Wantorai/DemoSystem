// routes/downloadApp.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BUILDS_DIR = '/home/nodeapp/crm-backend/builds'; // Папка с поддиректориями по версиям
const FILESPACE_DESKTOP_DIR = path.resolve(
  process.env.FILESPACE_DESKTOP_DIR || '/home/nodeapp/filespace-desktop/dist'
);
const FILESPACE_DESKTOP_VERSION = String(
  process.env.FILESPACE_DESKTOP_VERSION || '0.1.0'
).trim();

function isValidVersion(v) {
  // Разрешаем только цифры и точку/тире/буквы, если надо — поменяй регэксп
  return typeof v === 'string' && /^[0-9A-Za-z._-]+$/.test(v);
}

const desktopInstallerPath = () => path.resolve(
  FILESPACE_DESKTOP_DIR,
  `OrderSpace-FileSpace-Setup-${FILESPACE_DESKTOP_VERSION}.exe`
);

let desktopMetadataCache = null;

const getDesktopInstallerMetadata = async () => {
  if (!isValidVersion(FILESPACE_DESKTOP_VERSION)) return null;
  const installerPath = desktopInstallerPath();
  const relativePath = path.relative(FILESPACE_DESKTOP_DIR, installerPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  const stat = await fs.promises.stat(installerPath);
  if (!stat.isFile()) return null;
  if (
    desktopMetadataCache
    && desktopMetadataCache.size === stat.size
    && desktopMetadataCache.mtimeMs === stat.mtimeMs
  ) return desktopMetadataCache;

  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(installerPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  desktopMetadataCache = {
    version: FILESPACE_DESKTOP_VERSION,
    available: true,
    size: stat.size,
    sha256: hash.digest('hex'),
    mtimeMs: stat.mtimeMs,
  };
  return desktopMetadataCache;
};

router.get('/api/downloadApp', (req, res) => {
  // auth same as before
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Нет токена' });
  const token = authHeader.split(' ')[1];
  try { jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(403).json({ error: 'Недействительный токен' }); }

  const version = req.query.version;
  if (!version || !isValidVersion(version)) {
    return res.status(400).json({ error: 'Неверная версия' });
  }

  // безопасно собираем путь
  const appDir = path.join(BUILDS_DIR, version);
  const apkPath = path.join(appDir, 'app.apk');

  // защита от path traversal: убедимся, что appDir действительно внутри BUILDS_DIR
  if (!appDir.startsWith(path.resolve(BUILDS_DIR))) {
    return res.status(400).json({ error: 'Неправильный путь' });
  }

  if (!fs.existsSync(apkPath)) {
    console.error('Файл не найден:', apkPath);
    return res.status(404).json({ error: 'Файл не найден' });
  }

  const stat = fs.statSync(apkPath);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  // ставим имя файла с версией
  res.setHeader('Content-Disposition', `attachment; filename="app-${version}.apk"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length');

  const stream = fs.createReadStream(apkPath);
  stream.on('error', (err) => {
    console.error('Stream error:', err);
    if (!res.headersSent) res.status(500).end('Stream error');
  });
  stream.pipe(res);
});

router.get('/api/filespace-desktop/version', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const metadata = await getDesktopInstallerMetadata();
    res.json(metadata || { version: FILESPACE_DESKTOP_VERSION, available: false });
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[filespace-desktop] Ошибка метаданных установщика:', error);
    res.json({ version: FILESPACE_DESKTOP_VERSION, available: false });
  }
});

router.get('/api/filespace-desktop/download', auth, async (req, res) => {
  if (!isValidVersion(FILESPACE_DESKTOP_VERSION)) {
    return res.status(503).json({ error: 'Версия Windows-клиента настроена неверно' });
  }

  const fileName = `OrderSpace-FileSpace-Setup-${FILESPACE_DESKTOP_VERSION}.exe`;
  const installerPath = desktopInstallerPath();
  const relativePath = path.relative(FILESPACE_DESKTOP_DIR, installerPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return res.status(400).json({ error: 'Неправильный путь к установщику' });
  }

  let stat;
  try {
    stat = await fs.promises.stat(installerPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('[filespace-desktop] Файл не найден:', installerPath);
      return res.status(404).json({ error: 'Установщик Windows-клиента не найден' });
    }
    console.error('[filespace-desktop] Ошибка чтения установщика:', error);
    return res.status(500).json({ error: 'Не удалось подготовить установщик' });
  }

  if (!stat.isFile()) {
    return res.status(404).json({ error: 'Установщик Windows-клиента не найден' });
  }

  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');

  const stream = fs.createReadStream(installerPath);
  stream.on('error', (error) => {
    console.error('[filespace-desktop] Stream error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Ошибка скачивания установщика' });
    else res.destroy(error);
  });
  req.on('aborted', () => stream.destroy());
  stream.pipe(res);
});

module.exports = router;




// // routes/downloadApp.js (фрагмент)
// const fs = require('fs');
// const path = require('path');
// const express = require('express');
// const jwt = require('jsonwebtoken');

// const router = express.Router();
// const JWT_SECRET = process.env.JWT_SECRET;
// const APK_PATH = '/home/nodeapp/crm-backend/builds/app.apk';

// router.get('/api/downloadApp', (req, res) => {
//   // auth as before...
//   const authHeader = req.headers['authorization'];
//   if (!authHeader) return res.status(401).json({ error: 'Нет токена' });
//   const token = authHeader.split(' ')[1];
//   try { jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(403).json({ error: 'Недействительный токен' }); }

//   // check file
//   if (!fs.existsSync(APK_PATH)) {
//     console.error('Файл не найден:', APK_PATH);
//     return res.status(404).json({ error: 'Файл не найден' });
//   }

//   // get size and set headers
//   const stat = fs.statSync(APK_PATH);
//   res.setHeader('Content-Type', 'application/vnd.android.package-archive');
//   res.setHeader('Content-Disposition', 'attachment; filename="app.apk"');
//   res.setHeader('Content-Length', String(stat.size));
//   // Если фронт и бэк на разных доменах — сделать видимым заголовок:
//   res.setHeader('Access-Control-Expose-Headers', 'Content-Length');

//   // stream file
//   const stream = fs.createReadStream(APK_PATH);
//   stream.on('error', (err) => {
//     console.error('Stream error:', err);
//     if (!res.headersSent) res.status(500).end('Stream error');
//   });
//   stream.pipe(res);
// });

// module.exports = router;

// const express = require("express");
// const path = require("path");
// const jwt = require("jsonwebtoken");
// const fs = require("fs");

// const router = express.Router();
// const JWT_SECRET = process.env.JWT_SECRET;

// const APK_PATH = "/home/nodeapp/crm-backend/builds/app.apk";

// console.log("APK_PATH = ", APK_PATH);


// router.get("/api/downloadApp", (req, res) => {
//   const authHeader = req.headers["authorization"];
//   if (!authHeader) {
//     return res.status(401).json({ error: "Нет токена" });
//   }

//   const token = authHeader.split(" ")[1];
//   try {
//     jwt.verify(token, JWT_SECRET);
//   } catch (err) {
//     console.error("JWT ошибка:", err.message);
//     return res.status(403).json({ error: "Недействительный токен" });
//   }

//   // проверим существует ли файл
//   if (!fs.existsSync(APK_PATH)) {
//     console.error("Файл не найден:", APK_PATH);
//     return res.status(404).json({ error: "Файл не найден" });
//   }

//   res.download(APK_PATH, "app.apk", (err) => {
//     if (err) {
//       console.error("Ошибка при скачивании:", err);
//       res.status(500).json({ error: "Не удалось скачать файл" });
//     }
//   });
// });

// module.exports = router;
