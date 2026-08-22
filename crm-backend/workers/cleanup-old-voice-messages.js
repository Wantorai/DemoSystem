// workers/cleanup-old-voice-messages.js
require('dotenv').config();
const { createPoolFromEnv } = require('../config/db-config');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

const pool = createPoolFromEnv();
const CLEANUP_SCOPE = String(process.env.CLEANUP_SCOPE || 'voice').toLowerCase();

// Папки
const AUDIO_DIR = path.resolve(__dirname, '..', 'uploads', 'audio');
const VIDEO_DIR = path.resolve(__dirname, '..', 'uploads', 'videos');
const DOCS_DIR = path.resolve(__dirname, '..', 'uploads', 'docs');
const FILES_DIR = path.resolve(__dirname, '..', 'uploads', 'files');
const IMAGES_DIR = path.resolve(__dirname, '..', 'uploads', 'images');
const OTHERS_DIR = path.resolve(__dirname, '..', 'uploads', 'others');
const DEFAULT_BASE_DIRS = [AUDIO_DIR, VIDEO_DIR, DOCS_DIR, FILES_DIR, IMAGES_DIR, OTHERS_DIR];

// Парсим аргументы: --dry (тогда не удаляем), --age "2 months"
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry') || process.env.CLEANUP_DRY_RUN === 'true';
const DO_RUN = !DRY; // если dry=true => DO_RUN=false
let AGE_INTERVAL = process.env.CLEANUP_AGE_INTERVAL || '2 months';
const ai = argv.findIndex(a => a === '--age' || a === '--interval' || a === '-a');
if (ai >= 0 && argv[ai + 1]) AGE_INTERVAL = argv[ai + 1];

function parseAgeIntervalToMs(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(minute|minutes|min|hour|hours|day|days|month|months)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit.startsWith('min')) return n * 60 * 1000;
  if (unit.startsWith('hour')) return n * 60 * 60 * 1000;
  if (unit.startsWith('day')) return n * 24 * 60 * 60 * 1000;
  if (unit.startsWith('month')) return n * 30 * 24 * 60 * 60 * 1000;
  return null;
}

async function walkFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...await walkFiles(full));
      continue;
    }
    if (ent.isFile()) out.push(full);
  }
  return out;
}

//console.log('[cleanup] start', new Date().toISOString(), 'DRY=', DRY, 'AGE_INTERVAL=', AGE_INTERVAL);
//console.log('[cleanup] AUDIO_DIR=', AUDIO_DIR, 'VIDEO_DIR=', VIDEO_DIR);

