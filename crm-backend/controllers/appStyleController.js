const db = require('../models');

const AppSetting = db.sequelize.models.AppSetting;
const STYLE_KEY = 'web_style';
const DEFAULT_STYLE = {
  primaryOsColor: '#007bff',
};

function normalizeHexColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizeStyle(value = {}) {
  return {
    primaryOsColor: normalizeHexColor(value.primaryOsColor, DEFAULT_STYLE.primaryOsColor),
  };
}

async function getAppStyle(_req, res) {
  try {
    const setting = await AppSetting.findOne({ where: { key: STYLE_KEY } });
    return res.json(normalizeStyle(setting?.value));
  } catch (error) {
    console.error('[app-style] get failed', error);
    return res.status(500).json({ error: 'Не удалось получить настройки стиля' });
  }
}

async function updateAppStyle(req, res) {
  try {
    const primaryOsColor = String(req.body?.primaryOsColor || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(primaryOsColor)) {
      return res.status(400).json({ error: 'Основной цвет должен быть в формате #RRGGBB' });
    }

    const value = normalizeStyle({ primaryOsColor });
    const [setting] = await AppSetting.findOrCreate({
      where: { key: STYLE_KEY },
      defaults: { value },
    });
    if (JSON.stringify(setting.value) !== JSON.stringify(value)) {
      await setting.update({ value });
    }

    return res.json(value);
  } catch (error) {
    console.error('[app-style] update failed', error);
    return res.status(500).json({ error: 'Не удалось сохранить настройки стиля' });
  }
}

module.exports = {
  getAppStyle,
  updateAppStyle,
};
