const db = require('../models');

const UserSetting = db.sequelize.models.UserSetting;

const APP_TEXT_SCALE_KEY = 'mobile_text_scale_percent';
const AUTO_REPLY_KEY = 'mobile_auto_reply';
const CLIENT_AUTO_REPLY_KEY = 'client_auto_reply';
const DEFAULT_PRIVACY_POLICY_URL = 'https://artcoupe.pro/privacy-policy.html';
const MESSAGE_SOUND_KEY = 'mobile_message_sound';
const PERSONAL_NOTE_KEY = 'mobile_personal_note';
const PERSONAL_NOTE_MAX_LENGTH = 100000;
const MESSAGE_SOUND_IDS = new Set(['default', 'soft', 'bright', 'low', 'double', 'silent']);
const MIN_PERCENT = 80;
const MAX_PERCENT = 160;
const DEFAULT_PERCENT = 100;

function normalizePercent(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n)) return DEFAULT_PERCENT;
  if (n < MIN_PERCENT) return MIN_PERCENT;
  if (n > MAX_PERCENT) return MAX_PERCENT;
  return n;
}

async function getMyMobileTextScale(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const row = await UserSetting.findOne({
      where: { userId, key: APP_TEXT_SCALE_KEY },
      attributes: ['value'],
    });

    const value = normalizePercent(row?.value?.percent);
    return res.json({ percent: value });
  } catch (err) {
    console.error('getMyMobileTextScale error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setMyMobileTextScale(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const percent = normalizePercent(req.body?.percent);
    const [row] = await UserSetting.findOrCreate({
      where: { userId, key: APP_TEXT_SCALE_KEY },
      defaults: { userId, key: APP_TEXT_SCALE_KEY, value: { percent } },
    });

    const prev = normalizePercent(row?.value?.percent);
    if (prev !== percent) {
      row.value = { percent };
      await row.save();
    }

    return res.json({ ok: true, percent });
  } catch (err) {
    console.error('setMyMobileTextScale error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

const DEFAULT_CLIENT_AUTO_REPLY_TEXT = [
  'Здравствуйте! 👋',
  'Спасибо! Мы получили сообщение и уже смотрим 👀',
  '',
  'Чтобы помочь быстрее, в чат могут подключаться разные сотрудники.',
  '',
  'Продолжая диалог, вы соглашаетесь с обработкой персональных данных:',
  '',
  '{{policyUrl}}',
].join('\n');

function normalizeClientAutoReply(raw) {
  const text = String(raw?.text || '').trim() || DEFAULT_CLIENT_AUTO_REPLY_TEXT;
  const policyUrl = String(raw?.policyUrl || process.env.PRIVACY_POLICY_URL || process.env.privacyPolicyUrl || DEFAULT_PRIVACY_POLICY_URL).trim();
  return {
    enabled: raw?.enabled !== false,
    text,
    policyUrl,
  };
}

async function getMyClientAutoReply(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const row = await UserSetting.findOne({
      where: { userId, key: CLIENT_AUTO_REPLY_KEY },
      attributes: ['value'],
    });

    return res.json(normalizeClientAutoReply(row?.value || {}));
  } catch (err) {
    console.error('getMyClientAutoReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setMyClientAutoReply(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const next = normalizeClientAutoReply(req.body || {});
    const [row] = await UserSetting.findOrCreate({
      where: { userId, key: CLIENT_AUTO_REPLY_KEY },
      defaults: { userId, key: CLIENT_AUTO_REPLY_KEY, value: next },
    });
    row.value = next;
    await row.save();
    return res.json({ ok: true, ...next });
  } catch (err) {
    console.error('setMyClientAutoReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  getMyMobileTextScale,
  setMyMobileTextScale,
  getMyAutoReply,
  setMyAutoReply,
  getMyClientAutoReply,
  setMyClientAutoReply,
  getMyMessageSound,
  setMyMessageSound,
  getMyPersonalNote,
  setMyPersonalNote,
};

function normalizePersonalNote(raw) {
  return String(raw?.text || '').slice(0, PERSONAL_NOTE_MAX_LENGTH);
}

async function getMyPersonalNote(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const row = await UserSetting.findOne({
      where: { userId, key: PERSONAL_NOTE_KEY },
      attributes: ['value', 'updatedAt'],
    });
    return res.json({
      text: normalizePersonalNote(row?.value || {}),
      updatedAt: row?.updatedAt || null,
    });
  } catch (err) {
    console.error('getMyPersonalNote error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setMyPersonalNote(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const text = normalizePersonalNote(req.body || {});
    const [row] = await UserSetting.findOrCreate({
      where: { userId, key: PERSONAL_NOTE_KEY },
      defaults: { userId, key: PERSONAL_NOTE_KEY, value: { text } },
    });
    row.value = { text };
    await row.save();
    return res.json({ ok: true, text, updatedAt: row.updatedAt });
  } catch (err) {
    console.error('setMyPersonalNote error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

function normalizeMessageSound(raw) {
  const soundId = String(raw?.soundId || 'default').trim().toLowerCase();
  return {
    soundId: MESSAGE_SOUND_IDS.has(soundId) ? soundId : 'default',
  };
}

async function getMyMessageSound(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const row = await UserSetting.findOne({
      where: { userId, key: MESSAGE_SOUND_KEY },
      attributes: ['value'],
    });
    return res.json(normalizeMessageSound(row?.value || {}));
  } catch (err) {
    console.error('getMyMessageSound error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setMyMessageSound(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const next = normalizeMessageSound(req.body || {});
    const [row] = await UserSetting.findOrCreate({
      where: { userId, key: MESSAGE_SOUND_KEY },
      defaults: { userId, key: MESSAGE_SOUND_KEY, value: next },
    });
    row.value = next;
    await row.save();
    return res.json({ ok: true, ...next });
  } catch (err) {
    console.error('setMyMessageSound error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

function normalizeAutoReply(raw) {
  const enabled = Boolean(raw?.enabled);
  const text = String(raw?.text || '').trim();
  return {
    enabled,
    text: text || 'Пользователь временно не может читать сообщения.',
  };
}

async function getMyAutoReply(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const row = await UserSetting.findOne({
      where: { userId, key: AUTO_REPLY_KEY },
      attributes: ['value'],
    });

    const value = normalizeAutoReply(row?.value || {});
    return res.json(value);
  } catch (err) {
    console.error('getMyAutoReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setMyAutoReply(req, res) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const next = normalizeAutoReply(req.body || {});
    const [row] = await UserSetting.findOrCreate({
      where: { userId, key: AUTO_REPLY_KEY },
      defaults: { userId, key: AUTO_REPLY_KEY, value: next },
    });
    row.value = next;
    await row.save();
    return res.json({ ok: true, ...next });
  } catch (err) {
    console.error('setMyAutoReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

