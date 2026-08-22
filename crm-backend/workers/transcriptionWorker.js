// Сначала грузим .env. Не перетираем значения PM2/env: на разных серверах
// базы называются по-разному, а worker должен работать с той же БД, что и backend.
require('dotenv').config();

process.env.DB_HOST = process.env.DB_HOST || 'localhost';

console.error('🔥 TRANSCRIPTION WORKER BOOTED', process.pid);
// console.log('DB_HOST', process.env.DB_HOST);
// console.log('DB_USER', process.env.DB_USER);
// console.log('DB_NAME', process.env.DB_NAME);
// console.log('DB_PASSWORD exists?', !!process.env.DB_PASSWORD); // смотрим правильную переменную



const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
// const fetch = require('node-fetch'); // если у тебя axios — можно заменить
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const transcriptionQueue = require('../queues/transcriptionQueue'); // твой файл
const db = require('../models');
const models = db.sequelize.models;
// const RoomMessage = db.sequelize.models.RoomMessage;

// Путь к python в venv — подгони если у тебя .venv в другом месте
const PYTHON = process.env.PYTHON_PATH || path.join(__dirname, '..', '.venv', 'bin', 'python3');
// Путь к transcribe.py (Python script, который использует vosk)
const TRANSCRIBE_PY = process.env.TRANSCRIBE_PY || path.join(__dirname, '..', 'transcribe.py');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const INTERNAL_API = process.env.INTERNAL_API_BASE || 'http://127.0.0.1:5000';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';




// ============ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ЗАВИСШИХ ЗАДАЧ ============
async function checkAndCleanupStuckJobs() {
  //console.log('🧹 Проверка зависших задач...', new Date().toISOString());
  
  try {
    // Получаем активные задачи
    const activeJobs = await transcriptionQueue.getActive();
    
    //console.log(`📊 Активных задач: ${activeJobs.length}`);
    
    let stuckCount = 0;
    
    for (const job of activeJobs) {
      // Если задача имеет processedOn (когда начала обрабатываться)
      if (job.processedOn) {
        const processingTime = Date.now() - job.processedOn;
        const minutesStuck = Math.floor(processingTime / (60 * 1000));
        
        // Если задача обрабатывается больше 10 минут - считаем зависшей
        if (processingTime > 10 * 60 * 1000) {
          // console.log(`⚠️ Зависшая задача: ${job.id}, зависла ${minutesStuck} минут назад`);
          // console.log(`   Данные: ${JSON.stringify(job.data)}`);
          
          try {
            // Пытаемся получить модель для обновления статуса
            const { messageId, model: modelName } = job.data;
            const Model = models[modelName];
            
            if (Model) {
              const pkField = Object.keys(Model.primaryKeys)[0] || 'id';
              
              // Обновляем статус в БД на failed
              await Model.update({
                transcriptionStatus: 'failed',
                transcriptionError: `Задача зависла в очереди (обрабатывалась ${minutesStuck} минут)`,
              }, { where: { [pkField]: messageId } });
              
              //console.log(`   ✅ Обновлен статус в БД для messageId ${messageId}`);
            }
            
            // Пытаемся переместить задачу в failed
            await job.moveToFailed(new Error(`Job stuck for ${minutesStuck} minutes`), true);
            //console.log(`   ✅ Задача ${job.id} перемещена в failed`);
            
            stuckCount++;
            
          } catch (error) {
            console.error(`   ❌ Ошибка обработки зависшей задачи ${job.id}:`, error.message);
          }
        } else if (processingTime > 5 * 60 * 1000) {
          // Если больше 5 минут, но меньше 10 - просто логируем
          //console.log(`   ⏱ Задача ${job.id} обрабатывается ${minutesStuck} минут...`);
        }
      }
    }
    
    if (stuckCount > 0) {
      //console.log(`✅ Обработано зависших задач: ${stuckCount}`);
    } else {
      //console.log('✅ Зависших задач не обнаружено');
    }
    
    return stuckCount;
    
  } catch (error) {
    console.error('❌ Ошибка при проверке зависших задач:', error.message);
    return 0;
  }
}

// Запускаем проверку зависших задач каждые 10 минут
setInterval(() => {
  checkAndCleanupStuckJobs();
}, 10 * 60 * 1000); // 10 минут

