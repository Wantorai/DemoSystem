// crm-frontend/src/components/webchats/MaxChatMessages.jsx
'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useContext, useMemo } from 'react';
import ChatFooter from '@/components/webchats/ChatFooter';
import { AuthContext } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { useWebSocket } from '@/components/webchats/SocketProvider';
import { IoDownloadOutline, IoOpenOutline } from 'react-icons/io5';
import MessageContextMenu from '@/components/webchats/MessageContextMenu';
import ForwardToRoomModal from '@/components/webchats/ForwardToRoomModal';
import { formatChatTime } from '@/components/webchats/dateFormat';

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '⚡️', '😂', '😢', '😡', '🚀', '🤝', '💪', '💯', '✅', '🆗'];

const getMediaDuration = (file) => new Promise((resolve) => {
  if (!file || typeof document === 'undefined') {
    resolve(0);
    return;
  }

  const media = document.createElement(file.type?.startsWith('video/') ? 'video' : 'audio');
  const objectUrl = URL.createObjectURL(file);
  const cleanup = () => {
    URL.revokeObjectURL(objectUrl);
    media.removeAttribute('src');
    media.load();
  };

  media.preload = 'metadata';
  media.onloadedmetadata = () => {
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    cleanup();
    resolve(duration);
  };
  media.onerror = () => {
    cleanup();
    resolve(0);
  };
  media.src = objectUrl;
});

const CP1251_SPECIAL_BYTES = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  '‰': 0x89, '‹': 0x8B, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '›': 0x9B, '№': 0xB9,
};

const mojibakeStringToBytes = (value) => Uint8Array.from(String(value || ''), (char) => {
  if (CP1251_SPECIAL_BYTES[char] !== undefined) return CP1251_SPECIAL_BYTES[char];
  const code = char.charCodeAt(0);
  if (code >= 0x0410 && code <= 0x044F) return code - 0x0350;
  if (code === 0x0401) return 0xA8;
  if (code === 0x0451) return 0xB8;
  return code & 0xFF;
});

