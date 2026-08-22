const db = require('../models');

const UserChatPin = db.sequelize.models.UserChatPin;

let syncPromise = null;
function ensureChatPinsTable() {
  if (!syncPromise) {
    syncPromise = UserChatPin.sync().catch((err) => {
      syncPromise = null;
      throw err;
    });
  }
  return syncPromise;
}

function normalizePinKeys(rawKeys) {
  if (!Array.isArray(rawKeys)) return [];
  const dedup = new Set();
  const result = [];
  for (const item of rawKeys) {
    const key = String(item || '').trim();
    if (!key) continue;
    if (key.length > 191) continue;
    if (dedup.has(key)) continue;
    dedup.add(key);
    result.push(key);
  }
  return result;
}

async function getChatPins(req, res) {
  try {
    await ensureChatPinsTable();
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const rows = await UserChatPin.findAll({
      where: { userId },
      attributes: ['pinKey'],
      order: [['orderIndex', 'ASC'], ['createdAt', 'ASC']],
    });

    const keys = rows.map((r) => String(r.pinKey || '').trim()).filter(Boolean);
    return res.json({ keys });
  } catch (err) {
    console.error('getChatPins error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function setChatPins(req, res) {
  const t = await db.sequelize.transaction();
  try {
    await ensureChatPinsTable();
    const userId = Number(req.user?.id || 0);
    if (!userId) {
      await t.rollback();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const keys = normalizePinKeys(req.body?.keys);

    // Prevent concurrent pin rewrites for the same user (multiple rapid PUTs from client).
    await db.sequelize.query('SELECT pg_advisory_xact_lock(:ns, :userId)', {
      replacements: {
        ns: 240422, // namespace for chat pins lock
        userId,
      },
      transaction: t,
    });

    await UserChatPin.destroy({ where: { userId }, transaction: t });
    if (keys.length > 0) {
      await UserChatPin.bulkCreate(
        keys.map((pinKey, index) => ({
          userId,
          pinKey,
          orderIndex: index,
        })),
        { transaction: t }
      );
    }
    await t.commit();
    return res.json({ ok: true, keys });
  } catch (err) {
    await t.rollback();
    console.error('setChatPins error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = {
  ensureChatPinsTable,
  getChatPins,
  setChatPins,
};
