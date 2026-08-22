// routes/proxy.js - ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/audio', async (req, res) => {
  // console.log('🎯 Запрос на /api/proxy/audio получен');
  // console.log('🎯 Query params:', Object.keys(req.query));
  
  try {
    const { url } = req.query;
    
    if (!url) {
      console.warn('❌ URL не передан');
      return res.status(400).json({ error: 'URL is required' });
    }

    const decodedUrl = decodeURIComponent(url);
    //console.log('🔊 Декодированный URL:', decodedUrl.substring(0, 100) + '...');

    // Загружаем аудио с MAX CDN
    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'arraybuffer', // ИЗМЕНЕНИЕ: arraybuffer вместо stream
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
        'Accept-Encoding': 'identity', // Важно для аудио
      },
      timeout: 15000,
    });

    // console.log('✅ Ответ получен от MAX CDN');
    // console.log('📊 Статус:', response.status);
    // console.log('📊 Content-Type:', response.headers['content-type']);
    // console.log('📊 Content-Length:', response.headers['content-length']);
    // console.log('📊 Data size:', response.data.length, 'байт');

    // Получаем оригинальные заголовки
    const contentType = response.headers['content-type'] || 'audio/mpeg';
    const contentLength = response.headers['content-length'] || response.data.length;
    
    // Устанавливаем правильные заголовки
    res.set({
      'Content-Type': contentType,
      'Content-Length': contentLength,
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*', // Для CORS
    });

    // Отправляем аудио-данные
    res.send(response.data);
    
    //console.log('✅ Аудио отправлено клиенту');

  } catch (error) {
    console.error('❌ Ошибка в прокси /audio:');
    console.error('❌ Сообщение:', error.message);
    
    // if (error.response) {
    //   console.error('❌ Статус ответа:', error.response.status);
    //   console.error('❌ Заголовки:', error.response.headers);
      
    //   // Если получили текстовый ответ вместо аудио
    //   if (error.response.data && typeof error.response.data === 'string') {
    //     console.error('❌ Тело ответа (первые 200 символов):', 
    //       error.response.data.substring(0, 200));
    //   }
    // }
    
    res.status(500).json({ 
      error: 'Failed to proxy audio',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});


// Прокси для аудио в веб версии
router.get('/audio-web', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let decodedUrl = decodeURIComponent(url);
    
    // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Заменяем http:// на https://
    if (decodedUrl.startsWith('http://')) {
      decodedUrl = decodedUrl.replace('http://', 'https://');
    }
    
    // Продолжаем обычную обработку
    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'audio/mpeg',
      'Content-Length': response.headers['content-length'] || response.data.length,
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });

    res.send(response.data);
    
  } catch (error) {
    console.error('❌ Ошибка в прокси /audio-web:', error.message);
    res.status(500).json({ 
      error: 'Failed to proxy audio',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});




// Прокси для изображений MAX
router.get('/max-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'URL параметр обязателен' });
    }

    // Загружаем изображение с сервера MAX
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'stream'
    });

    // Устанавливаем правильные заголовки
    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400'); // Кэшируем на 24 часа

    // Передаем поток с изображением
    response.data.pipe(res);
  } catch (error) {
    console.error('Ошибка прокси изображения:', error);
    res.status(500).json({ error: 'Не удалось загрузить изображение' });
  }
});







// Прокси для видео MAX (с поддержкой Range для HTML5 video)
router.get('/max-video', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) {
      return res.status(400).json({ error: 'URL параметр обязателен' });
    }

    let videoUrl = decodeURIComponent(String(rawUrl));
    if (videoUrl.startsWith('http://')) {
      videoUrl = videoUrl.replace('http://', 'https://');
    }

    const range = req.headers.range;
    const upstream = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
        ...(range ? { Range: range } : {}),
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (upstream.status >= 400) {
      return res.status(upstream.status).json({ error: 'Не удалось загрузить видео' });
    }

    const contentType = upstream.headers['content-type'] || 'video/mp4';
    const contentLength = upstream.headers['content-length'];
    const contentRange = upstream.headers['content-range'];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=600');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    res.status(contentRange ? 206 : 200);
    upstream.data.pipe(res);
  } catch (error) {
    console.error('Ошибка прокси видео:', error?.message || error);
    res.status(500).json({ error: 'Не удалось загрузить видео' });
  }
});

// Прокси для документов/файлов MAX
router.get('/max-file', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) {
      return res.status(400).json({ error: 'URL параметр обязателен' });
    }

    let fileUrl = decodeURIComponent(String(rawUrl));
    if (fileUrl.startsWith('http://')) {
      fileUrl = fileUrl.replace('http://', 'https://');
    }

    const upstream = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*',
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (upstream.status >= 400) {
      return res.status(upstream.status).json({ error: 'Не удалось загрузить файл' });
    }

    const contentType = upstream.headers['content-type'] || 'application/octet-stream';
    const contentLength = upstream.headers['content-length'];
    const contentDisposition = upstream.headers['content-disposition'];

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'public, max-age=600');

    upstream.data.pipe(res);
  } catch (error) {
    console.error('Ошибка прокси файла:', error?.message || error);
    res.status(500).json({ error: 'Не удалось загрузить файл' });
  }
});
// // Тестовый маршрут для проверки
// router.get('/test', (req, res) => {
//   console.log('✅ Тестовый маршрут /test вызван');
//   res.json({ 
//     status: 'ok', 
//     message: 'Прокси сервер работает',
//     timestamp: new Date().toISOString()
//   });
// });

module.exports = router;

