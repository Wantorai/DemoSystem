const displayNameFromTelegram = (source = {}) => {
  const fullName = [source.first_name, source.last_name].filter(Boolean).join(' ').trim();
  return fullName || (source.username ? `@${source.username}` : '') || String(source.id || 'Telegram');
};

const parseTelegramMessage = (message = {}, botType = 'business') => {
  let messageType = 'text';
  let attachments = null;
  const text = String(message.text || message.caption || '');

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    messageType = 'image';
    attachments = {
      image: {
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id,
        width: photo.width,
        height: photo.height,
        size: photo.file_size || null,
        botType,
      },
    };
  } else if (message.voice) {
    messageType = 'audio';
    attachments = {
      audio: {
        fileId: message.voice.file_id,
        fileUniqueId: message.voice.file_unique_id,
        duration: message.voice.duration || 0,
        mimeType: message.voice.mime_type || 'audio/ogg',
        size: message.voice.file_size || null,
        voice: true,
        botType,
      },
    };
  } else if (message.audio) {
    messageType = 'audio';
    attachments = {
      audio: {
        fileId: message.audio.file_id,
        fileUniqueId: message.audio.file_unique_id,
        duration: message.audio.duration || 0,
        mimeType: message.audio.mime_type || null,
        size: message.audio.file_size || null,
        filename: message.audio.file_name || null,
        botType,
      },
    };
  } else if (message.video) {
    messageType = 'video';
    attachments = {
      video: {
        fileId: message.video.file_id,
        fileUniqueId: message.video.file_unique_id,
        duration: message.video.duration || 0,
        width: message.video.width || null,
        height: message.video.height || null,
        mimeType: message.video.mime_type || 'video/mp4',
        size: message.video.file_size || null,
        filename: message.video.file_name || null,
        botType,
      },
    };
  } else if (message.document) {
    messageType = 'document';
    attachments = {
      document: {
        fileId: message.document.file_id,
        fileUniqueId: message.document.file_unique_id,
        filename: message.document.file_name || 'Файл',
        mimeType: message.document.mime_type || null,
        size: message.document.file_size || null,
        botType,
      },
    };
  }

  if (message.reply_to_message) {
    const replied = message.reply_to_message;
    attachments = {
      ...(attachments || {}),
      _reply: {
        externalMessageId: String(replied.message_id || ''),
        authorName: displayNameFromTelegram(replied.from || replied.sender_chat || {}),
        content: String(replied.text || replied.caption || '').trim() || 'Вложение',
      },
    };
  }

  return { messageType, attachments, text };
};

module.exports = { displayNameFromTelegram, parseTelegramMessage };