const TABLES = [
  { schema: 'public', name: 'RoomMessages', idCol: 'id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
  { schema: 'public', name: 'boss_messages', idCol: 'id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
  { schema: 'public', name: 'chat_messages', idCol: '_id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
];

function qIdent(s) {
  if (!s) return s;
  if (/^[a-z0-9_]+$/.test(String(s))) return String(s);
  return `"${String(s).replace(/"/g, '""')}"`;
}
function qTable(t) { return `${qIdent(t.schema)}.${qIdent(t.name)}`; }
function qCol(c) { return qIdent(c); }

function extractFilename(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) {
    try { return path.basename(new URL(s).pathname); } catch(e) { /* fallthrough */ }
  }
  return s.split('?')[0].split('#')[0];
}

function normalizeCandidates(raw) {
  if (!raw) return [];
  const s = String(raw);
  const basename = path.basename(s);
  const noLeading = s.replace(/^\/+/, '');
  return [
    s,
    noLeading,
    basename,
    path.posix.join('uploads','audio', basename),
    path.posix.join('uploads','videos', basename),
    path.posix.join('uploads','docs', basename),
    path.posix.join('uploads','files', basename),
    path.posix.join('uploads','images', basename),
    path.posix.join('uploads','others', basename),
  ].filter(Boolean);
}

async function columnExists(client, schema, table, column) {
  const q = `
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    LIMIT 1
  `;
  const r = await client.query(q, [schema, table, column]);
  return r.rowCount > 0;
}

// isUsedAnywhere проверяет кандидат-строки по нескольким колонкам (fileCol и thumbnailCol если есть)
async function isUsedAnywhere(client, candidateStrings, tablesMeta, checkCols = ['mediaUrl', 'thumbnailUrl']) {
  if (!candidateStrings || candidateStrings.length === 0) return true;
  for (const t of tablesMeta) {
    const ti = qTable(t);
    const ors = [];
    const params = [];
    for (const c of candidateStrings) {
      for (const colName of checkCols) {
        // перед тем как строить условие нужно убедиться, что колонка существует — сделаем это динамически:
        // (мы не хотим кидать ошибку если колонки нет)
        params.push(c);
        ors.push(`${qCol(colName)} = $${params.length}`);
        ors.push(`${qCol(colName)} LIKE '%' || $${params.length}`);
      }
    }
    const q = `SELECT 1 FROM ${ti} WHERE (${ors.join(' OR ')}) LIMIT 1`;
    try {
      const r = await client.query(q, params);
      if (r.rowCount > 0) return true;
    } catch (err) {
      // таблица может не иметь тех колонок — в таком случае пропускаем
      continue;
    }
  }
  return false;
}

async function tryUnlinkWithDirs(rel, raw, baseDirs = [AUDIO_DIR, VIDEO_DIR]) {
  if (!rel) {
    const ex = extractFilename(raw);
    if (ex) rel = ex;
  }
  if (!rel) return { ok:false, tried: [] };

  const tried = [];
  const basename = path.basename(rel);

  // первое: пробуем baseDirs + rel (поддиректорию + rel)
  for (const base of baseDirs) {
    const p = path.join(base, rel);
    try {
      await fs.unlink(p);
      return { ok:true, path:p };
    } catch (err) {
      tried.push({ path:p, err: err.code || err.message });
      if (err.code === 'ENOENT') continue;
    }
  }

  // если rel абсолютный — пробуем
  if (path.isAbsolute(rel)) {
    try {
      await fs.unlink(rel);
      return { ok:true, path:rel };
    } catch (err) {
      tried.push({ path:rel, err: err.code || err.message });
    }
  }

  // пробуем basename в baseDirs
  for (const base of baseDirs) {
    const p = path.join(base, basename);
    try {
      await fs.unlink(p);
      return { ok:true, path:p };
    } catch (err) {
      tried.push({ path:p, err: err.code || err.message });
    }
  }

  return { ok:false, tried };
}

async function rowsToDelete(client, tbl, hasThumb) {
  const ti = qTable(tbl);
  const typePredicate = CLEANUP_SCOPE === 'uploads'
    ? `(
         COALESCE(${qCol('type')}::text, '') <> ''
      AND COALESCE(${qCol('type')}::text, '') NOT IN ('text')
    )`
    : `(
         COALESCE(${qCol('type')}::text, '') = 'audio'
      OR COALESCE(${qCol('type')}::text, '') ILIKE '%audio%'
      OR COALESCE(${qCol('type')}::text, '') ILIKE '%voice%'
      OR COALESCE(${qCol('type')}::text, '') ILIKE '%video%'
      OR ${qCol(tbl.fileCol)} ILIKE '%/uploads/audio/%'
      OR ${qCol(tbl.fileCol)} ILIKE 'uploads/audio/%'
      OR ${qCol(tbl.fileCol)} ~* '\\.(mp3|m4a|aac|amr|ogg|opus|wav|webm)(\\?.*)?$'
    )`;
  // соберём список колонок, которые нужно выбрать
  const extraThumb = hasThumb ? `, ${qCol('thumbnailUrl')} AS thumbnail_url` : '';
  const q = `
    SELECT ${qCol(tbl.idCol)}::text AS id_text,
           ${qCol(tbl.fileCol)} AS media_url,
           ${qCol(tbl.createdCol)} AS created,
           COALESCE(${qCol('type')}::text, '') AS msg_type
           ${extraThumb}
    FROM ${ti}
    WHERE (${qCol(tbl.fileCol)} IS NOT NULL AND ${qCol(tbl.fileCol)} <> '')
      AND (${qCol(tbl.createdCol)} < now() - interval '${AGE_INTERVAL}')
      AND ${typePredicate}
    ORDER BY ${qCol(tbl.createdCol)} ASC
    LIMIT 5000;
  `;
  const res = await client.query(q);
  return res.rows;
}

async function deleteRowsByIds(client, tbl, ids, hasThumb) {
  const ti = qTable(tbl);
  const extraThumb = hasThumb ? `, ${qCol('thumbnailUrl')} AS thumbnail_url` : '';
  const q = `
    DELETE FROM ${ti}
    WHERE ${qCol(tbl.idCol)}::text = ANY($1)
    RETURNING ${qCol(tbl.idCol)}::text AS id_text, ${qCol(tbl.fileCol)} AS media_url, COALESCE(${qCol('type')}::text,'') AS msg_type
    ${extraThumb};
  `;
  const res = await client.query(q, [ids]);
  return res.rows;
}

(async function main() {
  try {
    const tablesMeta = TABLES;
    let totalDeleted = 0;
    const filesMap = new Map(); // media_url -> { types:Set, thumbs:Set }
    const stats = {
      scope: CLEANUP_SCOPE,
      dryRun: DRY,
      ageInterval: AGE_INTERVAL,
      tableRowsMatched: 0,
      tableRowsDeleted: 0,
      filesConsidered: 0,
      filesDeleted: 0,
      filesSkippedStillUsed: 0,
      filesUnlinkFailed: 0,
      fsCandidatesScanned: 0,
      fsCandidatesOldEnough: 0,
      errors: 0,
    };
    const failures = [];

    for (const t of tablesMeta) {
      let client;
      try {
        client = await pool.connect();
        // проверим есть ли в таблице колонка thumbnailUrl
        const hasThumb = await columnExists(client, t.schema, t.name, 'thumbnailUrl');

        //console.log(`[${t.name}] has thumbnailUrl:`, hasThumb);

        // получаем строки, подходящие под удаление
        const rows = await rowsToDelete(client, t, hasThumb);
        stats.tableRowsMatched += rows.length;
        //console.log(`[${t.name}] matched rows:`, rows.length);
        if (!rows.length) continue;

        const ids = rows.map(r => String(r.id_text));

        if (DO_RUN) {
          const deleted = await deleteRowsByIds(client, t, ids, hasThumb);
          stats.tableRowsDeleted += deleted.length;
          //console.log(`[${t.name}] deleted rows:`, deleted.length);
          totalDeleted += deleted.length;

          for (const d of deleted) {
            const raw = d.media_url;
            const thumb = hasThumb ? d.thumbnail_url : null;
            const type = (d.msg_type || '').toLowerCase();
            if (!raw && !thumb) continue;
            if (raw) {
              if (!filesMap.has(raw)) filesMap.set(raw, { types: new Set(), thumbs: new Set() });
              filesMap.get(raw).types.add(type);
            }
            if (thumb) {
              // привяжем thumbnail как отдельный ключ too (чтобы удалять его)
              if (!filesMap.has(thumb)) filesMap.set(thumb, { types: new Set(), thumbs: new Set() });
              filesMap.get(thumb).thumbs.add(true); // mark as thumbnail
            }
          }
        } else {
          // DRY run: не удаляем, но отмечаем что бы показать
          for (const r of rows) {
            const raw = r.media_url;
            const thumb = hasThumb ? r.thumbnail_url : null;
            const type = (r.msg_type || '').toLowerCase();
            if (raw) {
              if (!filesMap.has(raw)) filesMap.set(raw, { types: new Set(), thumbs: new Set() });
              filesMap.get(raw).types.add(type);
            }
            if (thumb) {
              if (!filesMap.has(thumb)) filesMap.set(thumb, { types: new Set(), thumbs: new Set() });
              filesMap.get(thumb).thumbs.add(true);
            }
          }
          //console.log(`[${t.name}] (dry) would delete ids:`, ids.slice(0, 10));
        }
      } catch (err) {
        stats.errors += 1;
        console.error(`Error processing ${t.name}:`, err && err.message ? err.message : err);
      } finally {
        if (client) client.release();
      }
    }

    //console.log('Files considered:', filesMap.size);

    // Проверка и удаление файлов
    for (const [raw, meta] of filesMap.entries()) {
      stats.filesConsidered += 1;
      // Список кандидатных строк для поиска использования
      const candidates = normalizeCandidates(raw);

      // проверим, нет ли использования
      let checkClient;
      try {
        checkClient = await pool.connect();
        // мы ищем совпадения в обеих колонках: mediaUrl и thumbnailUrl
        const used = await isUsedAnywhere(checkClient, candidates, tablesMeta, ['mediaUrl', 'thumbnailUrl']);
        if (used) {
          stats.filesSkippedStillUsed += 1;
          //console.log('SKIP (still used):', raw);
          continue;
        }
      } catch (err) {
        stats.errors += 1;
        console.error('Error checking usage for', raw, err && err.message ? err.message : err);
        continue;
      } finally {
        if (checkClient) checkClient.release();
      }

      // Определяем порядок директорий для попытки удаления:
      // если типы содержат 'video' или ключ выглядит как .jpg (thumbnail) — пробуем VIDEO_DIR сначала
      const types = Array.from(meta.types || []).map(s => (s||'').toLowerCase());
      const rawLower = String(raw || '').toLowerCase();
      let tryDirs = DEFAULT_BASE_DIRS;
      if (rawLower.includes('/uploads/audio/')) tryDirs = [AUDIO_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== AUDIO_DIR)];
      else if (rawLower.includes('/uploads/videos/')) tryDirs = [VIDEO_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== VIDEO_DIR)];
      else if (rawLower.includes('/uploads/docs/')) tryDirs = [DOCS_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== DOCS_DIR)];
      else if (rawLower.includes('/uploads/files/')) tryDirs = [FILES_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== FILES_DIR)];
      else if (rawLower.includes('/uploads/images/')) tryDirs = [IMAGES_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== IMAGES_DIR)];
      else if (rawLower.includes('/uploads/others/')) tryDirs = [OTHERS_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== OTHERS_DIR)];
      else if (types.includes('video') || /\.jpe?g$|\.png$|\.webp$/i.test(raw)) {
        tryDirs = [VIDEO_DIR, IMAGES_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== VIDEO_DIR && d !== IMAGES_DIR)];
      } else if (types.includes('audio') || types.includes('voice')) {
        tryDirs = [AUDIO_DIR, ...DEFAULT_BASE_DIRS.filter((d) => d !== AUDIO_DIR)];
      }

      const extracted = extractFilename(raw) || raw;
      const res = await tryUnlinkWithDirs(extracted, raw, tryDirs);
      if (res.ok) {
        stats.filesDeleted += 1;
        //console.log('Deleted file:', res.path);
      } else {
        stats.filesUnlinkFailed += 1;
        failures.push({ raw, tried: res.tried });
        console.warn('Failed unlink attempts for', raw, res.tried);
      }
    }

    // Доп. проход: физические старые файлы uploads (для orphan-файлов, которых уже нет/не видно в БД-выборке).
    // Для scope=uploads сканируем все подпапки, для scope=voice — только uploads/audio.
    if (CLEANUP_SCOPE === 'uploads' || CLEANUP_SCOPE === 'voice') {
      const cutoffMs = parseAgeIntervalToMs(AGE_INTERVAL);
      if (cutoffMs) {
        const now = Date.now();
        const roots = CLEANUP_SCOPE === 'voice'
          ? [AUDIO_DIR]
          : [AUDIO_DIR, VIDEO_DIR, DOCS_DIR, FILES_DIR, IMAGES_DIR, OTHERS_DIR];
        for (const root of roots) {
          const files = await walkFiles(root);
          for (const fullPath of files) {
            stats.fsCandidatesScanned += 1;
            let st;
            try {
              st = await fs.stat(fullPath);
            } catch (_) {
              continue;
            }
            if (!st?.mtimeMs || (now - st.mtimeMs) < cutoffMs) continue;
            stats.fsCandidatesOldEnough += 1;

            const rel = fullPath.replace(path.resolve(__dirname, '..'), '').replace(/\\/g, '/');
            const candidates = normalizeCandidates(rel);
            let checkClient;
            try {
              checkClient = await pool.connect();
              const used = await isUsedAnywhere(checkClient, candidates, tablesMeta, ['mediaUrl', 'thumbnailUrl']);
              if (used) {
                stats.filesSkippedStillUsed += 1;
                continue;
              }
            } catch (err) {
              stats.errors += 1;
              console.error('Error checking usage for fs candidate', rel, err && err.message ? err.message : err);
              continue;
            } finally {
              if (checkClient) checkClient.release();
            }

            if (DO_RUN) {
              try {
                await fs.unlink(fullPath);
                stats.filesDeleted += 1;
              } catch (err) {
                stats.filesUnlinkFailed += 1;
                failures.push({ raw: rel, err: err.code || err.message });
                console.warn('Failed unlink fs candidate', rel, err && (err.code || err.message));
              }
            }
          }
        }
      } else {
        console.warn('Cannot parse CLEANUP_AGE_INTERVAL for fs-scan:', AGE_INTERVAL);
      }
    }

    console.log('[cleanup][summary]', JSON.stringify({
      ...stats,
      totalDbRowsRemoved: totalDeleted,
      filesMapSize: filesMap.size,
      failuresSample: failures.slice(0, 10),
      ts: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Fatal error:', e && e.message ? e.message : e);
  } finally {
    await pool.end().catch(()=>{});
  }
})();
















