const express = require('express');
const https = require('https');
const http = require('http');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const MANAGER_URL = process.env.ARTCOUPE_SCENE_MANAGER_URL || 'https://artcoupe.pro/manage_scene.php';
const MANAGER_API_KEY = process.env.ARTCOUPE_SCENE_MANAGER_API_KEY || process.env.BAZIS_API_KEY || 'super-secret-keyjhvWQ38Y4U5';

function slugifyUserFolder(value) {
  const translit = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  return String(value || 'user')
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => Object.prototype.hasOwnProperty.call(translit, ch) ? translit[ch] : ch)
    .join('')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '') || 'user';
}

function safeSceneSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '');
}

function postSceneManager(payload) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(MANAGER_URL);
    const body = JSON.stringify({ ...payload, apiKey: MANAGER_API_KEY });
    const client = endpoint.protocol === 'http:' ? http : https;

    const req = client.request({
      hostname: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === 'http:' ? 80 : 443),
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let response = '';
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = response ? JSON.parse(response) : null;
        } catch (error) {
          return reject(new Error(`Scene manager returned invalid JSON: ${response.slice(0, 300)}`));
        }

        if (res.statusCode < 200 || res.statusCode >= 300 || !json?.ok) {
          return reject(new Error(json?.error || `Scene manager HTTP ${res.statusCode}`));
        }

        resolve(json);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Scene manager timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

router.get('/3d-scenes/my', authMiddleware, async (req, res) => {
  try {
    const userFolder = slugifyUserFolder(req.user?.name || `user_${req.user?.id || ''}`);
    const result = await postSceneManager({ action: 'list', user: userFolder });
    return res.json({
      ok: true,
      userFolder,
      scenes: Array.isArray(result.scenes) ? result.scenes : [],
    });
  } catch (error) {
    console.error('3D scenes list error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete('/3d-scenes/my/:scene', authMiddleware, async (req, res) => {
  try {
    const userFolder = slugifyUserFolder(req.user?.name || `user_${req.user?.id || ''}`);
    const scene = safeSceneSegment(req.params.scene);

    if (!scene) {
      return res.status(400).json({ ok: false, error: 'Scene is required' });
    }

    const result = await postSceneManager({ action: 'delete', user: userFolder, scene });
    return res.json({ ok: true, userFolder, scene: result.scene || scene });
  } catch (error) {
    console.error('3D scenes delete error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
