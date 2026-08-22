const displayNameFromWhatsApp = (contact = {}, fallback = '') => {
  const profileName = String(contact?.profile?.name || '').trim();
  const waId = String(contact?.wa_id || contact?.from || fallback || '').trim();
  return profileName || (waId ? `+${waId}` : 'WhatsApp');
};

const mediaAttachment = (kind, media = {}) => ({
  [kind]: {
    fileId: media.id || null,
    mimeType: media.mime_type || media.mimeType || null,
    sha256: media.sha256 || null,
    filename: media.filename || null,
    caption: media.caption || '',
    provider: 'whatsapp',
  },
});

const parseWhatsAppMessage = (message = {}) => {
  if (message.attachments && message.messageType) {
    return {
      messageType: message.messageType,
      attachments: message.attachments,
      text: String(message.text || ''),
    };
  }

  const type = String(message.type || 'text');
  if (type === 'text') {
    return {
      messageType: 'text',
      attachments: null,
      text: String(message.text?.body || message.text || ''),
    };
  }
  if (type === 'image') {
    return {
      messageType: 'image',
      attachments: mediaAttachment('image', message.image),
      text: String(message.image?.caption || ''),
    };
  }
  if (type === 'audio' || type === 'voice') {
    return {
      messageType: 'audio',
      attachments: mediaAttachment('audio', message.audio || message.voice),
      text: '',
    };
  }
  if (type === 'video') {
    return {
      messageType: 'video',
      attachments: mediaAttachment('video', message.video),
      text: String(message.video?.caption || ''),
    };
  }
  if (type === 'document') {
    return {
      messageType: 'document',
      attachments: mediaAttachment('document', message.document),
      text: String(message.document?.caption || ''),
    };
  }

  return {
    messageType: 'text',
    attachments: null,
    text: `[WhatsApp: ${type}]`,
  };
};

module.exports = { displayNameFromWhatsApp, parseWhatsAppMessage };
