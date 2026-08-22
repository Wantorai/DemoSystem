const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const { sequelize } = require('../models'); 

const TELEGRAM_SYSTEM_ALERTS_ENABLED = String(process.env.TELEGRAM_SYSTEM_ALERTS_ENABLED || '').toLowerCase() === 'true';
const bot = TELEGRAM_SYSTEM_ALERTS_ENABLED ? require('../bot').getBot() : null;

// // Путь для хранения времени последнего алерта
// const ALERT_FILE = path.join(__dirname, '..', 'tmp', 'last_disk_alert.json');


const logFile = path.join(__dirname, '..', 'logs', 'update.log');

const getSystemVersions = async (req, res) => {
  try {
    // Версия Node.js
    const nodeVersion = process.version;
    // console.log('nodeVersion = ', nodeVersion);

    // ----------------- !!!!!!!!!!!!!!!!!!!!!!!!!!!! -------------------// 
    // Когда обновляем Node.js, то нужно перезапустить сервер, чтобы изменения вступили в силу.
    // и нужно еще в ecosystem.config.js указать путь к новой версии Node.js
    // и перезапустить PM2, чтобы он использовал новую версию Node.js





    // Получаем версию PostgreSQL через команду "psql -V"
    const { stdout: pgStdout } = await execPromise('psql -V');
    // stdout обычно содержит что-то вроде: "psql (PostgreSQL) 17.0"
    const pgMatch = pgStdout.match(/(\d+\.\d+(\.\d+)?)/);
    const postgresVersion = pgMatch?.[0] || pgStdout?.trim() || 'Не удалось определить версию PostgreSQL';

    // console.log('postgresVersion = ', postgresVersion);

    // Получаем версию Next.js
    // Укажем путь, где находится проект фронтенда
    // В Windows можно использовать обратные слэши или задать путь через переменную окружения.
    // Например, для Windows можно указать: "C:\\crm\\crm-fronend"
    // Здесь пример для UNIX-подобной системы:
    const frontendDir = process.platform === 'win32'
      ? "C:\\Users\\User\\Desktop\\Проекты\\CRM система\\crm\\crm-fronend"
      : '/home/nodeapp/crm-fronend';
 

    // Получаем версию Next.js из каталога фронтенда
    let nextVersion = '';
    try {
      // Переходим в каталог фронтенда и выполняем команду
      const nextRes = await execPromise(`cd ${frontendDir} && npm list next --depth=0`);
      
      // Извлекаем только версию Next.js с помощью регулярного выражения
      const nextMatch = nextRes.stdout.match(/next@(\d+\.\d+\.\d+)/);
      nextVersion = nextMatch ? nextMatch[1] : 'Next.js не установлен';
    } catch (err) {
      nextVersion = err.stdout || 'Next.js не установлен';
      console.warn('Ошибка при получении версии Next.js, использовано:', nextVersion);
    }

    // console.log('nextVersion = ', nextVersion);

    
    // Получаем список устаревших зависимостей
    const backendOut = await execPromise('npm outdated', { shell: true }).catch(err => err);
    const frontendOut = await execPromise('npm outdated', {
      cwd: frontendDir,
      shell: true
    }).catch(err => err);

    const parseOutdated = (stdout) => {
      const safeStdout = typeof stdout === 'string' ? stdout : '';
      const lines = safeStdout?.trim().split('\n');
      const deps = [];
    
      if (lines.length > 1) {
        for (const line of lines.slice(1)) {
          const parts = line?.trim().split(/\s+/);
          if (parts.length >= 4) {
            deps.push({
              name: parts[0],
              current: parts[1],
              wanted: parts[2],
              latest: parts[3]
            });
          }
        }
      }
    
      return deps;
    };
    

    const backendDeps = parseOutdated(backendOut.stdout);
    const frontendDeps = parseOutdated(frontendOut.stdout);

    res.json({
      current: {
        node: nodeVersion,
        postgres: postgresVersion,
        nextJs: nextVersion,
        backendDependencies: backendDeps,
        frontendDependencies: frontendDeps
      }
    });

    // console.log('frontendDeps:', frontendDeps);

  } catch (error) {
    console.error('Error in getSystemVersions:', error);
    res.status(500).json({ error: 'Failed to get system versions' });
  }
};

const runUpdate = async (req, res) => {
  const { target } = req.params;
  const allowed = ['node', 'postgres', 'dependencies'];
  if (!allowed.includes(target)) return res.status(400).json({ error: 'Неверный тип обновления' });

  const scriptMap = {
    node: '/home/nodeapp/update_node.sh',
    postgres: '/home/nodeapp/update_postgres.sh',
    dependencies: '/home/nodeapp/update_dependencies.sh'
  };


  const script = scriptMap[target];
  exec(`bash ${script}`, (error, stdout, stderr) => {
    const log = `[${new Date().toISOString()}] Обновление ${target.toUpperCase()}: ${error ? '❌ Ошибка' : '✅ Успешно'}\n`;
    const fullLog = `${log}${stderr || ''}${stdout || ''}\n`;
    fs.appendFileSync(logFile, fullLog);

    if (error) {
      return res.status(500).json({ error: stderr });
    }
    res.json({ message: 'Обновление запущено' });
  });
};

