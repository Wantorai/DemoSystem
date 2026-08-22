'use strict';

const db = require('../models');
const QuickReply = db.sequelize.models.QuickReply;

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

async function listQuickReplies(req, res) {
  try {
    const rows = await QuickReply.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    console.error('listQuickReplies error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function createQuickReply(req, res) {
  try {
    const name = normalizeName(req.body?.name);
    const text = normalizeText(req.body?.text);
    const isActive = req.body?.isActive !== false;

    if (!name) return res.status(400).json({ message: 'Name required' });
    if (!text) return res.status(400).json({ message: 'Text required' });

    const exists = await QuickReply.findOne({ where: { name } });
    if (exists) return res.status(409).json({ message: 'Quick reply name already exists' });

    const row = await QuickReply.create({ name, text, isActive });
    return res.status(201).json(row);
  } catch (err) {
    console.error('createQuickReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateQuickReply(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await QuickReply.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Quick reply not found' });

    const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
    const hasText = Object.prototype.hasOwnProperty.call(req.body || {}, 'text');
    const hasIsActive = Object.prototype.hasOwnProperty.call(req.body || {}, 'isActive');
    if (!hasName && !hasText && !hasIsActive) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    if (hasName) {
      const nextName = normalizeName(req.body?.name);
      if (!nextName) return res.status(400).json({ message: 'Name required' });
      const dup = await QuickReply.findOne({ where: { name: nextName } });
      if (dup && Number(dup.id) !== Number(id)) {
        return res.status(409).json({ message: 'Quick reply name already exists' });
      }
      row.name = nextName;
    }
    if (hasText) {
      const nextText = normalizeText(req.body?.text);
      if (!nextText) return res.status(400).json({ message: 'Text required' });
      row.text = nextText;
    }
    if (hasIsActive) {
      row.isActive = req.body?.isActive !== false;
    }

    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('updateQuickReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function deleteQuickReply(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const deleted = await QuickReply.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: 'Quick reply not found' });
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('deleteQuickReply error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
};
