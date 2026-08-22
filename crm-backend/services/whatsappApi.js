const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

const getToken = () => String(process.env.WHATSAPP_TOKEN || '').trim();
const getPhoneNumberId = () => String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const getBusinessPhoneNumber = () => String(
  process.env.WHATSAPP_BUSINESS_PHONE
  || process.env.WHATSAPP_PHONE_NUMBER
  || ''
).replace(/[^\d]/g, '');

const assertConfigured = () => {
  if (!getToken()) throw new Error('WHATSAPP_TOKEN is not configured');
  if (!getPhoneNumberId()) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured');
};

const whatsappRequest = async (path, payload = {}, options = {}) => {
  assertConfigured();
  const url = path.startsWith('http')
    ? path
    : `${GRAPH_BASE_URL}/${String(path || '').replace(/^\/+/, '')}`;
  try {
    const response = await axios({
      method: options.method || 'post',
      url,
      data: payload,
      params: options.params,
      timeout: options.timeout || 30000,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers || {}),
      },
      responseType: options.responseType,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    const details = error?.response?.data?.error;
    if (details?.message) {
      error.message = details.message;
      error.whatsappDescription = details.message;
    }
    throw error;
  }
};

const sendWhatsAppText = async (to, text) => {
  const result = await whatsappRequest(`${getPhoneNumberId()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to),
    type: 'text',
    text: { preview_url: false, body: String(text || '') },
  });
  return { message_id: result?.messages?.[0]?.id || '' };
};

const uploadWhatsAppMedia = async ({ filePath, mimeType }) => {
  assertConfigured();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', fs.createReadStream(filePath), {
    contentType: mimeType || 'application/octet-stream',
  });
  const response = await axios.post(`${GRAPH_BASE_URL}/${getPhoneNumberId()}/media`, form, {
    timeout: 120000,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return response.data?.id;
};

const resolveMediaType = (method, field, mimeType) => {
  const methodName = String(method || '').toLowerCase();
  const fieldName = String(field || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (methodName.includes('photo') || methodName.includes('image') || fieldName === 'photo' || fieldName === 'image') return 'image';
  if (methodName.includes('video') || fieldName === 'video' || mime.startsWith('video/')) return 'video';
  if (methodName.includes('voice') || methodName.includes('audio') || fieldName === 'voice' || fieldName === 'audio' || mime.startsWith('audio/')) return 'audio';
  return 'document';
};

const sendWhatsAppFile = async ({
  chatId,
  filePath,
  fileName,
  mimeType,
  method,
  field,
  caption,
}) => {
  const mediaType = resolveMediaType(method, field, mimeType);
  const mediaId = await uploadWhatsAppMedia({ filePath, mimeType });
  const mediaPayload = { id: mediaId };
  if (caption && mediaType !== 'audio') mediaPayload.caption = String(caption);
  if (fileName && mediaType === 'document') mediaPayload.filename = String(fileName);
  const result = await whatsappRequest(`${getPhoneNumberId()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(chatId),
    type: mediaType,
    [mediaType]: mediaPayload,
  });
  const messageType = mediaType === 'document' ? 'document' : mediaType;
  return {
    message_id: result?.messages?.[0]?.id || mediaId,
    text: caption || '',
    messageType,
    attachments: {
      [messageType]: {
        fileId: mediaId,
        filename: fileName || null,
        mimeType: mimeType || null,
        caption: caption || '',
        provider: 'whatsapp',
      },
    },
  };
};

const getWhatsAppFile = async (mediaId) =>
  whatsappRequest(String(mediaId), {}, { method: 'get' });

const downloadWhatsAppFile = async (mediaUrl) => {
  assertConfigured();
  return axios.get(String(mediaUrl), {
    responseType: 'stream',
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
};

const getWhatsAppWebhookVerifyToken = () => String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();

const verifyWebhookSignature = (req) => {
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) return true;
  const signature = String(req.headers['x-hub-signature-256'] || '');
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody || Buffer.from('')).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

const getPersonalInviteSecret = () => String(
  process.env.WHATSAPP_PERSONAL_INVITE_SECRET
  || process.env.WHATSAPP_WEBHOOK_SECRET
  || getToken()
  || ''
).trim();

const signPersonalInvite = (body) =>
  crypto.createHmac('sha256', getPersonalInviteSecret()).update(body).digest('hex').slice(0, 20);

const createPersonalInvitePayload = (userId, ttlDays = 30) => {
  const numericUserId = Number(userId || 0);
  if (!numericUserId || !getPersonalInviteSecret()) return null;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + Math.max(1, Number(ttlDays || 30)) * 86400;
  const body = `${numericUserId.toString(36)}_${expiresAtSeconds.toString(36)}`;
  return {
    payload: `p_${body}_${signPersonalInvite(body)}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
};

const verifyPersonalInvitePayload = (payload) => {
  const match = /^p_([0-9a-z]+)_([0-9a-z]+)_([0-9a-f]{20})$/i.exec(String(payload || ''));
  if (!match || !getPersonalInviteSecret()) return null;
  const body = `${match[1]}_${match[2]}`;
  const expected = signPersonalInvite(body);
  const received = match[3].toLowerCase();
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
  const userId = parseInt(match[1], 36);
  const expiresAtSeconds = parseInt(match[2], 36);
  if (!userId || !expiresAtSeconds || expiresAtSeconds < Math.floor(Date.now() / 1000)) return null;
  return { userId, expiresAt: new Date(expiresAtSeconds * 1000) };
};

module.exports = {
  getToken,
  getPhoneNumberId,
  getBusinessPhoneNumber,
  getWhatsAppWebhookVerifyToken,
  verifyWebhookSignature,
  whatsappRequest,
  sendWhatsAppText,
  sendWhatsAppFile,
  getWhatsAppFile,
  downloadWhatsAppFile,
  createPersonalInvitePayload,
  verifyPersonalInvitePayload,
};