// Удаляет толко аудио
// require('dotenv').config();
// const { createPoolFromEnv } = require('../config/db-config');
// const fs = require('fs').promises;
// const path = require('path');
// const { URL } = require('url');

// const pool = createPoolFromEnv();
// const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads', 'audio'); // где лежат файлы
// const AGE_INTERVAL = '4 days'; // для теста. Поменяйте на '2 months' для прод-очистки.

// const TABLES = [
//   { schema: 'public', name: 'RoomMessages', idCol: 'id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
//   { schema: 'public', name: 'boss_messages', idCol: 'id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
//   { schema: 'public', name: 'chat_messages', idCol: '_id', fileCol: 'mediaUrl', createdCol: 'createdAt' },
// ];

// // const args = process.argv.slice(2);
// // const DO_RUN = args.includes('--run'); // default = dry-run
// const DO_RUN = true; // УДАЛЕНИЕ ВКЛЮЧЕНО ПО УМОЛЧАНИЮ

// console.log('[cleanup] старт работы скрипта', new Date().toISOString());


// function qIdent(s) {
//   if (/^[a-z0-9_]+$/.test(s)) return s;
//   return `"${String(s).replace(/"/g, '""')}"`;
// }
// function qTable(t){ return `${qIdent(t.schema)}.${qIdent(t.name)}`; }
// function qCol(c){ return qIdent(c); }

