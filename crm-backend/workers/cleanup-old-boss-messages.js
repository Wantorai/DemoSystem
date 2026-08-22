require('dotenv').config();
const { Op } = require('sequelize');
const db = require('../models');

const BossChat = db.sequelize.models.BossChat;
const BossMessage = db.sequelize.models.BossMessage;

async function main() {
  const startedAt = new Date();
  const chats = await BossChat.findAll({
    attributes: ['id', 'name', 'retentionDays'],
  });

  let chatsWithRetention = 0;
  let totalDeleted = 0;
  const perChat = [];

  for (const chat of chats) {
    const retentionDays = Number(chat.retentionDays);
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) continue;
    chatsWithRetention += 1;

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deletedCount = await BossMessage.destroy({
      where: {
        chatId: chat.id,
        createdAt: { [Op.lt]: cutoff },
      },
    });

    totalDeleted += Number(deletedCount) || 0;
    perChat.push({
      chatId: chat.id,
      chatName: chat.name || null,
      retentionDays,
      deletedCount: Number(deletedCount) || 0,
    });
  }

  console.log('[cleanup-boss-messages][summary]', JSON.stringify({
    ts: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    chatsTotal: chats.length,
    chatsWithRetention,
    totalDeleted,
    perChatTop: perChat.slice(0, 50),
  }));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cleanup-boss-messages] error', err);
    process.exit(1);
  });

