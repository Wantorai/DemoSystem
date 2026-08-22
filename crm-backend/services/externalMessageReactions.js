const { Op } = require('sequelize');
const { ExternalMessageReaction } = require('../models');

const ALLOWED_REACTIONS = new Set(['👍', '❤️', '🔥', '⚡️', '😂', '😢', '😡', '🚀', '🤝', '💪', '💯', '✅', '🆗']);

const summarize = (rows, currentUserId) => {
  const byEmoji = new Map();
  rows.forEach((row) => {
    const plain = row.get ? row.get({ plain: true }) : row;
    const entry = byEmoji.get(plain.emoji) || { emoji: plain.emoji, count: 0, reactedByMe: false };
    entry.count += 1;
    if (Number(plain.userId) === Number(currentUserId)) entry.reactedByMe = true;
    byEmoji.set(plain.emoji, entry);
  });
  return Array.from(byEmoji.values());
};

const withReactions = async (messages, channel, currentUserId) => {
  const list = Array.isArray(messages) ? messages : [];
  const ids = list.map((message) => Number(message.id)).filter((id) => id > 0);
  if (!ids.length) return list.map((message) => ({ ...(message.toJSON ? message.toJSON() : message), reactions: [] }));
  const rows = await ExternalMessageReaction.findAll({
    where: { channel, messageId: { [Op.in]: ids } },
    order: [['id', 'ASC']],
  });
  const grouped = new Map();
  rows.forEach((row) => {
    const group = grouped.get(Number(row.messageId)) || [];
    group.push(row);
    grouped.set(Number(row.messageId), group);
  });
  return list.map((message) => {
    const plain = message.toJSON ? message.toJSON() : message;
    return { ...plain, reactions: summarize(grouped.get(Number(plain.id)) || [], currentUserId) };
  });
};

const toggleReaction = async ({ channel, message, userId, emoji }) => {
  if (!ALLOWED_REACTIONS.has(emoji)) {
    const error = new Error('Недопустимая реакция');
    error.status = 400;
    throw error;
  }
  const where = { channel, messageId: Number(message.id), userId: Number(userId) };
  const existing = await ExternalMessageReaction.findOne({ where });
  if (existing && existing.emoji === emoji) await existing.destroy();
  else if (existing) await existing.update({ emoji });
  else await ExternalMessageReaction.create({ ...where, emoji });
  const [decorated] = await withReactions([message], channel, userId);
  return decorated;
};

module.exports = { withReactions, toggleReaction };