// function extractFilename(raw) {
//   if (!raw) return null;
//   const s = String(raw).trim();
//   if (/^https?:\/\//i.test(s)) {
//     try { return path.basename(new URL(s).pathname); } catch(e){ /* fallthrough */ }
//   }
//   return s.split('?')[0].split('#')[0];
// }

// async function rowsToDelete(client, tbl) {
//   const ti = qTable(tbl);
//   // select rows older than AGE_INTERVAL and with mediaUrl present and type like audio/voice
//   const q = `
//     SELECT ${qCol(tbl.idCol)}::text AS id_text,
//            ${qCol(tbl.fileCol)} AS media_url,
//            ${qCol(tbl.createdCol)} AS created
//     FROM ${ti}
//     WHERE (${qCol(tbl.fileCol)} IS NOT NULL AND ${qCol(tbl.fileCol)} <> '')
//       AND (${qCol(tbl.createdCol)} < now() - interval '${AGE_INTERVAL}')
//       AND (
//            COALESCE(${qCol('type')}::text, '') = 'audio'
//            OR COALESCE(${qCol('type')}::text, '') ILIKE '%audio%'
//            OR COALESCE(${qCol('type')}::text, '') ILIKE '%voice%'
//       )
//     ORDER BY ${qCol(tbl.createdCol)} ASC
//     LIMIT 5000;
//   `;
//   const res = await client.query(q);
//   return res.rows;
// }

