// routes/version.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();
const BUILDS_DIR = process.env.BUILDS_DIR;



function tokenizeVersionName(name) {
  return String(name)
    .toLowerCase()
    .match(/[a-z]+|\d+/g) || [];
}

function compareFolderNamesDesc(a, b) {
  const aa = tokenizeVersionName(a);
  const bb = tokenizeVersionName(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const pa = aa[i];
    const pb = bb[i];
    if (pa === undefined) return 1;
    if (pb === undefined) return -1;
    const na = /^\d+$/.test(pa);
    const nb = /^\d+$/.test(pb);
    if (na && nb) {
      const va = Number(pa);
      const vb = Number(pb);
      if (va !== vb) return vb - va;
      continue;
    }
    if (pa !== pb) return pb.localeCompare(pa);
  }
  return 0;
}

/**
 * Возвращает имя директории с последней версией.
 * Приоритет: 1) сортировка по имени версии, 2) по времени изменения.
 */
async function getLatestBuildFolder(dir) {
  // читаем содержимое директории и фильтруем только папки
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory()).map(e => e.name);
  if (folders.length === 0) return null;

  // собираем время (предпочитаем birthtime, если нет — mtime)
  const stats = await Promise.all(
    folders.map(async (name) => {
      const p = path.join(dir, name);
      const st = await fs.stat(p);
      // some filesystems don't provide birthtime, используем mtime как запасной вариант
      const time = (st.birthtimeMs && st.birthtimeMs > 0) ? st.birthtimeMs : st.mtimeMs;
      return { name, time };
    })
  );

  // В приоритете папки, похожие на имена билдов (например build0403-1).
  // Это исключает выбор старых numeric-папок, если они лежат рядом.
  const buildLike = stats.filter(s => /^build/i.test(String(s.name)));
  const target = buildLike.length > 0 ? buildLike : stats;

  // Сначала пытаемся определить "последнюю" версию по имени папки (например build0403-1 < build0503-1).
  // Если имя одинаково/неопределимо — используем время.
  target.sort((a, b) => {
    const byName = compareFolderNamesDesc(a.name, b.name);
    if (byName !== 0) return byName;
    return b.time - a.time;
  });
  return target[0].name;
}

router.get('/api/app-version', async (req, res) => {
  try {
    const latest = await getLatestBuildFolder(BUILDS_DIR);
    if (!latest) {
      return res.status(404).json({ error: 'No build folders found' });
    }

    // console.log('[version] Detected latest build folder:', latest);

    // поддерживаем raw/plain text ответ (для простого скачивания/встраивания)
    const wantRaw = req.query.raw === '1' || (req.get('accept') || '').includes('text/plain');
    if (wantRaw) {
      return res.type('text/plain').send(latest);
    }
    // console.log('[version] Latest build folder:', latest);
    return res.json({ version: latest });
  } catch (err) {
    console.error('[version] Error reading builds dir', BUILDS_DIR, err);
    return res.status(500).json({ error: 'Server error' });
  }
});



module.exports = router;


// function isDir(p) {
//   try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
// }

// router.get('/api/app-version', (req, res) => {
//   try {
//     const entries = fs.readdirSync(BUILDS_DIR);
//     // отфильтровать только директории, допустимые имена
//     const versions = entries
//       .filter(name => isDir(path.join(BUILDS_DIR, name)) && /^[0-9A-Za-z._-]+$/.test(name));

//     if (versions.length === 0) return res.json({ version: null });

//     // если версии в формате числа — выбираем максимальную числовую; иначе просто сортируем лексикографически
//     const numericVersions = versions.filter(v => /^\d+$/.test(v));
//     let latest;
//     if (numericVersions.length > 0) {
//       latest = numericVersions.map(v => parseInt(v, 10)).sort((a,b) => b-a)[0].toString();
//     } else {
//       latest = versions.sort().pop();
//     }

//     return res.json({ version: latest });
//   } catch (e) {
//     console.error('Ошибка чтения builds dir', e);
//     return res.status(500).json({ error: 'cannot read builds dir' });
//   }
// });