// Также запускаем сразу при старте воркера (через 30 секунд, чтобы успели загрузиться модели)
setTimeout(() => {
  checkAndCleanupStuckJobs();
}, 30000);






async function downloadToTmp(source, destPath) {
  if (!source) throw new Error('media source empty');

  // 1) если передали специально mediaPath — используем прямо его (обычно абсолютный)
  if (typeof source === 'string' && source && source !== '') {
    // Если строка выглядит как абсолютный путь и существует — копируем
    if (path.isAbsolute(source) && fs.existsSync(source)) {
      //console.log('[transcription] downloadToTmp: copying absolute path', source, '->', destPath);
      fs.copyFileSync(source, destPath);
      return destPath;
    }

    // Если строка начинается с '/' but не существует как абсолютный,
    // возможно это публичный относительный URL вида '/uploads/...' — 
    // пробуем привести к абсолютному пути внутри проекта
    if (source.startsWith('/')) {
      const candidate = path.join(process.cwd(), source.replace(/^\/+/, ''));
      if (fs.existsSync(candidate)) {
        //console.log('[transcription] downloadToTmp: resolved project path', candidate, '->', destPath);
        fs.copyFileSync(candidate, destPath);
        return destPath;
      } else {
        // также попробуем с process.cwd() + '/public' на случай, если у тебя публичная папка
        const candidate2 = path.join(process.cwd(), 'public', source.replace(/^\/+/, ''));
        if (fs.existsSync(candidate2)) {
          //console.log('[transcription] downloadToTmp: resolved public path', candidate2, '->', destPath);
          fs.copyFileSync(candidate2, destPath);
          return destPath;
        }
      }
    }

    // Если source имеет префикс file://
    if (source.startsWith('file://')) {
      const localPath = source.replace(/^file:\/\//, '');
      if (fs.existsSync(localPath)) {
        //console.log('[transcription] downloadToTmp: copying file:// path', localPath, '->', destPath);
        fs.copyFileSync(localPath, destPath);
        return destPath;
      }
    }
  }

  // 2) Если не локальный файл — пробуем скачать по http(s)
  if (source.startsWith('http://') || source.startsWith('https://')) {
    //console.log('[transcription] downloadToTmp: downloading http(s) ', source);
    const res = await fetch(source);
    if (!res.ok) throw new Error('download failed: ' + res.status);
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(destPath);
      res.body.pipe(ws);
      res.body.on('error', reject);
      ws.on('finish', resolve);
    });
    return destPath;
  }

  // 3) Если дошли сюда — не нашли локальный файл и не смогли скачать
  throw new Error('Local file not found: ' + source);
}



// helper: конвертируем любой вход в WAV 16kHz mono
function convertToWavMono16(inputPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-ac', '1', '-ar', '16000', '-f', 'wav', outPath];
    const p = spawn('ffmpeg', args);
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('close', code => {
      if (code === 0) resolve(outPath);
      else reject(new Error('ffmpeg failed: ' + code + ' ' + stderr.slice(0, 2000)));
    });
  });
}

// helper: запускает python transcribe и возвращает stdout (строку)
function runPythonTranscribe(wavPath) {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON, [TRANSCRIBE_PY, wavPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error('python transcribe failed: ' + code + ' ' + err));
    });
  });
}




