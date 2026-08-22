// routes/retryTranscriptionRoutes.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const transcriptionQueue = require('../queues/transcriptionQueue');
const { getIO } = require('../socket');
const db = require('../models'); // загружает все модели
const { RoomMessage, ChatMessage, BossMessage, User } = db.sequelize.models; // поправь, если имена другие

/**
 * Resolve filesystem path for message:
 * - prefer message.mediaPath (если сохраняешь)
 * - иначе пытаемся привести mediaUrl -> project path
 */
function resolveFileSystemPathForMessage(message) {
  if (!message) return null;
  if (message.mediaPath && typeof message.mediaPath === 'string') {
    return message.mediaPath;
  }
  if (message.mediaUrl && typeof message.mediaUrl === 'string') {
    // mediaUrl обычно '/uploads/audio/xxx.m4a' (публичный)
    const candidate = path.join(process.cwd(), message.mediaUrl.replace(/^\/+/, ''));
    return candidate;
  }
  return null;
}

/**
 * Common retry handler
 * - modelInstance: Sequelize model (RoomMessage / ChatMessage / BossMessage)
 * - messageId: id
 * - context: object with info to emit (roomId/chatId/consultId)
 * - emitChannels: { roomChannel, genericEventName, specificNewMsgEvent } - адаптируй под проект
 */
async function doRetryForMessage(Model, messageId, context = {}, emitChannels = {}) {
  const io = getIO();

  const message = await Model.findByPk(messageId);
  if (!message) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  // check type (only allow audio/voice)
  const typeLower = (message.type || '').toString().toLowerCase();
  if (typeLower !== 'audio' && typeLower !== 'voice') {
    const err = new Error('Transcription retry allowed only for audio messages');
    err.status = 400;
    throw err;
  }

  if (message.transcriptionStatus === 'processing') {
    // уже обрабатывается
    return { ok: true, info: 'already processing' };
  }

  // resolve file path
  const fileSystemPath = resolveFileSystemPathForMessage(message);
  if (!fileSystemPath || !fs.existsSync(fileSystemPath)) {
    // помечаем failed и эмитим обновлённый объект
    await message.update({ transcriptionStatus: 'failed', transcriptionError: 'Local file not found for retry' });
    const updated = await Model.findByPk(messageId, { include: [{ model: User, attributes: ['id','name'] }] });

    // эмитим specific event if provided
    if (emitChannels.roomChannel && context.roomId) {
      io.to(emitChannels.roomChannel).emit(emitChannels.specificNewMsgEvent || 'newRoomMessage', updated);
    }
    // generic event
    io.emit('message_transcription', {
      messageId: updated.id,
      transcriptionStatus: updated.transcriptionStatus,
      transcriptionText: updated.transcriptionText ?? null,
      context,
    });

    const err = new Error('Local file not found');
    err.status = 400;
    throw err;
  }

  // обновляем статус в БД -> processing
  await message.update({ transcriptionStatus: 'processing', transcriptionError: null });

  // подготавливаем объект, который эмитим клиентам — обновлённый
  const updatedForEmit = await Model.findByPk(messageId, { include: [{ model: User, attributes: ['id','name'] }] });

  // emit "processing" specific + generic event
  if (emitChannels.roomChannel && context.roomId) {
    io.to(emitChannels.roomChannel).emit('room:message_transcription', {
      messageId: updatedForEmit.id,
      transcriptionStatus: 'processing',
      transcriptionText: null,
    });
    io.to(emitChannels.roomChannel).emit(emitChannels.specificNewMsgEvent || 'newRoomMessage', updatedForEmit);
  }

  io.emit('message_transcription', {
    messageId: updatedForEmit.id,
    transcriptionStatus: 'processing',
    transcriptionText: null,
    context,
  });

  // add to transcription queue (worker ожидает поле mediaPath или mediaUrl)
  await transcriptionQueue.add(
    { messageId: updatedForEmit.id, mediaUrl: updatedForEmit.mediaUrl, mediaPath: fileSystemPath },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
  );

  return { ok: true, messageId: updatedForEmit.id };
}

/**
 * Route for room messages
 * POST /admin/rooms/:roomId/messages/:messageId/retry-transcription
 */
router.post('/admin/rooms/:roomId/messages/:messageId/retry-transcription', async (req, res) => {
  const { roomId, messageId } = req.params;
  try {
    const result = await doRetryForMessage(
      RoomMessage,
      messageId,
      { roomId: Number(roomId) },
      { roomChannel: `room-${roomId}`, specificNewMsgEvent: 'newRoomMessage' }
    );
    return res.json(result);
  } catch (err) {
    console.error('retry room error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

/**
 * Route for consult/chat messages (example)
 * POST /consults/:consultId/messages/:messageId/retry-transcription
 * Adjust model if you use another model for consults (ChatMessage, etc.)
 */
router.post('/consults/:consultId/messages/:messageId/retry-transcription', async (req, res) => {
  const { consultId, messageId } = req.params;
  try {
    const result = await doRetryForMessage(
      ChatMessage, // убедись что ChatMessage — правильная модель для вашего consult-чата
      messageId,
      { consultId },
      // consult may use global channel 'consult' or specific. Adjust if needed.
      { roomChannel: 'consult', specificNewMsgEvent: 'newChatMessage' }
    );
    return res.json(result);
  } catch (err) {
    console.error('retry consult error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

/**
 * Route for boss chat messages
 * POST /admin/boss/chats/:chatId/messages/:messageId/retry-transcription
 */
router.post('/admin/boss/chats/:chatId/messages/:messageId/retry-transcription', async (req, res) => {
  const { chatId, messageId } = req.params;
  try {
    const result = await doRetryForMessage(
      BossMessage, // убедись, что модель называется BossMessage
      messageId,
      { chatId: Number(chatId) },
      { roomChannel: `boss-chat-${chatId}`, specificNewMsgEvent: 'newBossMessage' } // адаптируй имена каналов
    );
    return res.json(result);
  } catch (err) {
    console.error('retry boss chat error', err);
    return res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