export default function MaxChatMessages({ internalId, chatInfo, provider = 'max' }) {
  const [messages, setMessages] = useState([]);
  // const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');  
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [menuMessage, setMenuMessage] = useState(null);
  const [replyDraft, setReplyDraft] = useState(null);
  const [forwardMessageDraft, setForwardMessageDraft] = useState(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const { user, token } = useContext(AuthContext);
  const { socket } = useWebSocket();
  
  const messagesListRef = useRef(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL
  const providerBase = `${apiBase}/${provider}/chats`;
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );
  const externalMessageIdField = provider === 'telegram' ? 'telegramMessageId' : 'maxMessageId';
  const getProviderFileUrl = useCallback((attachment) => {
    if (!attachment) return null;
    if (provider === 'telegram' && attachment.fileId) {
      const botType = attachment.botType === 'personal' ? 'personal' : 'business';
      return `${apiBase}/telegram/files/${encodeURIComponent(attachment.fileId)}?botType=${botType}`;
    }
    return attachment.url || null;
  }, [apiBase, provider]);
  const getFileActionUrl = useCallback((url, { download = false, filename = '' } = {}) => {
    if (!url || provider !== 'telegram') return url;
    const params = new URLSearchParams();
    if (download) params.set('download', '1');
    if (filename) params.set('filename', filename);
    const query = params.toString();
    if (!query) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
  }, [provider]);
  const decodeFileNameSafe = useCallback((name) => {
    const source = String(name || '');
    if (!source) return '';
    let decoded = source;
    try {
      decoded = decodeURIComponent(source);
    } catch {}

    const cyrillicMojibakeMarkers = decoded.match(/[РС]/g) || [];
    const looksMojibake = /[ÃÐÑ]/.test(decoded)
      || (cyrillicMojibakeMarkers.length >= 2 && /[РС][А-Яа-яЁё]/.test(decoded));
    if (looksMojibake && typeof TextDecoder !== 'undefined') {
      try {
        const bytes = mojibakeStringToBytes(decoded);
        const restored = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (restored) return restored;
      } catch {}
    }
    return decoded;
  }, []);
  const renderTextWithLinks = useCallback((value) => {
    const source = String(value || '');
    if (!source) return null;
    const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
    const exactUrlRegex = /^(?:https?:\/\/|www\.)[^\s<]+$/i;
    const lines = source.split('\n');
    return lines.map((line, lineIndex) => {
      const chunks = line.split(urlRegex);
      return (
        <React.Fragment key={`line-${lineIndex}`}>
          {chunks.map((chunk, chunkIndex) => {
            if (!chunk) return null;
            if (exactUrlRegex.test(chunk)) {
              const href = chunk.startsWith('www.') ? `https://${chunk}` : chunk;
              return (
                <a
                  key={`url-${lineIndex}-${chunkIndex}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#1d4ed8', textDecoration: 'underline' }}
                >
                  {chunk}
                </a>
              );
            }
            return <React.Fragment key={`txt-${lineIndex}-${chunkIndex}`}>{chunk}</React.Fragment>;
          })}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </React.Fragment>
      );
    });
  }, []);
  const upsertIncomingMaxMessage = useCallback((incoming) => {
    if (!incoming || typeof incoming !== 'object') return;
    setMessages((prev) => {
      const incomingId = Number(incoming?.id || 0);
      const incomingMaxId = String(incoming?.[externalMessageIdField] || '');

      const idx = prev.findIndex((m) => {
        const mid = Number(m?.id || 0);
        const mMaxId = String(m?.[externalMessageIdField] || '');
        if (incomingId > 0 && mid > 0 && incomingId === mid) return true;
        if (incomingMaxId && mMaxId && incomingMaxId === mMaxId) return true;
        return false;
      });

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...incoming };
        return next;
      }

      return [...prev, incoming];
    });
  }, [externalMessageIdField]);

  useEffect(() => {
    if (!socket || !internalId) return undefined;
    const chatNum = Number(internalId || 0);
    if (!chatNum) return undefined;

    socket.emit(`${provider}:join`, chatNum);
    return () => {
      socket.emit(`${provider}:leave`, chatNum);
    };
  }, [socket, internalId, provider]);


  useEffect(() => {
    if (!socket || !internalId) return undefined;

    const onMaxNewMessage = (payload) => {
      try {
        const payloadChatId = Number(payload?.chatId || 0);
        const currentChatId = Number(internalId || 0);
        if (!payloadChatId || !currentChatId || payloadChatId !== currentChatId) return;

        const incoming = payload?.message;
        if (!incoming) return;

        upsertIncomingMaxMessage(incoming);

        if (incoming?.fromMe === false) {
          fetch(`${providerBase}/${internalId}/read`, {
            method: 'PUT',
            headers: authHeaders,
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[MaxChatMessages] onMaxNewMessage failed', e);
      }
    };
    const onMessageDeleted = (payload) => {
      try {
        const payloadChatId = Number(payload?.chatId || 0);
        const currentChatId = Number(internalId || 0);
        if (!payloadChatId || !currentChatId || payloadChatId !== currentChatId) return;
        const messageId = Number(payload?.messageId || 0);
        if (!messageId) return;
        setMessages((prev) => prev.filter((msg) => Number(msg?.id || 0) !== messageId));
      } catch (e) {
        console.warn('[MaxChatMessages] onMessageDeleted failed', e);
      }
    };
    const onReactionUpdated = (payload) => {
      const payloadChatId = Number(payload?.chatId || 0);
      if (payloadChatId !== Number(internalId || 0) || !payload?.message) return;
      upsertIncomingMaxMessage(payload.message);
    };

    socket.on(`${provider}:new-message`, onMaxNewMessage);
    socket.on(`${provider}:message-deleted`, onMessageDeleted);
    socket.on(`${provider}:message-reaction-updated`, onReactionUpdated);
    return () => {
      socket.off(`${provider}:new-message`, onMaxNewMessage);
      socket.off(`${provider}:message-deleted`, onMessageDeleted);
      socket.off(`${provider}:message-reaction-updated`, onReactionUpdated);
    };
  }, [socket, internalId, provider, providerBase, authHeaders, upsertIncomingMaxMessage]);

  //console.log('user = ', user)

  // Загружаем сообщения
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      
      // Запрашиваем сообщения
      const response = await fetch(`${providerBase}/${internalId}/messages`, {
        headers: authHeaders,
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
    } finally {
      setLoading(false);
    }
  }, [internalId, providerBase, authHeaders]);


  // Первоначальная загрузка
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);


  // Мгновенно открываем список внизу без видимого плавного скролла.
  const messageCount = messages.length;
  useLayoutEffect(() => {
    const list = messagesListRef.current;
    if (!list || messageCount === 0) return;
    list.scrollTop = list.scrollHeight;
    const raf = requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [internalId, messageCount]);



  // Отправка сообщения
  const handleSendMessage = async () => {
    // console.log('handleSendMessage start')
    // console.log('internalId = ', internalId)

    try {
      setSending(true);

      //console.log('try post')
      
      const response = await fetch(`${providerBase}/${internalId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          mChatId: internalId,
          text,
          type: 'text',
          senderName: user?.name, // Или имя пользователя
          senderId: user?.id,
          replyToMessageId: replyDraft?.messageId || null,
        })
      });
      
      if (response.ok) {
        setText('');
        setReplyDraft(null);
        const data = await response.json();
        upsertIncomingMaxMessage(data?.message || data);
      }
    } catch (err) {
      console.error('Ошибка отправки:', err);
    } finally {
      setSending(false);
    }
  };



  // Функция для отправки голосового сообщения
  const handleSendVoice = async (blob, durationSeconds = 0) => {
    try {
      const formData = new FormData();
      
      // Создаем файл из Blob
      const audioFile = new File([blob], `voice_${Date.now()}.webm`, {
        type: 'audio/webm'
      });
      
      // Добавляем файл
      formData.append('audio', audioFile);
      
      // Добавляем метаданные об отправителе
      formData.append('senderName', user.name);
      formData.append('senderId', user.id);
      if (durationSeconds > 0) {
        formData.append('duration', String(Math.round(durationSeconds)));
      }
      if (replyDraft?.messageId) formData.append('replyToMessageId', String(replyDraft.messageId));
      
      const response = await fetch(`${providerBase}/${internalId}/send-audio`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
        // Не устанавливаем Content-Type заголовок - браузер сделает это сам
      });
      
      const data = await response.json();
      if (response.ok) {
        upsertIncomingMaxMessage(data);
        setReplyDraft(null);
      }
    } catch (err) {
      console.error('Ошибка отправки голосового:', err);
    }
  };

  // Функция для отправки файлов
  const handleFileUpload = async (file) => {
    try {
      const formData = new FormData();
      // Добавляем файл
      formData.append('file', file);
      
      // Добавляем метаданные об отправителе
      formData.append('senderName', user.name);
      formData.append('senderId', user.id);
      if (replyDraft?.messageId) formData.append('replyToMessageId', String(replyDraft.messageId));
      
      // Определяем тип файла и отправляем на соответствующий эндпоинт
      let endpoint = '';
      if (file.type.startsWith('image/')) {
        endpoint = 'send-image';
        formData.delete('file');
        formData.append('image', file);
        formData.append('text', '');
      } else if (file.type.startsWith('audio/')) {
        endpoint = 'send-audio';
        formData.delete('file');
        formData.append('audio', file);
        const duration = await getMediaDuration(file);
        if (duration > 0) formData.append('duration', String(Math.round(duration)));
      } else if (file.type.startsWith('video/')) {
        endpoint = 'send-video';
        formData.delete('file');
        formData.append('video', file);
        const duration = await getMediaDuration(file);
        if (duration > 0) formData.append('duration', String(Math.round(duration)));
      } else {
        endpoint = 'send-file';
      }

      // console.log('endpoint = ', endpoint)
      // console.log('formData = ', formData)
      
      const response = await fetch(`${providerBase}/${internalId}/${endpoint}`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      
      const data = await response.json();

      //console.log('data receive =', data)

      if (response.ok) {
        upsertIncomingMaxMessage(data);
        setReplyDraft(null);
      } else {
        throw new Error(data?.error || data?.message || 'Не удалось отправить файл');
      }
    } catch (err) {
      console.error('Ошибка отправки файла:', err);
      toast.error('Не удалось отправить файл');
    }
  };



  // Форматирование времени
  const formatTime = (timestamp) => formatChatTime(timestamp);

  // Форматирование размера файла
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
  };

  // Определяем тип сообщения
  const getMessageType = (msg) => {
    if (msg.messageType) return msg.messageType;
    if (msg.type) return msg.type;
    return 'text';
  };

  const getReadableMessageText = useCallback((msg) => String(
    msg?.text ||
    msg?.content ||
    msg?.caption ||
    ''
  ).trim(), []);

  const getMessageActionUrl = useCallback((msg) => {
    if (!msg) return '';
    const type = getMessageType(msg);
    if (type === 'image') {
      const raw = getProviderFileUrl(msg.attachments?.image) || msg.fileUrl || msg.imageUrl;
      if (!raw) return '';
      return provider === 'telegram' ? raw : `${apiBase}/proxy/max-image?url=${encodeURIComponent(raw)}`;
    }
    if (type === 'video') {
      const raw = getProviderFileUrl(msg.attachments?.video) || msg.fileUrl || msg.videoUrl;
      if (!raw) return '';
      return provider === 'telegram' ? raw : `${apiBase}/proxy/max-video?url=${encodeURIComponent(raw)}`;
    }
    if (type === 'audio') {
      const raw = getProviderFileUrl(msg.attachments?.audio) || msg.fileUrl || msg.audioUrl;
      if (!raw) return '';
      return provider === 'telegram' ? raw : `${apiBase}/proxy/audio-web?url=${encodeURIComponent(raw)}`;
    }
    if (type === 'file' || type === 'document') {
      const raw = msg.fileUrl || getProviderFileUrl(msg.attachments?.document) || getProviderFileUrl(msg.attachments?.file);
      if (!raw) return '';
      return provider === 'telegram' ? raw : `${apiBase}/proxy/max-file?url=${encodeURIComponent(raw)}`;
    }
    return '';
  }, [apiBase, getProviderFileUrl, provider]);

  const openMessageContextMenu = useCallback((event, msg) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuMessage(msg);
    setMenuPos({ x: event.clientX + 6, y: event.clientY + 6 });
    setMenuVisible(true);
  }, []);

  const closeMessageContextMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  const handleMenuCopy = useCallback(async () => {
    const value = getReadableMessageText(menuMessage) || getMessageActionUrl(menuMessage);
    if (!value) {
      toast.info('Нечего копировать');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.info('Скопировано');
    } catch (err) {
      console.warn('copy failed', err);
      toast.error('Не удалось скопировать');
    }
  }, [getMessageActionUrl, getReadableMessageText, menuMessage]);

  const handleMenuPaste = useCallback(async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value) {
        toast.info('Буфер пуст');
        return;
      }
      setText((current) => String(current || '').trim() ? `${current}\n${value}` : value);
    } catch (err) {
      console.warn('paste failed', err);
      toast.error('Ошибка буфера обмена');
    }
  }, []);

  const handleMenuReply = useCallback(() => {
    if (!menuMessage?.id) return;
    const type = getMessageType(menuMessage);
    const fallback = type === 'image' ? 'Изображение'
      : type === 'video' ? 'Видео'
      : type === 'audio' ? 'Аудиосообщение'
      : type === 'document' ? 'Файл'
      : 'Сообщение';
    setReplyDraft({
      messageId: menuMessage.id,
      authorName: menuMessage.fromMe
        ? (menuMessage.senderName || user?.name || 'Вы')
        : (menuMessage.senderName || chatInfo?.username || 'Собеседник'),
      content: getReadableMessageText(menuMessage) || fallback,
      type,
    });
  }, [chatInfo?.username, getReadableMessageText, menuMessage, user?.name]);

  const handleReaction = useCallback(async (emoji, message = menuMessage) => {
    if (!emoji || !message?.id) return;
    try {
      const response = await fetch(
        `${providerBase}/${encodeURIComponent(String(internalId))}/messages/${encodeURIComponent(String(message.id))}/reaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ emoji }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не удалось поставить реакцию');
      upsertIncomingMaxMessage(data?.message || data);
    } catch (error) {
      console.warn('external reaction failed', error);
      toast.error(error?.message || 'Не удалось поставить реакцию');
    }
  }, [authHeaders, internalId, menuMessage, providerBase, upsertIncomingMaxMessage]);

  const scrollToRepliedMessage = useCallback((reply) => {
    if (!reply) return;
    const localId = Number(reply.messageId || 0);
    const externalId = String(reply.externalMessageId || '');
    const targetMessage = messages.find((item) => (
      (localId > 0 && Number(item?.id || 0) === localId)
      || (externalId && String(item?.[externalMessageIdField] || '') === externalId)
    ));
    if (!targetMessage?.id) {
      toast.info('Исходное сообщение не загружено');
      return;
    }
    const target = document.getElementById(`${provider}-message-${targetMessage.id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('search-highlight');
    window.setTimeout(() => target.classList.remove('search-highlight'), 1800);
  }, [externalMessageIdField, messages, provider]);

  const handleMenuShare = useCallback(async () => {
    const value = getReadableMessageText(menuMessage) || getMessageActionUrl(menuMessage);
    if (!value) {
      toast.info('Нечего пересылать');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: provider === 'telegram' ? 'Telegram сообщение' : 'MAX сообщение', text: value });
      } else {
        await navigator.clipboard.writeText(value);
        toast.info('Текст скопирован для пересылки');
      }
    } catch (err) {
      console.warn('share failed', err);
      toast.error('Не удалось переслать');
    }
  }, [getMessageActionUrl, getReadableMessageText, menuMessage, provider]);

  const getForwardFileName = useCallback((msg) => {
    const type = getMessageType(msg);
    const attachment =
      type === 'image' ? msg?.attachments?.image
      : type === 'video' ? msg?.attachments?.video
      : type === 'audio' ? msg?.attachments?.audio
      : msg?.attachments?.document || msg?.attachments?.file;
    return decodeFileNameSafe(
      msg?.fileName ||
      attachment?.filename ||
      attachment?.name ||
      `${provider}-${type || 'file'}-${msg?.id || Date.now()}${type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : type === 'audio' ? '.m4a' : ''}`
    );
  }, [decodeFileNameSafe, provider]);

  const getForwardMessageType = useCallback((msg) => {
    const type = getMessageType(msg);
    if (type === 'image' || type === 'video' || type === 'audio') return type;
    if (type === 'document') return 'document';
    const name = String(getForwardFileName(msg) || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name)) return 'image';
    if (/\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(name)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(name)) return 'audio';
    if (/\.(pdf|docx?|xlsx?|pptx?|txt|rtf|csv)$/i.test(name)) return 'document';
    return 'file';
  }, [getForwardFileName]);

  const getForwardMimeType = useCallback((messageType, fileName, blobType = '') => {
    if (blobType) return blobType;
    const name = String(fileName || '').toLowerCase();
    if (messageType === 'image') return name.endsWith('.png') ? 'image/png' : 'image/jpeg';
    if (messageType === 'video') return name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
    if (messageType === 'audio') return name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
    if (name.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }, []);

  const sendForwardTextToRoom = useCallback(async (targetRoomId, content) => {
    const trimmed = String(content || '').trim();
    if (!trimmed) return null;
    const response = await fetch(`${apiBase}/admin/rooms/${encodeURIComponent(String(targetRoomId))}/messages`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      credentials: token ? 'omit' : 'include',
      body: JSON.stringify({
        content: trimmed,
        type: 'text',
        roomId: targetRoomId,
        userId: user?.id,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось отправить текст');
    return data;
  }, [apiBase, authHeaders, token, user?.id]);

  const sendForwardFileToRoom = useCallback(async (targetRoomId, msg) => {
    const sourceUrl = getMessageActionUrl(msg);
    if (!sourceUrl) return null;
    const messageType = getForwardMessageType(msg);
    const fileName = getForwardFileName(msg);
    const sourceResponse = await fetch(sourceUrl, { credentials: token ? 'omit' : 'include' });
    if (!sourceResponse.ok) throw new Error(`Не удалось скачать вложение: ${sourceResponse.status}`);
    const blob = await sourceResponse.blob();
    const file = new File([blob], fileName || `forward-${Date.now()}`, {
      type: getForwardMimeType(messageType, fileName, blob.type),
    });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('roomId', String(targetRoomId));
    fd.append('userId', String(user?.id ?? '0'));
    fd.append('messageType', messageType || 'file');
    fd.append('type', messageType || 'file');
    const response = await fetch(`${apiBase}/uploadfiles/fileFromWebchat`, {
      method: 'POST',
      headers: authHeaders,
      credentials: token ? 'omit' : 'include',
      body: fd,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось отправить вложение');
    return data;
  }, [apiBase, authHeaders, getForwardFileName, getForwardMessageType, getForwardMimeType, getMessageActionUrl, token, user?.id]);

  const handleMenuForward = useCallback(() => {
    if (!menuMessage) return;
    setForwardMessageDraft(menuMessage);
  }, [menuMessage]);

  const closeForwardModal = useCallback(() => {
    if (!forwardBusy) setForwardMessageDraft(null);
  }, [forwardBusy]);

  const forwardDraftToRoom = useCallback(async (room) => {
    const targetRoomId = Number(room?.id || 0);
    if (!targetRoomId || !forwardMessageDraft) return;
    const textPayload = getReadableMessageText(forwardMessageDraft);
    const fileUrl = getMessageActionUrl(forwardMessageDraft);
    if (!textPayload && !fileUrl) {
      toast.info('Нечего пересылать');
      return;
    }
    try {
      setForwardBusy(true);
      if (textPayload) await sendForwardTextToRoom(targetRoomId, textPayload);
      if (fileUrl) await sendForwardFileToRoom(targetRoomId, forwardMessageDraft);
      toast.success('Сообщение переслано');
      setForwardMessageDraft(null);
    } catch (error) {
      console.error('forward external message failed', error);
      toast.error(error?.message || 'Не удалось переслать сообщение');
    } finally {
      setForwardBusy(false);
    }
  }, [forwardMessageDraft, getMessageActionUrl, getReadableMessageText, sendForwardFileToRoom, sendForwardTextToRoom]);

  const handleMenuSave = useCallback(() => {
    const url = getMessageActionUrl(menuMessage);
    if (!url) {
      toast.info('Нет файла для сохранения');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [getMessageActionUrl, menuMessage]);

  const canDeleteMessage = useCallback((message) => (
    Boolean(
      message?.fromMe
      && user?.id != null
      && Number(message?.senderId || 0) === Number(user.id)
    )
  ), [user?.id]);

  const handleMenuDelete = useCallback(async () => {
    if (!menuMessage?.id || !internalId) return;
    if (!canDeleteMessage(menuMessage)) {
      toast.info('Можно удалить только своё сообщение');
      return;
    }
    const ok = window.confirm('Удалить сообщение из истории этого чата?');
    if (!ok) return;
    try {
      const response = await fetch(
        `${providerBase}/${encodeURIComponent(String(internalId))}/messages/${encodeURIComponent(String(menuMessage.id))}`,
        {
          method: 'DELETE',
          headers: authHeaders,
          credentials: token ? 'omit' : 'include',
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || 'Не удалось удалить сообщение');
      setMessages((prev) => prev.filter((msg) => Number(msg?.id || 0) !== Number(menuMessage.id)));
      toast.success('Сообщение удалено');
    } catch (error) {
      console.error('delete external message failed', error);
      toast.error(error?.message || 'Не удалось удалить сообщение');
    }
  }, [authHeaders, canDeleteMessage, internalId, menuMessage, providerBase, token]);

  // Рендер контента сообщения
  const renderMessageContent = (msg) => {
    const type = getMessageType(msg);
    const isOutgoing = msg.fromMe || msg.isOutgoing;

    // console.log('msg = ', msg)

    switch (type) {
      case 'text':
        return (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {renderTextWithLinks(msg.text || msg.content || '')}
            {/* {msg.updatedAt && msg.updatedAt !== msg.createdAt && (
              <span style={{ 
                fontSize: '10px', 
                color: isOutgoing ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
                marginLeft: '4px'
              }}>
                (изменено: {formatTime(msg.updatedAt)})
              </span>
            )} */}
          </div>
        );

      case 'audio':
        // Получаем объект аудио-вложения
        const audioAttach = msg.attachments?.audio;
        let audioUrl = null;
        
        const rawAudioUrl = getProviderFileUrl(audioAttach);
        if (rawAudioUrl) {
          if (provider === 'telegram') {
            audioUrl = rawAudioUrl;
          } else {
            // Используем ваш прокси, передавая исходный URL как параметр
            // Убедитесь, что apiBase настроен корректно (содержит /api, если нужно)
            audioUrl = `${apiBase}/proxy/audio-web?url=${encodeURIComponent(rawAudioUrl)}`;
          }
        }
        
        // Если после этого audioUrl остался null, можно попробовать fallback на старые поля
        if (!audioUrl) {
            audioUrl = msg.fileUrl || msg.audioUrl;
            // И если эти поля есть, тоже лучше пропустить через прокси для консистентности
            if (audioUrl && audioUrl.startsWith('http')) {
                audioUrl = `${apiBase}/proxy/audio-web?url=${encodeURIComponent(audioUrl)}`;
            }
        }

        // console.log('audioUrl = ', audioUrl)

        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: 'min(480px, 65vw)',
            minWidth: 0,
            padding: '4px 6px',
            border: '0.5px solid rgba(75, 85, 99, 0.55)',
            borderRadius: '6px',
            backgroundColor: '#d1d5db',
            boxSizing: 'border-box',
          }}>
            {audioUrl ? (
              <div style={{
                flex: 1,
                minWidth: 220,
                overflow: 'hidden',
                border: '0.5px solid rgba(156, 163, 175, 0.55)',
                borderRadius: 6,
                backgroundColor: '#e5e7eb',
                boxShadow: 'none',
              }}>
                <audio
                  controls
                  src={audioUrl}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 34,
                    border: 0,
                    outline: 0,
                    backgroundColor: 'transparent',
                  }}
                />
              </div>
            ) : (
              <div style={{ 
                padding: '8px 12px',
                backgroundColor: isOutgoing ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                borderRadius: '8px'
              }}>
                🔊 Аудио сообщение
              </div>
            )}
            {Number(msg.attachments?.audio?.duration) > 0 && (
              <span style={{ 
                fontSize: '11px',
                color: '#374151',
                whiteSpace: 'nowrap',
              }}>
                {Math.floor(msg.attachments.audio.duration / 60)}:
                {String(Math.floor(msg.attachments.audio.duration % 60)).padStart(2, '0')}
              </span>
            )}
          </div>
        );

      case 'image':
        // Определяем src на основе структуры вложения
        let imageSrc = null;
        const imgAttach = msg.attachments?.image;
        
        const rawImageUrl = getProviderFileUrl(imgAttach);
        if (rawImageUrl) {
          if (provider === 'telegram') {
            imageSrc = rawImageUrl;
          } else {
            // Используем ваш прокси, передавая исходный URL как параметр
            imageSrc = `${apiBase}/proxy/max-image?url=${encodeURIComponent(rawImageUrl)}`;
          }
        }


        if (imageSrc && imageSrc.startsWith('http://')) {
            imageSrc = imageSrc.replace('http://', 'https://');
        }

        // console.log('imageSrc = ', imageSrc)                
        
        if (!imageSrc) {
          return <div>Изображение не найдено</div>;
        }
        const imageFileName = decodeFileNameSafe(
          imgAttach?.filename || `telegram-image-${msg.telegramMessageId || msg.id || 'file'}.jpg`
        );
        const imageOpenUrl = getFileActionUrl(imageSrc, { filename: imageFileName });
        const imageDownloadUrl = getFileActionUrl(imageSrc, {
          download: true,
          filename: imageFileName,
        });

        return (
          <div style={{ marginTop: '4px', maxWidth: '320px', position: 'relative' }}>
            <a 
              href={imageOpenUrl}
              target="_blank" 
              rel="noopener noreferrer"
              style={{ display: 'block' }}
            >
              <div style={{ 
                position: 'relative',
                display: 'inline-block',
                maxWidth: '300px',
                maxHeight: '320px',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt={msg.attachments?.image?.filename || 'Изображение'}
                  style={{
                    display: 'block',
                    width: 'auto',
                    height: 'auto',
                    maxWidth: '300px',
                    maxHeight: '320px',
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div style="padding: 20px; background: #f0f0f0; border-radius: 8px; color: #666;">Изображение не загружено</div>';
                  }}
                />
              </div>
            </a>
            <a
              href={imageDownloadUrl}
              title="Скачать изображение"
              aria-label="Скачать изображение"
              style={{
                position: 'absolute',
                bottom: 6,
                right: 6,
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #60a5fa',
                borderRadius: 6,
                color: '#2563eb',
                backgroundColor: 'rgba(255,255,255,0.94)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              <IoDownloadOutline size={20} />
            </a>
            {msg.attachments?.image?.filename && (
              <div style={{ 
                fontSize: '11px', 
                color: isOutgoing ? '#000)' : '#000',
                marginTop: '4px'
              }}>
                {msg.attachments.image.filename}
              </div>
            )}
          </div>
        );

      case 'video':
        const rawVideoUrl = getProviderFileUrl(msg.attachments?.video) || msg.fileUrl || msg.videoUrl;
        let videoSrc = null;

        if (rawVideoUrl) {
          videoSrc = provider === 'telegram'
            ? rawVideoUrl
            : apiBase + '/proxy/max-video?url=' + encodeURIComponent(rawVideoUrl);
          if (videoSrc.startsWith('http://')) {
            videoSrc = videoSrc.replace('http://', 'https://');
          }
        }

        if (!videoSrc) {
          return <div>Видео не найдено</div>;
        }

        return (
          <div style={{ marginTop: '4px' }}>
            <video
              controls
              playsInline
              src={videoSrc}
              preload="metadata"
              style={{
                width: 'min(480px, 65vw)',
                maxWidth: '100%',
                height: 'auto',
                maxHeight: '320px',
                borderRadius: '6px',
                backgroundColor: '#000'
              }}
            />
            {msg.fileName && (
              <div style={{ 
                fontSize: '11px', 
                color: isOutgoing ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
                marginTop: '4px'
              }}>
                {msg.fileName}
              </div>
            )}
          </div>
        );

      case 'file':
      case 'document':
        const rawFileSrc =
          msg.fileUrl ||
          getProviderFileUrl(msg.attachments?.document) ||
          getProviderFileUrl(msg.attachments?.file);
        let fileSrc = rawFileSrc || null;
        if (provider !== 'telegram' && fileSrc && /^https?:\/\//i.test(fileSrc)) {
          fileSrc = `${apiBase}/proxy/max-file?url=${encodeURIComponent(fileSrc)}`;
          if (fileSrc.startsWith('http://')) {
            fileSrc = fileSrc.replace('http://', 'https://');
          }
        }
        const fileNameRaw = msg.fileName || msg.attachments?.document?.filename || msg.attachments?.file?.name || 'Файл';
        const fileName = decodeFileNameSafe(fileNameRaw);
        const fileSize = msg.fileSize || msg.attachments?.document?.size || msg.attachments?.file?.size;
        const fileOpenUrl = getFileActionUrl(fileSrc, { filename: fileName });
        const fileDownloadUrl = getFileActionUrl(fileSrc, { download: true, filename: fileName });

        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: isOutgoing ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            borderRadius: '8px',
            border: `1px solid ${isOutgoing ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`
          }}>
            <div style={{ fontSize: '24px' }}>
              {fileName.match(/\.(pdf)$/i) ? '📄' :
               fileName.match(/\.(doc|docx)$/i) ? '📝' :
               fileName.match(/\.(xls|xlsx)$/i) ? '📊' :
               fileName.match(/\.(zip|rar|7z)$/i) ? '🗜️' :
               '📎'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {fileOpenUrl ? (
                <a
                  href={fileOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    color: '#111827',
                    fontWeight: 600,
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: 'underline',
                  }}
                >
                  {fileName}
                </a>
              ) : (
                <div style={{ fontWeight: 600 }}>{fileName}</div>
              )}
              {fileSize && (
                <div style={{ fontSize: '11px', opacity: 0.7 }}>
                  {formatFileSize(fileSize)}
                </div>
              )}
            </div>
            {fileOpenUrl && (
              <a
                href={fileOpenUrl}
                target="_blank" 
                rel="noopener noreferrer"
                title="Открыть файл"
                aria-label="Открыть файл"
                style={{
                  width: 30,
                  height: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1px solid #60a5fa',
                  borderRadius: 6,
                  color: '#2563eb',
                  backgroundColor: '#fff',
                }}
              >
                <IoOpenOutline size={19} />
              </a>
            )}
            {fileDownloadUrl && (
              <a
                href={fileDownloadUrl}
                title="Скачать файл"
                aria-label="Скачать файл"
                style={{
                  width: 30,
                  height: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1px solid #60a5fa',
                  borderRadius: 6,
                  color: '#2563eb',
                  backgroundColor: '#fff',
                }}
              >
                <IoDownloadOutline size={19} />
              </a>
            )}
          </div>
        );

      default:
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: isOutgoing ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            borderRadius: '8px',
            border: `1px solid ${isOutgoing ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`
          }}>
            <div>📎</div>
            <div>{renderTextWithLinks(msg.text || msg.content || 'Вложение')}</div>
          </div>
        );
    }
  };




    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);
    const audioInputRef = useRef(null);

  // console.log('messages = ', messages)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>


      {/* Скрытые input'ы для загрузки файлов */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileSelect(e, 'file')}
        style={{ display: 'none' }}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => handleFileSelect(e, 'image')}
        style={{ display: 'none' }}
        accept="image/*"
      />
      <input
        type="file"
        ref={audioInputRef}
        onChange={(e) => handleFileSelect(e, 'audio')}
        style={{ display: 'none' }}
        accept="audio/*"
      />


      {/* Список сообщений */}
      <div 
        ref={messagesListRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#f8f8f8'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
            Загрузка сообщений...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <p>Нет сообщений. Начните общение!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOutgoing = msg.fromMe || msg.isOutgoing;
            const author = msg.senderName || 'не найден'
            const displayName = isOutgoing
              ? author
              : (chatInfo?.username || 'Неизвестный');
            //console.log('author = ', author)
            return (
                <div
                key={msg.id || msg[externalMessageIdField] || index}
                id={msg.id ? `${provider}-message-${msg.id}` : undefined}
                data-message-id={msg.id || ''}
                data-external-message-id={msg[externalMessageIdField] || ''}
                onContextMenu={(event) => openMessageContextMenu(event, msg)}
                style={{
                    marginBottom: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOutgoing ? 'flex-end' : 'flex-start'
                }}
                >

                  <div
                    style={{
                      backgroundColor: isOutgoing ? '#dcfce7' : '#FFFFFF',
                      color: isOutgoing ? '#000' : '#000000',
                      borderRadius: isOutgoing ? '18px 18px 0 18px' : '18px 18px 18px 0',
                      padding: '8px 10px',
                      maxWidth: '70%',
                      border: '1px solid rgba(107, 114, 128, 0.42)',
                      boxShadow: 'none',
                      position: 'relative'
                    }}
                  >
                   
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 16,
                        marginBottom: 4,
                        color: '#000',
                    }}>
                      <span style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        fontSize: 14,
                        fontWeight: 600,
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {displayName}
                      </span>
                      <span style={{
                        flexShrink: 0,
                        color: 'rgba(0,0,0,0.55)',
                        fontSize: 11,
                        fontWeight: 400,
                        lineHeight: 1,
                      }}>
                        {formatTime(msg.timestamp || msg.createdAt)}
                      </span>
                      </div>

                    {msg.attachments?._reply && (
                      <div
                        role="button"
                        tabIndex={0}
                        title="Перейти к исходному сообщению"
                        onClick={(event) => {
                          event.stopPropagation();
                          scrollToRepliedMessage(msg.attachments._reply);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          scrollToRepliedMessage(msg.attachments._reply);
                        }}
                        style={{
                          marginBottom: 7,
                          padding: '6px 8px',
                          borderLeft: '3px solid #60a5fa',
                          borderRadius: 6,
                          background: 'rgba(255,255,255,0.55)',
                          fontSize: 12,
                          lineHeight: 1.35,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#2563eb' }}>
                          {msg.attachments._reply.authorName || 'Сообщение'}
                        </div>
                        <div style={{ color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.attachments._reply.content || 'Исходное сообщение недоступно'}
                        </div>
                      </div>
                    )}


                        {/* Контент сообщения */}
                        {renderMessageContent(msg)}

                        {Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                            {msg.reactions.map((reaction) => (
                              <button
                                key={`${msg.id}-reaction-${reaction.emoji}`}
                                type="button"
                                onClick={() => handleReaction(reaction.emoji, msg)}
                                title={`Реакция ${reaction.emoji}`}
                                style={{
                                  minHeight: 22,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  border: `1px solid ${reaction.reactedByMe ? '#60a5fa' : 'rgba(107, 114, 128, 0.30)'}`,
                                  background: reaction.reactedByMe ? '#eff6ff' : 'rgba(255,255,255,0.72)',
                                  color: '#000000',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  lineHeight: 1,
                                }}
                              >
                                {reaction.emoji} {reaction.count}
                              </button>
                            ))}
                          </div>
                        )}
                        
                    </div>
                </div>
            );
          })
        )}
      </div>

      <MessageContextMenu
        x={menuPos.x}
        y={menuPos.y}
        visible={menuVisible}
        onClose={closeMessageContextMenu}
        onReply={handleMenuReply}
        onCopy={handleMenuCopy}
        onDelete={handleMenuDelete}
        onPaste={handleMenuPaste}
        onForward={handleMenuForward}
        onShare={handleMenuShare}
        onSave={handleMenuSave}
        onReact={(emoji) => handleReaction(emoji)}
        reactionEmojis={REACTION_EMOJIS}
        activeReactions={(menuMessage?.reactions || []).filter((reaction) => reaction?.reactedByMe).map((reaction) => reaction.emoji)}
        disabled={{
          copy: !getReadableMessageText(menuMessage) && !getMessageActionUrl(menuMessage),
          delete: !menuMessage?.id || !canDeleteMessage(menuMessage),
          paste: !navigator.clipboard,
          forward: !getReadableMessageText(menuMessage) && !getMessageActionUrl(menuMessage),
          share: !getReadableMessageText(menuMessage) && !getMessageActionUrl(menuMessage),
          save: !getMessageActionUrl(menuMessage),
        }}
        variant="external"
        allowReply
        allowReactions
      />
      <ForwardToRoomModal
        visible={Boolean(forwardMessageDraft)}
        apiBase={apiBase}
        token={token}
        busy={forwardBusy}
        onClose={closeForwardModal}
        onSelectRoom={forwardDraftToRoom}
      />

        {/* footer */}
        <ChatFooter
            text={text}
            setText={setText}
            sendMessage={handleSendMessage}
            onFile={handleFileUpload}
            onSendVoice={handleSendVoice}
            sending={sending}
            replyDraft={replyDraft}
            onCancelReply={() => setReplyDraft(null)}
            // editingMessage={editingMessage}
            // cancelEdit={cancelEdit} 
        />

    </div>
  );
}