// async function deleteRowsByIds(client, tbl, ids) {
//   const ti = qTable(tbl);
//   const q = `
//     DELETE FROM ${ti}
//     WHERE ${qCol(tbl.idCol)}::text = ANY($1)
//     RETURNING ${qCol(tbl.idCol)}::text AS id_text, ${qCol(tbl.fileCol)} AS media_url
//   `;
//   const res = await client.query(q, [ids]);
//   return res.rows;
// }

// function normalizeCandidates(raw) {
//   if (!raw) return [];
//   const s = String(raw);
//   const basename = path.basename(s);
//   const noLeading = s.replace(/^\/+/, '');
//   return [
//     s,                // original, maybe '/uploads/audio/..'
//     noLeading,        // without leading slash
//     basename,         // file.m4a
//     path.posix.join('uploads','audio', basename) // uploads/audio/file.m4a
//   ].filter(Boolean);
// }

// // Проверяем, используется ли файл в других таблицах — сравниваем несколько вариантов
// async function isUsedAnywhere(client, candidateStrings, tablesMeta) {
//   for (const t of tablesMeta) {
//     const ti = qTable(t);
//     const fileCol = qCol(t.fileCol);
//     const ors = [];
//     const params = [];
//     candidateStrings.forEach((c) => {
//       params.push(c);
//       ors.push(`${fileCol} = $${params.length}`);
//       ors.push(`${fileCol} LIKE '%' || $${params.length}`);
//     });
//     const q = `SELECT 1 FROM ${ti} WHERE (${ors.join(' OR ')}) LIMIT 1`;
//     try {
//       const r = await client.query(q, params);
//       if (r.rowCount > 0) return true;
//     } catch (e) {
//       // если таблица/колонка нет или ошибка — просто пропускаем её
//       continue;
//     }
//   }
//   return false;
// }