// основной обработчик job'а
transcriptionQueue.process(2, async (job) => {

  //console.log('job start', job.data)

  const { messageId, model: modelName, mediaPath, mediaUrl, context } = job.data;
  //console.log('[transcription] job start', 'model', modelName, 'messageId', messageId, 'mediaUrl=', mediaUrl, 'mediaPath=', mediaPath);

  // выбираем модель по имени (вариант: 'RoomMessage', 'BossMessage', 'ChatMessage' и т.д.)
  const Model = (modelName && models[modelName]) ? models[modelName] : null;
  if (!Model) {
    console.error('[transcription] Model not found for', modelName, 'and RoomMessage fallback missing. Aborting job', job.id);
    // если нет модели — пометить job как failed
    throw new Error('Sequelize model not found: ' + modelName);
  }

  //console.log('[worker] Model = ', Model)

  const tmpDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const unique = uuidv4();
  const ext = path.extname(mediaPath || mediaUrl || '') || '.dat';
  const dlPath = path.join(tmpDir, `dl-${messageId}-${unique}${ext}`);
  const wavPath = path.join(tmpDir, `wav-${messageId}-${unique}.wav`);

  // выбираем источник: в первую очередь mediaPath, иначе mediaUrl
  const source = mediaPath && mediaPath.length > 0 ? mediaPath : mediaUrl;

  async function notifyMain() {
    try {
      await axios.post(
        `${INTERNAL_API}/internal/emit-transcription`,
        { messageId, model: modelName, context },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(INTERNAL_SECRET ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
          },
          timeout: 5000,
        }
      );
      //console.log('[transcription] notified main server for message', messageId, 'model', modelName);
    } catch (err) {
      console.warn('[transcription] notify failed', err && (err.response?.data || err.message));
    }
  }


    const pkField = Object.keys(Model.primaryKeys)[0];

    //console.log('pkField = ', pkField)


  try {

    await Model.update(
      { transcriptionStatus: 'processing', transcriptionError: null },
      { where: { [pkField]: messageId }, hooks: true }
    );

    // 2) получить запись (чтобы иметь доступ к roomId/chatId и т.п.)
    const messageInstance = await Model.findOne({
      where: { [pkField]: messageId },
    });
    if (!messageInstance) {
      // если записи нет — пометим failed и выкинем ошибку
      console.error('[transcription] message not found in model', modelName, 'id', messageId);
      throw new Error('Message not found: ' + messageId);
    }

    //console.log('[transcription] job start', { jobId: job.id, messageId, model: modelName, source });

    // скачиваем/копируем файл в dlPath
    await downloadToTmp(source, dlPath);
    //console.log('[transcription] download/copy ok:', dlPath);

    // конвертим в WAV16 mono
    await convertToWavMono16(dlPath, wavPath);

    // запускаем python/vosk
    const text = await runPythonTranscribe(wavPath);

    //console.log('text = ', text)

    // обновляем БД
    await Model.update(
      {
        transcriptionText: text || null,
        transcriptionStatus: 'done',
        transcribedAt: new Date(),
      },
      { where: { [pkField]: messageId }, hooks: true }
    );

    console.error('[transcription] done', { messageId, model: modelName, textPreview: (text || '').slice(0, 120) });

     // 7) уведомить основной сервер (передаём model чтобы internal точно знал куда эмитить)
    await notifyMain();

    // чистим временные файлы
    [dlPath, wavPath].forEach(p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {} });

    // console.log('[transcription] downloading to', dlPath);
    // console.log('[transcription] downloaded');
    // console.log('[transcription] converting to wav', wavPath);
    // console.log('[transcription] running python', PYTHON, TRANSCRIBE_PY);
    // console.log('[transcription] job done', messageId);
    
    // return Promise.resolve();
  } catch (err) {
    console.error('[transcription] job error', err);

    // отметим failed
        try {
      const errMsg = (err && err.message) ? String(err.message).slice(0, 1000) : 'unknown error';
      await Model.update(
        {
          transcriptionStatus: 'failed',
          transcriptionError: errMsg,
        },
        { where: { [pkField]: messageId }, hooks: true }
      );
      console.warn('[transcription] job failed for', messageId, 'model', modelName, 'error:', errMsg);
      // уведомляем main server чтобы клиент увидел иконку reload (опционально)
      await notifyMain();
    } catch (uErr) {
      console.error('[transcription] failed to set failed status for', messageId, uErr && uErr.message);
    }

    // cleanup
    [dlPath, wavPath].forEach(p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {} });

    // пробросим ошибку, Bull выполнит retry согласно attempts
    throw err;
  }
});



// Также добавим обработчики событий очереди для лучшего мониторинга
transcriptionQueue.on('stalled', (job) => {
  //console.log(`🚨 Задача ${job.id} зависла (stalled)`);
});

transcriptionQueue.on('failed', (job, err) => {
  //console.log(`❌ Задача ${job.id} завершилась с ошибкой:`, err.message);
});

transcriptionQueue.on('completed', (job, result) => {
  //console.log(`✅ Задача ${job.id} успешно завершена`);
});

//console.log('✅ Воркер запущен с проверкой зависших задач (каждые 10 минут)');

