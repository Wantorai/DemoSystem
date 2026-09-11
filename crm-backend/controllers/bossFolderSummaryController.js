const db = require('../models');
const { QueryTypes } = require('sequelize');

function normalizeChats(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid chats');
  const seen = new Set();
  return input.map((item) => {
    const chatId = Number(item?.chatId);
    if (!Number.isSafeInteger(chatId) || chatId <= 0 || seen.has(chatId)) throw new Error('Invalid chat id');
    seen.add(chatId);
    const cutoffs = {};
    const entries = Object.entries(item.cutoffs || {});
    if (entries.length > 1000) throw new Error('Too many cutoffs');
    for (const [key, value] of entries) {
      const uid = Number(key), cutoff = Number(value);
      if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(cutoff) || cutoff < 0) throw new Error('Invalid cutoff');
      cutoffs[uid] = cutoff;
    }
    return { chatId, cutoffs };
  });
}

// Counts only: message bodies, attachments and encryption hooks are not involved.
const SUMMARY_SQL = `
WITH requested AS (
  SELECT * FROM jsonb_to_recordset(CAST(:chats AS jsonb)) AS r("chatId" int, cutoffs jsonb)
), allowed AS (
  SELECT c.id, c."retentionDays", r.cutoffs, COALESCE(bcu."lastReadMessageId", 0) AS baseline
  FROM requested r JOIN boss_chats c ON c.id = r."chatId"
  JOIN boss_chat_users bcu ON bcu."chatId" = c.id AND bcu."userId" = :userId
  WHERE c.mode = true
)
SELECT a.id AS "chatId", m."userId", u.name,
  to_char(m."createdAt" AT TIME ZONE 'Asia/Vladivostok', 'YYYY-MM-DD') AS day,
  COUNT(m.id)::int AS count, MAX(m.id) AS "lastMessageId",
  COUNT(m.id) FILTER (WHERE m."userId" <> :userId AND m.id > GREATEST(a.baseline,
    COALESCE(CAST(a.cutoffs ->> CAST(m."userId" AS text) AS bigint), 0)))::int AS unread
FROM allowed a
LEFT JOIN boss_messages m ON m."chatId" = a.id AND
  (a."retentionDays" IS NULL OR a."retentionDays" <= 0 OR
   m."createdAt" >= NOW() - a."retentionDays" * INTERVAL '1 day')
LEFT JOIN users u ON u.id = m."userId"
GROUP BY a.id, m."userId", u.name, day
ORDER BY a.id, m."userId", day DESC`;

async function getBossFolderSummaries(req, res) {
  let chats;
  try { chats = normalizeChats(req.body?.chats); }
  catch { return res.status(400).json({ message: 'Invalid chats or cutoffs' }); }
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.sendStatus(401);
  try {
    const rows = chats.length ? await db.sequelize.query(SUMMARY_SQL, {
      replacements: { chats: JSON.stringify(chats), userId }, type: QueryTypes.SELECT,
    }) : [];
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vladivostok', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayKeys = Array.from({ length: 15 }, (_, i) => formatter.format(new Date(now.getTime() - i * 86400000)));
    const result = {};
    for (const row of rows) {
      const chat = result[row.chatId] ||= { folders: [], unreadCount: 0 };
      if (row.userId == null) continue;
      let folder = chat.folders.find((f) => f.id === Number(row.userId));
      if (!folder) {
        folder = { id: Number(row.userId), name: row.name || `user-${row.userId}`, unreadCount: 0, lastMessageId: 0, todayCount: 0, monthCount: 0, performanceRows: dayKeys.map((key) => ({ key, label: key.split('-').reverse().join('.'), count: 0 })) };
        chat.folders.push(folder);
      }
      folder.unreadCount += Number(row.unread);
      chat.unreadCount += Number(row.unread);
      folder.lastMessageId = Math.max(folder.lastMessageId, Number(row.lastMessageId));
      if (row.day === dayKeys[0]) folder.todayCount += Number(row.count);
      if (row.day?.startsWith(dayKeys[0].slice(0, 7))) folder.monthCount += Number(row.count);
      const day = folder.performanceRows.find((entry) => entry.key === row.day);
      if (day) day.count += Number(row.count);
    }
    return res.json({ version: 1, chats: result });
  } catch (error) {
    console.error('getBossFolderSummaries error', error);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getBossFolderSummaries, normalizeChats, SUMMARY_SQL };