// async function tryUnlink(rel, raw) {
//   if (!rel) {
//     const ex = extractFilename(raw);
//     if (ex) rel = ex;
//   }
//   if (!rel) return {ok:false,tried:[]};
//   const attempts = [
//     path.join(UPLOADS_DIR, rel),
//     path.resolve('/', rel),
//     path.join(UPLOADS_DIR, path.basename(rel))
//   ];
//   const tried = [];
//   for (const p of attempts) {
//     try {
//       await fs.unlink(p);
//       return { ok:true, path:p };
//     } catch (err) {
//       tried.push({ path:p, err: err.code || err.message });
//       if (err.code === 'ENOENT') continue;
//     }
//   }
//   return { ok:false, tried };
// }

// (async function main(){
//   console.log('Dry-run:', !DO_RUN, 'AGE_INTERVAL =', AGE_INTERVAL, 'uploads dir =', UPLOADS_DIR);
//   const tablesMeta = TABLES;
//   let total = 0;
//   const filesToTry = new Set();

//   for (const t of tablesMeta) {
//     let client;
//     try {
//       client = await pool.connect();
//       console.log(`\nProcessing ${t.schema}.${t.name} ...`);
//       const rows = await rowsToDelete(client, t);
//       console.log('Found rows:', rows.length);
//       if (!rows.length) { continue; } // release in finally

//       const ids = rows.map(r => String(r.id_text));
//       total += ids.length;
//       rows.forEach(r => filesToTry.add(r.media_url));

//       if (DO_RUN) {
//         const deleted = await deleteRowsByIds(client, t, ids);
//         console.log('Deleted rows:', deleted.length);
//         deleted.forEach(d => filesToTry.add(d.media_url));
//       } else {
//         console.log('(dry) would delete ids sample:', ids.slice(0,10));
//       }
//     } catch (err) {
//       console.error('Error for', t.name, err && err.message ? err.message : err);
//     } finally {
//       if (client) client.release();
//     }
//   }

//   console.log('\nFiles candidates count:', filesToTry.size);
//   for (const raw of filesToTry) {
//     const extracted = extractFilename(raw) || raw;
//     const cand = normalizeCandidates(raw);
//     const checkClient = await pool.connect();
//     try {
//       const used = await isUsedAnywhere(checkClient, cand, tablesMeta);
//       if (used) {
//         console.log('SKIP (still used):', raw);
//         continue;
//       }
//     } finally { checkClient.release(); }

//     if (DO_RUN) {
//       const res = await tryUnlink(extracted, raw);
//       if (res.ok) console.log('Deleted file:', res.path);
//       else console.warn('Failed unlink attempts for', raw, res.tried);
//     } else {
//       console.log('(dry) would unlink:', extracted, 'from raw:', raw);
//     }
//   }

//   console.log(`\nSummary: ${DO_RUN ? 'removed' : 'would remove'} ${total} rows (files: ${filesToTry.size})`);
//   await pool.end();
// })();