const getUpdateLogs = (req, res) => {
  try {
    const logs = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8') : '';
    res.send(logs);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка чтения логов' });
  }
};



// function readLastAlert() {
//   try {
//     const data = fs.readFileSync(ALERT_FILE, 'utf8');
//     return JSON.parse(data).timestamp || 0;
//   } catch {
//     return 0;
//   }
// }
// function writeLastAlert(ts) {
//   try {
//     fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true });
//     fs.writeFileSync(ALERT_FILE, JSON.stringify({ timestamp: ts }));
//   } catch (err) {
//     console.error('Error writing alert file:', err);
//   }
// }




const getSystemInfo = async (req, res) => {

      // console.log('bot:', bot);

  let info = null;
  try {
    // 1. Загрузка CPU (средняя за 1 минуту)
    const [load1] = os.loadavg();
    const cpuCount = os.cpus().length;
    const cpuUsagePercent = ((load1 / cpuCount) * 100).toFixed(1);

    // 2. Память
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(1);


    // Сформируем JSON
    info = {
      cpu: {
        cores: cpuCount,
        loadAvg1m: Number(load1.toFixed(2)),
        usagePercent: Number(cpuUsagePercent),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Number(memUsagePercent),
      },

      disk: null  // по умолчанию нет данных о диске
    };


    // --- только на Linux/Mac: df -h / ---
    if (process.platform !== 'win32') {

      // 3. Диск (корень /)
      // Выполняем df -h / и парсим вторую строку
      const { stdout } = await execPromise('df -h /');
      // Разбиваем по строкам, берём вторую
      const line = stdout.trim().split('\n')[1];
      // Колонны разделяются пробелами (один или несколько)
      const parts = line.split(/\s+/);
      // Обычно: [Filesystem, Size, Used, Avail, Use%, Mounted_on]
      const [filesystem, size, used, avail, usePercent] = parts;
      const usedPctNum = parseInt(usePercent, 10);
      const freePctNum = 100 - usedPctNum;

      info.disk =  {
          filesystem,
          total: size,
          used,
          available: avail,
          usagePercent: usePercent,
          freePercent: `${freePctNum}%`
        };


      // 4) Telegram alert если нужно
      if (bot && freePctNum < 15) {
        // const now = Date.now();
        // const last = readLastAlert();
        // если прошло больше часа (3600*1000 мс)
        // if (now - last > 3600 * 1000) {
          const msg = `⚠️ *Внимание!*\nНа сервере осталось только ${freePctNum}% свободного места на диске.\nФайловая система ${filesystem}: ${used} / ${size}`;
          bot.sendMessage(518530383, msg, { parse_mode: 'Markdown' })
            .catch(err => console.error('Telegram send error:', err));
          // writeLastAlert(now);
        //}
      }

    }

    return res.json(info);
  } catch (err) {
    console.error('Error in getSystemInfo:', err);
    // Если это ошибка df, а мы на Windows — игнорируем
    if (process.platform === 'win32' && /df:/.test(err.message)) {
      // просто вернём данные без disk
      return res.json({
        cpu: info?.cpu ?? null,
        memory: info?.memory ?? null,
        disk: null
      });
    }
    return res.status(500).json({ error: err.message });
  }
}



