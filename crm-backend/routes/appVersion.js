// routes/appVersion.js
const express = require('express');
const AppVersion = require('../models/AppVersion');
const router = express.Router();
const { getIO } = require('../socket');

/**
 * POST /api/app/version
 * body: { type: 'update' | 'build', version: string }
 */
router.post('/api/app/version', async (req, res) => {
  try {
    const { type, version } = req.body;
    if (!type || !version) {
      return res.status(400).json({ error: 'type и version обязательны' });
    }

    // Определяем статус приложения для базы
    const status = type === 'build' ? 'blocked' : 'active';

    // Сохраняем в БД
    const appVersion = await AppVersion.create({ type, version, status });

    // Получаем io из app
    const io = getIO();
    if (io) {
      // Отправляем всем клиентам унифицированное событие
      io.emit('appStatus', { status: type, version });
      // console.log(`[appVersion] Emitted appStatus: ${type}, version: ${version}`);
    } else {
      console.warn('[appVersion] io not found in req.app');
    }

    res.json(appVersion);
  } catch (e) {
    console.error('[appVersion] Error saving version', e);
    res.status(500).json({ error: 'Ошибка сохранения версии' });
  }
});

/**
 * GET /api/app/version/latest
 * Возвращает последние версии по типам build/update из таблицы app_versions.
 */
router.get('/api/app/version/latest', async (req, res) => {
  try {
    const [latestBuild, latestUpdate] = await Promise.all([
      AppVersion.findOne({
        where: { type: 'build' },
        // id DESC — самый надежный критерий "последней" записи
        order: [['id', 'DESC'], ['createdAt', 'DESC']],
      }),
      AppVersion.findOne({
        where: { type: 'update' },
        order: [['id', 'DESC'], ['createdAt', 'DESC']],
      }),
    ]);

    return res.json({
      build: latestBuild
        ? {
            version: latestBuild.version,
            status: latestBuild.status,
            createdAt: latestBuild.createdAt,
          }
        : null,
      update: latestUpdate
        ? {
            version: latestUpdate.version,
            status: latestUpdate.status,
            createdAt: latestUpdate.createdAt,
          }
        : null,
    });
  } catch (e) {
    console.error('[appVersion] Error reading latest versions', e);
    return res.status(500).json({ error: 'Ошибка получения актуальных версий' });
  }
});

module.exports = router;
