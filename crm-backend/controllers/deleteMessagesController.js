// controllers/deleteMessagesController.js

const path = require('path');
const fs = require('fs').promises;
const models = require('../models'); // index.js, где экспортированы RoomMessage, BossMessage, User



async function removeFileIfExists(fileUrl, req) {
  if (!fileUrl) return;
  try {
    // если mediaUrl хранит абсолютный URL или '/uploads/...'
    let urlPath;
    try {
      urlPath = new URL(fileUrl, `http://${req.headers.host}`).pathname;
    } catch (e) {
      urlPath = fileUrl;
    }
    const rel = urlPath.replace(/^\/+/, '');
    const filePath = path.join(process.cwd(), rel);

    // сначала удаляем сам файл (если он есть)
    await fs.unlink(filePath).catch(err => {
      if (err.code !== 'ENOENT') console.warn('unlink error', err);
    });

    // теперь вычисляем возможные превью-файлы и удаляем их
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath); // например ".mp4"
    const baseName = path.basename(filePath, ext); // например "my.video.file"

    // кандидаты превью: "baseName.jpg" и "thumb_baseName.jpg"
    const thumbCandidates = [
      path.join(dir, `${baseName}.jpg`),
      path.join(dir, `thumb_${baseName}.jpg`)
    ];

    // дополнительная гибкость: если у вас могут быть другие форматы/суффиксы, добавьте их сюда
    // например: webp, png и т.д.
    // thumbCandidates.push(path.join(dir, `${baseName}.webp`), path.join(dir, `${baseName}.png`));

    for (const thumbPath of thumbCandidates) {
      await fs.unlink(thumbPath).catch(err => {
        if (err.code !== 'ENOENT') console.warn('unlink thumb error', thumbPath, err);
      });
    }
  } catch (err) {
    console.warn('removeFileIfExists error', err);
  }
}



async function softDeleteMessage(Model, messageId, user, req) {
  const msg = await Model.findByPk(messageId);
  if (!msg) return null;

  // Permissions: автор или модератор
  const authorId = msg.userId ?? msg.user_id ?? null;
  const isAuthor = String(authorId) === String(user?.id);
  const isModerator = user?.role === 'admin' || user?.role === 'moderator';
  if (!isAuthor && !isModerator) {
    const err = new Error('No permission');
    err.status = 403;
    throw err;
  }

  // сохранём старые файлы для удаления
  const oldMedia = msg.mediaUrl ?? null;
  const oldFileName = msg.fileName ?? null;

  // сформируем текст-заглушку
  const deletedByName = user?.name ?? user?.email ?? `user-${user?.id ?? ''}`;
  const deletedText = `Сообщение удалено${deletedByName ? ` пользователем ${deletedByName}` : ''}`;

  // обновляем запись (soft-delete)
  await msg.update({
    content: deletedText,
    type: 'deleted',
    mediaUrl: null,
    fileName: null,
    fileSize: null,
    is_deleted: true,
    deleted_at: new Date(),
    deleted_by: user?.id ?? null,
    deletedByName: deletedByName,
  });

  // удаляем физически файл (если был)
  if (oldFileName || oldMedia) {
    await removeFileIfExists(oldMedia || oldFileName, req);
  }

  return {
    id: msg.id,
    chatId: msg.chatId ?? msg.roomId ?? null,
    kind: Model === models.RoomMessage ? 'room' : 'boss',
    content: deletedText,
    type: 'deleted',
    is_deleted: true,
    deletedByName,
    deletedBy: user?.id ?? null,
    deletedAt: msg.deleted_at,
  };
}

async function emitUpdate(req, payload) {
  try {
    // безопасно берём io из app (в server.js: app.set('io', io))
    const io = req.app.get('io');
    if (!io) return;
    const roomName = payload.kind === 'room' ? `room-${payload.chatId}` : `chat-${payload.chatId}`;
    io.to(roomName).emit('messageUpdated', payload);
  } catch (e) {
    console.warn('emitUpdate error', e);
  }
}

module.exports.deleteRoomMessage = async function (req, res) {
  const { roomId, messageId } = req.params;
  const user = req.user;
  try {
    const payload = await softDeleteMessage(models.RoomMessage, messageId, user, req);
    if (!payload) return res.status(404).json({ error: 'Message not found' });
    await emitUpdate(req, payload);
    return res.json({ ok: true, payload });
  } catch (err) {
    console.error('deleteRoomMessage error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
};

module.exports.deleteBossMessage = async function (req, res) {
  const { chatId, messageId } = req.params;
  const user = req.user;
  try {
    const payload = await softDeleteMessage(models.BossMessage, messageId, user, req);
    if (!payload) return res.status(404).json({ error: 'Message not found' });
    await emitUpdate(req, payload);
    return res.json({ ok: true, payload });
  } catch (err) {
    console.error('deleteBossMessage error', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
};