const getOrderErrors = async (req, res) => {
  try {
    const threshold = parseInt(req.query.thresholdDays, 10) || 7;      // для "готовности"
    const installThreshold = parseInt(req.query.installThreshold, 10) || 30; // для оплаты (days)
    const onlyCount = req.query.onlyCount === 'false' ? false : true; // default true
    const type = req.query.type || null; // 'ready' or 'payment' or null
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 1000);
    const offset = parseInt(req.query.offset, 10) || 0;

    // 1) COUNT для "готовности"
    const countReadySql = `
      SELECT COUNT(DISTINCT o.id) AS cnt
      FROM "order" o
      JOIN order_configs oc ON oc.order_id = o.id
      LEFT JOIN addons a ON oc.addon_id = a.id
      WHERE o.active = true
        AND (oc.addon_id = 7 OR a.name = 'Готовность')
        AND (
          -- param19 отсутствует
          oc.data ->> 'param19' IS NULL 
          -- param19 пустая строка
          OR oc.data ->> 'param19' = ''
          -- param19 как JSON объект с date = "" и checked = false
          OR (
            jsonb_typeof(oc.data -> 'param19') = 'object'
            AND (
              (oc.data -> 'param19' ->> 'date') IS NULL 
              OR (oc.data -> 'param19' ->> 'date') = ''
            )
            AND (oc.data -> 'param19' ->> 'checked') = 'false'
          )
        )
        AND (current_date - (o.data ->> 'param13')::date) > :threshold;
    `;
    const countReadyRes = await sequelize.query(countReadySql, {
      replacements: { threshold },
      type: sequelize.QueryTypes.SELECT
    });
    const countReady = Number(countReadyRes[0].cnt || 0);

    // 2) COUNT для "оплаты"
    const countPaymentSql = `
      SELECT COUNT(DISTINCT o.id) AS cnt
      FROM "order" o
      LEFT JOIN LATERAL (
        SELECT NULLIF(o.data->'statusData'->>'orderInstalled', '')::date AS order_installed,
               (o.data->'statusData'->>'orderPaid')::text AS order_paid
      ) sd ON true
      LEFT JOIN LATERAL (
        SELECT max((elem->>'date')::date) AS last_install_date
        FROM jsonb_array_elements(o.data->'mainTest') elem
        WHERE jsonb_typeof(o.data->'mainTest') = 'array'
      ) mt ON true
      WHERE o.active = true
        AND (
          (sd.order_installed IS NOT NULL AND sd.order_installed < current_date AND (sd.order_paid IS NULL OR sd.order_paid = ''))
          OR
          (mt.last_install_date IS NOT NULL AND (current_date - mt.last_install_date) > :installThreshold)
        );
    `;
    const countPaymentRes = await sequelize.query(countPaymentSql, {
      replacements: { installThreshold },
      type: sequelize.QueryTypes.SELECT
    });
    const countPayment = Number(countPaymentRes[0].cnt || 0);

    // Если нужно только count — вернём их
    if (onlyCount && !type) {
      return res.json({ countReady, countPayment });
    }

    // Подготовка деталей
    const result = { countReady, countPayment };

    if (!type || type === 'ready') {
      const readyDetailSql = `
        SELECT DISTINCT o.id,
               COALESCE(o.data ->> 'param5', '') AS address,
               COALESCE(o.data ->> 'param9', '') AS article,
               COALESCE(o.data ->> 'param13', '') AS accepted_at,
               COALESCE(o.comment1, '') AS comment1,
               o.data AS data
        FROM "order" o
        JOIN order_configs oc ON oc.order_id = o.id
        LEFT JOIN addons a ON oc.addon_id = a.id
        WHERE o.active = true
          AND (oc.addon_id = 7 OR a.name = 'Готовность')
          AND (
            -- param19 отсутствует
            oc.data ->> 'param19' IS NULL 
            -- param19 пустая строка
            OR oc.data ->> 'param19' = ''
            -- param19 как JSON объект с date = "" и checked = false
            OR (
              jsonb_typeof(oc.data -> 'param19') = 'object'
              AND (
                (oc.data -> 'param19' ->> 'date') IS NULL 
                OR (oc.data -> 'param19' ->> 'date') = ''
              )
              AND (oc.data -> 'param19' ->> 'checked') = 'false'
            )
          )
          AND (current_date - (o.data ->> 'param13')::date) > :threshold
        ORDER BY o.id
        LIMIT :limit OFFSET :offset;
      `;
      const readyRows = await sequelize.query(readyDetailSql, {
        replacements: { threshold, limit, offset },
        type: sequelize.QueryTypes.SELECT
      });
      result.readyRows = readyRows;
    }

    if (!type || type === 'payment') {
      const paymentDetailSql = `
        SELECT DISTINCT o.id,
               COALESCE(o.data ->> 'param5', '') AS address,
               COALESCE(o.data ->> 'param9', '') AS article,
               COALESCE(sd.order_installed::text, '') AS orderInstalled,
               COALESCE(sd.order_paid, '') AS orderPaid,
               COALESCE(mt.last_install_date::text, '') AS last_install_date,
               COALESCE(o.comment1, '') AS comment1,
               COALESCE(o.comment2, '') AS comment2,
               o.data AS data
        FROM "order" o
        LEFT JOIN LATERAL (
          SELECT max((elem->>'date')::date) AS last_install_date
          FROM jsonb_array_elements(o.data->'mainTest') elem
          WHERE jsonb_typeof(o.data->'mainTest') = 'array'
        ) mt ON true
        LEFT JOIN LATERAL (
          SELECT NULLIF(o.data->'statusData'->>'orderInstalled', '')::date AS order_installed,
                 (o.data->'statusData'->>'orderPaid')::text AS order_paid
        ) sd ON true
        WHERE o.active = true
          AND (
            (sd.order_installed IS NOT NULL AND sd.order_installed < current_date AND (sd.order_paid IS NULL OR sd.order_paid = ''))
            OR
            (mt.last_install_date IS NOT NULL AND (current_date - mt.last_install_date) > :installThreshold)
          )
        ORDER BY o.id
        LIMIT :limit OFFSET :offset;
      `;
      const paymentRows = await sequelize.query(paymentDetailSql, {
        replacements: { installThreshold, limit, offset },
        type: sequelize.QueryTypes.SELECT
      });
      result.paymentRows = paymentRows;
    }

    return res.json(result);

  } catch (err) {
    console.error('getOrderErrors error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};



module.exports = {
  getSystemVersions,
  runUpdate,
  getUpdateLogs,
  getSystemInfo,
  getOrderErrors
};

