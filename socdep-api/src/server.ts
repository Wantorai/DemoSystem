import 'dotenv/config';
import Busboy from 'busboy';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';

type Attachment = {
  buffer?: Buffer;
  mimeType?: string;
  name?: string;
  type?: 'image' | 'video';
  uri?: string;
};

type CreateTelegramPostBody = {
  text?: string;
  attachments?: Attachment[];
  messageId?: string;
  messageIds?: Array<number | string>;
};

type CreatePostBody = CreateTelegramPostBody;

type MutatePostBody = {
  messageId?: string;
  messageIds?: Array<number | string>;
  text?: string;
};

type StoredPost = {
  attachmentTypes: string[];
  comments: number;
  date: string;
  mediaGroupId?: string;
  messageIds: number[];
  reactions: number;
  text: string;
};

type StoredMaxPost = {
  attachmentTypes: string[];
  chatId?: number | string;
  date: string;
  messageId?: string;
  text: string;
  views?: number;
};

type StoredVkPost = {
  attachmentTypes: string[];
  date: string;
  postId?: number;
  text: string;
};

type StoredMaxEvent = {
  chatId?: number | string;
  date: string;
  messageId?: string;
  summary: string;
  type: string;
  updateId: number | string;
};

type StoredTelegramEvent = {
  chatId?: number | string;
  count?: number;
  date: string;
  messageId?: number;
  relatedMessageId?: number;
  summary: string;
  type: string;
  updateId: number;
};

const port = Number(process.env.PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const telegramWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const maxBotToken = process.env.MAX_BOT_TOKEN;
const maxChatId = process.env.MAX_CHAT_ID;
const maxChannelLink = process.env.MAX_CHANNEL_LINK;
const maxWebhookSecret = process.env.MAX_WEBHOOK_SECRET;
const maxWebhookUrl = process.env.MAX_WEBHOOK_URL;
const vkAccessToken = process.env.VK_ACCESS_TOKEN;
const vkGroupId = process.env.VK_GROUP_ID;
const vkGroupScreenName = process.env.VK_GROUP_SCREEN_NAME;
const postsStorePath = join(process.cwd(), 'data', 'telegram-posts.json');
const eventsStorePath = join(process.cwd(), 'data', 'telegram-events.json');
const maxPostsStorePath = join(process.cwd(), 'data', 'max-posts.json');
const maxEventsStorePath = join(process.cwd(), 'data', 'max-events.json');
const vkPostsStorePath = join(process.cwd(), 'data', 'vk-posts.json');
const maxApiBaseUrl = 'https://platform-api2.max.ru';
const vkApiBaseUrl = 'https://api.vk.com/method';
const vkApiVersion = '5.199';

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'socdep-api',
        maxConfigured: Boolean(maxBotToken && (maxChatId || maxChannelLink)),
        telegramConfigured: Boolean(telegramBotToken && telegramChatId),
        vkConfigured: Boolean(vkAccessToken && (vkGroupId || vkGroupScreenName)),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/telegram/overview') {
      const overview = await getTelegramOverview();
      sendJson(response, 200, overview);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/telegram/webhook/status') {
      const status = await getTelegramWebhookStatus();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/telegram/webhook/setup') {
      const status = await setupTelegramWebhook();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (!isValidTelegramWebhookRequest(request)) {
        sendJson(response, 401, { ok: false, error: 'Invalid Telegram webhook secret.' });
        return;
      }

      const update = await readJsonBody<Record<string, unknown>>(request);
      await storeTelegramUpdate(update);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/telegram/posts') {
      const body = await readPostBody(request);
      const text = body.text?.trim() ?? '';
      const attachments = body.attachments ?? [];

      if (!text && attachments.length === 0) {
        sendJson(response, 400, { ok: false, error: 'Post text or attachments are required.' });
        return;
      }

      if (!telegramBotToken || !telegramChatId) {
        sendJson(response, 202, {
          ok: true,
          mode: 'draft',
          message: 'Telegram credentials are not configured on the server.',
          post: { text, attachments },
        });
        return;
      }

      const telegramResult = await sendTelegramPost(text, attachments);
      await storePublishedPost(text, attachments, telegramResult);

      sendJson(response, 201, {
        ok: true,
        mode: 'published',
        telegram: telegramResult,
      });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/telegram/posts') {
      const body = await readJsonBody<MutatePostBody>(request);
      const text = body.text?.trim() ?? '';
      const messageIds = normalizeRequestMessageIds(body);

      if (!text) {
        sendJson(response, 400, { ok: false, error: 'Post text is required.' });
        return;
      }

      if (messageIds.length === 0) {
        sendJson(response, 400, { ok: false, error: 'Telegram message IDs are required.' });
        return;
      }

      const telegramResult = await editTelegramPost(messageIds, text);
      await updateStoredTelegramPost(messageIds, text);

      sendJson(response, 200, { ok: true, telegram: telegramResult });
      return;
    }

    if (request.method === 'DELETE' && url.pathname === '/telegram/posts') {
      const body = await readJsonBody<MutatePostBody>(request);
      const messageIds = normalizeRequestMessageIds(body);

      if (messageIds.length === 0) {
        sendJson(response, 400, { ok: false, error: 'Telegram message IDs are required.' });
        return;
      }

      const telegramResult = await deleteTelegramPost(messageIds);
      await deleteStoredTelegramPost(messageIds);

      sendJson(response, 200, { ok: true, telegram: telegramResult });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/max/overview') {
      const overview = await getMaxOverview();
      sendJson(response, 200, overview);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/max/webhook/status') {
      const status = await getMaxWebhookStatus();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/max/webhook/setup') {
      const status = await setupMaxWebhook();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/max/webhook') {
      if (!isValidMaxWebhookRequest(request)) {
        sendJson(response, 401, { ok: false, error: 'Invalid MAX webhook secret.' });
        return;
      }

      const update = await readJsonBody<Record<string, unknown>>(request);
      await storeMaxUpdate(update);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/max/posts') {
      const body = await readPostBody(request);
      const text = body.text?.trim() ?? '';
      const attachments = body.attachments ?? [];

      if (!text && attachments.length === 0) {
        sendJson(response, 400, { ok: false, error: 'Post text or attachments are required.' });
        return;
      }

      if (!maxBotToken || (!maxChatId && !maxChannelLink)) {
        sendJson(response, 202, {
          ok: true,
          mode: 'draft',
          message: 'MAX credentials are not configured on the server.',
          post: { text, attachments },
        });
        return;
      }

      const maxResult = await sendMaxPost(text, attachments);
      await storePublishedMaxPost(text, attachments, maxResult);

      sendJson(response, 201, {
        ok: true,
        max: maxResult,
        mode: 'published',
      });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/max/posts') {
      const replacesAttachments = (request.headers['content-type'] ?? '').includes('multipart/form-data');
      const body = await readPostBody(request) as MutatePostBody & CreatePostBody;
      const text = body.text?.trim() ?? '';
      const messageId = body.messageId ?? String(body.messageIds?.[0] ?? '');
      const attachments = replacesAttachments ? body.attachments ?? [] : undefined;

      if (!text) {
        sendJson(response, 400, { ok: false, error: 'Post text is required.' });
        return;
      }

      if (!messageId) {
        sendJson(response, 400, { ok: false, error: 'MAX message ID is required.' });
        return;
      }

      const maxResult = await editMaxPost(messageId, text, attachments);
      await updateStoredMaxPost(messageId, text, attachments?.map((attachment) => attachment.type ?? 'file'));

      sendJson(response, 200, { ok: true, max: maxResult });
      return;
    }

    if (request.method === 'DELETE' && url.pathname === '/max/posts') {
      const body = await readJsonBody<MutatePostBody>(request);
      const messageId = body.messageId ?? String(body.messageIds?.[0] ?? '');

      if (!messageId) {
        sendJson(response, 400, { ok: false, error: 'MAX message ID is required.' });
        return;
      }

      const maxResult = await deleteMaxPost(messageId);
      await deleteStoredMaxPost(messageId);

      sendJson(response, 200, { ok: true, max: maxResult });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/vk/overview') {
      const overview = await getVkOverview();
      sendJson(response, 200, overview);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/vk/posts') {
      const body = await readPostBody(request);
      const text = body.text?.trim() ?? '';
      const attachments = body.attachments ?? [];

      if (!text && attachments.length === 0) {
        sendJson(response, 400, { ok: false, error: 'Post text or attachments are required.' });
        return;
      }

      if (!vkAccessToken || (!vkGroupId && !vkGroupScreenName)) {
        sendJson(response, 202, {
          ok: true,
          mode: 'draft',
          message: 'VK credentials are not configured on the server.',
          post: { text, attachments },
        });
        return;
      }

      const vkResult = await sendVkPost(text, attachments);
      await storePublishedVkPost(text, attachments, vkResult);

      sendJson(response, 201, {
        ok: true,
        mode: 'published',
        vk: vkResult,
      });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/vk/posts') {
      const body = await readJsonBody<MutatePostBody>(request);
      const text = body.text?.trim() ?? '';
      const postId = Number(body.messageId ?? body.messageIds?.[0] ?? NaN);

      if (!text) {
        sendJson(response, 400, { ok: false, error: 'Post text is required.' });
        return;
      }

      if (!Number.isFinite(postId)) {
        sendJson(response, 400, { ok: false, error: 'VK post ID is required.' });
        return;
      }

      const vkResult = await editVkPost(postId, text);
      await updateStoredVkPost(postId, text);

      sendJson(response, 200, { ok: true, vk: vkResult });
      return;
    }

    if (request.method === 'DELETE' && url.pathname === '/vk/posts') {
      const body = await readJsonBody<MutatePostBody>(request);
      const postId = Number(body.messageId ?? body.messageIds?.[0] ?? NaN);

      if (!Number.isFinite(postId)) {
        sendJson(response, 400, { ok: false, error: 'VK post ID is required.' });
        return;
      }

      const vkResult = await deleteVkPost(postId);
      await deleteStoredVkPost(postId);

      sendJson(response, 200, { ok: true, vk: vkResult });
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Route not found.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    sendJson(response, 500, { ok: false, error: message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`socdep-api listening on http://0.0.0.0:${port}`);
});

function setCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', corsOrigin);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

async function readPostBody(request: IncomingMessage): Promise<CreateTelegramPostBody> {
  const contentType = request.headers['content-type'] ?? '';

  if (contentType.includes('multipart/form-data')) {
    return readMultipartBody(request);
  }

  return readJsonBody<CreatePostBody>(request);
}

async function readMultipartBody(request: IncomingMessage): Promise<CreateTelegramPostBody> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string[]> = {};
    const attachments: Attachment[] = [];
    let fileIndex = 0;
    const parser = Busboy({
      headers: request.headers,
      limits: {
        fileSize: 50 * 1024 * 1024,
        files: 10,
      },
    });

    parser.on('field', (name, value) => {
      fields[name] = [...(fields[name] ?? []), value];
    });

    parser.on('file', (name, file, info) => {
      if (name !== 'attachments') {
        file.resume();
        return;
      }

      const chunks: Buffer[] = [];
      const attachmentIndex = fileIndex;
      fileIndex += 1;

      file.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.on('limit', () => reject(new Error('Attachment file is too large.')));
      file.on('end', () => {
        const explicitType = fields.attachmentTypes?.[attachmentIndex] as Attachment['type'] | undefined;
        attachments.push({
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType,
          name: info.filename,
          type: explicitType ?? (info.mimeType.startsWith('video/') ? 'video' : 'image'),
        });
      });
    });

    parser.on('error', reject);
    parser.on('finish', () => {
      resolve({
        attachments,
        messageId: fields.messageId?.[0],
        messageIds: fields.messageIds,
        text: fields.text?.[0],
      });
    });

    request.pipe(parser);
  });
}

async function sendTelegramPost(text: string, attachments: Attachment[]) {
  const uploadedAttachments = attachments.filter((attachment) => attachment.buffer);

  if (uploadedAttachments.length > 1) {
    return sendTelegramMediaGroup(text, uploadedAttachments);
  }

  const uploadedAttachment = uploadedAttachments[0];

  if (uploadedAttachment) {
    return sendTelegramMedia(text, uploadedAttachment);
  }

  return sendTelegramMessage(text || 'SocDep post');
}

async function getTelegramOverview() {
  const posts = await readStoredPosts();
  const events = await readStoredEvents();
  const enrichedPosts = enrichPostsWithEvents(posts, events);

  if (!telegramBotToken || !telegramChatId) {
    return {
      ok: true,
      channel: null,
      events: events.slice(0, 20),
      metrics: buildMetrics(enrichedPosts, events, null),
      posts: enrichedPosts,
      telegramConfigured: false,
    };
  }

  const [chatResult, memberCountResult] = await Promise.allSettled([
    callTelegramApi('getChat', { chat_id: telegramChatId }),
    callTelegramApi('getChatMemberCount', { chat_id: telegramChatId }),
  ]);

  const chat = chatResult.status === 'fulfilled' ? (chatResult.value as Record<string, unknown>) : null;
  const memberCount = memberCountResult.status === 'fulfilled' ? Number(memberCountResult.value) : null;

  return {
    ok: true,
    channel: chat
      ? {
          id: chat.id,
          title: chat.title,
          type: chat.type,
          username: chat.username,
        }
      : null,
    events: events.slice(0, 20),
    metrics: buildMetrics(enrichedPosts, events, memberCount),
    posts: enrichedPosts,
    telegramConfigured: true,
    unavailable: {
      comments: 'Telegram Bot API does not expose channel comment counts by message lookup.',
      reactions: 'Telegram Bot API can receive reaction updates, but does not provide historical reaction totals by message lookup.',
      views: 'Telegram Bot API does not provide a get-message endpoint for refreshing channel post views.',
    },
  };
}

async function getTelegramWebhookStatus() {
  const events = await readStoredEvents();

  if (!telegramBotToken) {
    return {
      ok: true,
      eventsStored: events.length,
      telegramConfigured: false,
      webhook: null,
    };
  }

  const webhook = await callTelegramApi('getWebhookInfo', {});

  return {
    ok: true,
    eventsStored: events.length,
    telegramConfigured: true,
    webhook,
  };
}

async function setupTelegramWebhook() {
  if (!telegramBotToken) {
    return {
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured.',
    };
  }

  if (!telegramWebhookUrl) {
    return {
      ok: false,
      error: 'TELEGRAM_WEBHOOK_URL is not configured.',
    };
  }

  const webhook = await callTelegramApi('setWebhook', {
    allowed_updates: [
      'message',
      'edited_message',
      'channel_post',
      'edited_channel_post',
      'message_reaction',
      'message_reaction_count',
    ],
    drop_pending_updates: false,
    secret_token: telegramWebhookSecret,
    url: telegramWebhookUrl,
  });

  return {
    ok: true,
    webhook,
  };
}

function buildMetrics(posts: StoredPost[], events: StoredTelegramEvent[], memberCount: number | null) {
  const mediaPosts = posts.filter((post) => post.attachmentTypes.length > 0).length;
  const comments = posts.reduce((sum, post) => sum + post.comments, 0);
  const reactions = posts.reduce((sum, post) => sum + post.reactions, 0);

  return [
    {
      label: 'Подписчики',
      value: memberCount === null ? 'н/д' : String(memberCount),
      detail: memberCount === null ? 'Bot API не вернул счетчик' : 'getChatMemberCount',
    },
    {
      label: 'Посты SocDep',
      value: String(posts.length),
      detail: 'Сохранены backend-ом',
    },
    {
      label: 'Медиа-посты',
      value: String(mediaPosts),
      detail: 'Фото и видео',
    },
    {
      label: 'Реакции',
      value: String(reactions),
      detail: 'Из webhook updates',
    },
    {
      label: 'Комментарии',
      value: String(comments),
      detail: 'Из discussion updates',
    },
    {
      label: 'События',
      value: String(events.length),
      detail: 'С момента webhook',
    },
  ];
}

async function getMaxOverview() {
  const allStoredPosts = await readStoredMaxPosts();
  const events = await readStoredMaxEvents();

  if (!maxBotToken || (!maxChatId && !maxChannelLink)) {
    return {
      channel: null,
      events: events.slice(0, 20),
      maxConfigured: false,
      metrics: buildMaxMetrics(allStoredPosts, events, null),
      ok: true,
      posts: allStoredPosts,
    };
  }

  const chat = await getMaxTargetChat().catch(() => null);
  const chatId = chat?.chat_id;
  const currentChatId = typeof chatId === 'number' || typeof chatId === 'string' ? chatId : maxChatId ?? null;
  const storedPosts = filterStoredMaxPostsForChat(allStoredPosts, currentChatId);
  const posts = await refreshMaxPostStats(storedPosts);
  const participantsCount = chat ? Number(chat.participants_count ?? NaN) : null;

  return {
    channel: chat
      ? {
          id: chat.chat_id,
          link: chat.link,
          title: chat.title,
          type: chat.type,
        }
      : null,
    events: events.slice(0, 20),
    maxConfigured: true,
    metrics: buildMaxMetrics(posts, events, Number.isFinite(participantsCount) ? participantsCount : null),
    ok: true,
    posts,
  };
}

function filterStoredMaxPostsForChat(posts: StoredMaxPost[], chatId: number | string | null) {
  if (chatId === null) {
    return posts;
  }

  const targetChatId = String(chatId);
  return posts.filter((post) => String(post.chatId ?? '') === targetChatId);
}

async function getMaxWebhookStatus() {
  const events = await readStoredMaxEvents();

  if (!maxBotToken) {
    return {
      eventsStored: events.length,
      maxConfigured: false,
      ok: true,
      subscriptions: null,
    };
  }

  const subscriptions = await callMaxApi('GET', '/subscriptions');

  return {
    eventsStored: events.length,
    maxConfigured: true,
    ok: true,
    subscriptions,
  };
}

async function setupMaxWebhook() {
  if (!maxBotToken) {
    return {
      error: 'MAX_BOT_TOKEN is not configured.',
      ok: false,
    };
  }

  if (!maxWebhookUrl) {
    return {
      error: 'MAX_WEBHOOK_URL is not configured.',
      ok: false,
    };
  }

  const subscription = await callMaxApi('POST', '/subscriptions', {
    secret: maxWebhookSecret,
    update_types: ['message_created', 'message_edited', 'message_removed', 'bot_started', 'bot_added'],
    url: maxWebhookUrl,
  });

  return {
    ok: true,
    subscription,
  };
}

function buildMaxMetrics(posts: StoredMaxPost[], events: StoredMaxEvent[], participantsCount: number | null) {
  const mediaPosts = posts.filter((post) => post.attachmentTypes.length > 0).length;
  const views = posts.reduce((sum, post) => sum + (post.views ?? 0), 0);

  return [
    {
      detail: participantsCount === null ? 'MAX API не вернул счетчик' : 'participants_count',
      label: 'Подписчики',
      value: participantsCount === null ? 'н/д' : String(participantsCount),
    },
    {
      detail: 'Сохранены backend-ом',
      label: 'Посты SocDep',
      value: String(posts.length),
    },
    {
      detail: 'Фото и видео',
      label: 'Медиа-посты',
      value: String(mediaPosts),
    },
    {
      detail: 'GET /messages stat.views',
      label: 'Просмотры',
      value: String(views),
    },
    {
      detail: 'Из MAX webhook',
      label: 'События',
      value: String(events.length),
    },
  ];
}

async function getVkOverview() {
  const posts = await readStoredVkPosts();

  if (!vkAccessToken || (!vkGroupId && !vkGroupScreenName)) {
    return {
      channel: null,
      metrics: buildVkMetrics(posts, null),
      ok: true,
      posts: normalizeStoredVkPosts(posts),
      vkConfigured: false,
    };
  }

  const group = await getVkTargetGroup().catch(() => null);
  const membersCount = group ? Number(group.members_count ?? NaN) : null;

  return {
    channel: group
      ? {
          id: group.id,
          link: group.screen_name ? `https://vk.com/${group.screen_name}` : undefined,
          title: group.name,
          type: group.type,
          username: group.screen_name,
        }
      : null,
    metrics: buildVkMetrics(posts, Number.isFinite(membersCount) ? membersCount : null),
    ok: true,
    posts: normalizeStoredVkPosts(posts),
    vkConfigured: true,
  };
}

function buildVkMetrics(posts: StoredVkPost[], membersCount: number | null) {
  const mediaPosts = posts.filter((post) => post.attachmentTypes.length > 0).length;

  return [
    {
      detail: membersCount === null ? 'VK API не вернул счетчик' : 'members_count',
      label: 'Подписчики',
      value: membersCount === null ? 'н/д' : String(membersCount),
    },
    {
      detail: 'Сохранены backend-ом',
      label: 'Посты SocDep',
      value: String(posts.length),
    },
    {
      detail: 'Фото',
      label: 'Медиа-посты',
      value: String(mediaPosts),
    },
    {
      detail: 'wall.post',
      label: 'Публикация',
      value: vkAccessToken ? 'API' : 'draft',
    },
  ];
}

function normalizeRequestMessageIds(body: MutatePostBody) {
  return (body.messageIds ?? (body.messageId ? [body.messageId] : []))
    .map((messageId) => Number(messageId))
    .filter((messageId) => Number.isFinite(messageId));
}

async function storePublishedPost(text: string, attachments: Attachment[], telegramResult: unknown) {
  const posts = await readStoredPosts();
  const messages = normalizeTelegramMessages(telegramResult);
  const storedPost: StoredPost = {
    attachmentTypes: attachments.map((attachment) => attachment.type ?? 'file'),
    comments: 0,
    date: new Date().toISOString(),
    mediaGroupId: messages.find((message) => message.media_group_id)?.media_group_id,
    messageIds: messages.map((message) => message.message_id).filter((messageId) => typeof messageId === 'number'),
    reactions: 0,
    text,
  };

  posts.unshift(storedPost);
  await writeStoredPosts(posts.slice(0, 50));
}

async function updateStoredTelegramPost(messageIds: number[], text: string) {
  const targetIds = new Set(messageIds);
  const posts = await readStoredPosts();
  const updatedPosts = posts.map((post) =>
    post.messageIds.some((messageId) => targetIds.has(messageId))
      ? {
          ...post,
          text,
        }
      : post
  );

  await writeStoredPosts(updatedPosts);
}

async function deleteStoredTelegramPost(messageIds: number[]) {
  const targetIds = new Set(messageIds);
  const posts = await readStoredPosts();
  await writeStoredPosts(posts.filter((post) => !post.messageIds.some((messageId) => targetIds.has(messageId))));
}

async function storePublishedMaxPost(text: string, attachments: Attachment[], maxResult: unknown) {
  const posts = await readStoredMaxPosts();
  const storedPost: StoredMaxPost = {
    attachmentTypes: attachments.map((attachment) => attachment.type ?? 'file'),
    chatId: await getMaxTargetChatId().catch(() => undefined),
    date: new Date().toISOString(),
    messageId: extractMaxMessageId(maxResult),
    text,
    views: extractMaxMessageViews(maxResult),
  };

  posts.unshift(storedPost);
  await writeStoredMaxPosts(posts.slice(0, 50));
}

async function updateStoredMaxPost(messageId: string, text: string, attachmentTypes?: string[]) {
  const posts = await readStoredMaxPosts();
  const updatedPosts = posts.map((post) =>
    post.messageId === messageId
      ? {
          ...post,
          attachmentTypes: attachmentTypes ?? post.attachmentTypes,
          text,
        }
      : post
  );

  await writeStoredMaxPosts(updatedPosts);
}

async function deleteStoredMaxPost(messageId: string) {
  const posts = await readStoredMaxPosts();
  await writeStoredMaxPosts(posts.filter((post) => post.messageId !== messageId));
}

async function storePublishedVkPost(text: string, attachments: Attachment[], vkResult: unknown) {
  const posts = await readStoredVkPosts();
  const postId = extractVkPostId(vkResult);
  const storedPost: StoredVkPost = {
    attachmentTypes: attachments.map((attachment) => attachment.type ?? 'file'),
    date: new Date().toISOString(),
    postId,
    text,
  };

  posts.unshift(storedPost);
  await writeStoredVkPosts(posts.slice(0, 50));
}

async function updateStoredVkPost(postId: number, text: string) {
  const posts = await readStoredVkPosts();
  const updatedPosts = posts.map((post) =>
    post.postId === postId
      ? {
          ...post,
          text,
        }
      : post
  );

  await writeStoredVkPosts(updatedPosts);
}

async function deleteStoredVkPost(postId: number) {
  const posts = await readStoredVkPosts();
  await writeStoredVkPosts(posts.filter((post) => post.postId !== postId));
}

function normalizeStoredVkPosts(posts: StoredVkPost[]) {
  return posts.map((post) => ({
    attachmentTypes: post.attachmentTypes,
    date: post.date,
    messageId: post.postId === undefined ? undefined : String(post.postId),
    messageIds: post.postId === undefined ? [] : [post.postId],
    text: post.text,
  }));
}

async function refreshMaxPostStats(posts: StoredMaxPost[]) {
  const messageIds = posts.map((post) => post.messageId).filter((messageId): messageId is string => Boolean(messageId));

  if (messageIds.length === 0) {
    return posts;
  }

  try {
    const messagesResult = await callMaxApi(
      'GET',
      `/messages?message_ids=${encodeURIComponent(messageIds.slice(0, 50).join(','))}`
    );
    const messages = isRecord(messagesResult) && Array.isArray(messagesResult.messages) ? messagesResult.messages : [];
    const statsByMessageId = new Map<string, { views?: number }>();

    for (const message of messages) {
      const messageId = extractMaxMessageId(message);

      if (!messageId) {
        continue;
      }

      statsByMessageId.set(messageId, {
        views: extractMaxMessageViews(message),
      });
    }

    const refreshedPosts = posts.map((post) => {
      if (!post.messageId) {
        return post;
      }

      const stats = statsByMessageId.get(post.messageId);

      return {
        ...post,
        views: stats?.views ?? post.views ?? 0,
      };
    });

    return refreshedPosts;
  } catch {
    return posts;
  }
}

async function storeTelegramUpdate(update: Record<string, unknown>) {
  const event = summarizeTelegramUpdate(update);

  if (!event) {
    return;
  }

  const events = await readStoredEvents();
  const exists = events.some((storedEvent) => storedEvent.updateId === event.updateId);

  if (exists) {
    return;
  }

  events.unshift(event);
  await writeStoredEvents(events.slice(0, 500));
}

async function storeMaxUpdate(update: Record<string, unknown>) {
  const event = summarizeMaxUpdate(update);

  if (!event) {
    return;
  }

  const events = await readStoredMaxEvents();
  const exists = events.some((storedEvent) => storedEvent.updateId === event.updateId);

  if (exists) {
    return;
  }

  events.unshift(event);
  await writeStoredMaxEvents(events.slice(0, 500));
}

function summarizeTelegramUpdate(update: Record<string, unknown>): StoredTelegramEvent | null {
  const updateId = Number(update.update_id);

  if (!Number.isFinite(updateId)) {
    return null;
  }

  if (isRecord(update.message_reaction_count)) {
    return summarizeReactionCountUpdate(updateId, update.message_reaction_count);
  }

  if (isRecord(update.message_reaction)) {
    return summarizeReactionUpdate(updateId, update.message_reaction);
  }

  if (isRecord(update.channel_post)) {
    return summarizeMessageUpdate(updateId, 'channel_post', update.channel_post);
  }

  if (isRecord(update.edited_channel_post)) {
    return summarizeMessageUpdate(updateId, 'edited_channel_post', update.edited_channel_post);
  }

  if (isRecord(update.message)) {
    return summarizeMessageUpdate(updateId, 'message', update.message);
  }

  if (isRecord(update.edited_message)) {
    return summarizeMessageUpdate(updateId, 'edited_message', update.edited_message);
  }

  return {
    date: new Date().toISOString(),
    summary: `Unhandled Telegram update: ${Object.keys(update).filter((key) => key !== 'update_id').join(', ') || 'empty'}`,
    type: 'unknown',
    updateId,
  };
}

function summarizeMaxUpdate(update: Record<string, unknown>): StoredMaxEvent | null {
  const updateId = getMaxUpdateId(update);

  if (updateId === undefined) {
    return null;
  }

  const updateType = typeof update.update_type === 'string' ? update.update_type : 'unknown';
  const message = isRecord(update.message) ? update.message : undefined;
  const chat = message && isRecord(message.recipient) ? message.recipient : undefined;
  const chatId = chat ? (chat.chat_id as number | string | undefined) : getMaxChatId(update);

  return {
    chatId,
    date: new Date().toISOString(),
    messageId: message ? extractMaxMessageId(message) : undefined,
    summary: getMaxUpdateSummary(updateType, message),
    type: updateType,
    updateId,
  };
}

function getMaxChatId(update: Record<string, unknown>) {
  const candidate = update.chat_id;
  return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : undefined;
}

function getMaxUpdateId(update: Record<string, unknown>) {
  const candidates = [update.update_id, update.timestamp, update.event_id];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return candidate;
    }
  }

  return undefined;
}

function getMaxUpdateSummary(updateType: string, message?: Record<string, unknown>) {
  const text = message && typeof message.body === 'object' && message.body !== null && 'text' in message.body
    ? String((message.body as { text?: unknown }).text ?? '')
    : '';

  return text ? `${updateType}: ${text.slice(0, 140)}` : updateType;
}

function summarizeReactionCountUpdate(updateId: number, payload: Record<string, unknown>): StoredTelegramEvent {
  const reactions = Array.isArray(payload.reactions) ? payload.reactions : [];
  const reactionCount = reactions.reduce((sum, reaction) => {
    if (!isRecord(reaction)) {
      return sum;
    }

    return sum + Number(reaction.total_count ?? 0);
  }, 0);

  return {
    chatId: getChatId(payload.chat),
    count: reactionCount,
    date: new Date().toISOString(),
    messageId: Number(payload.message_id),
    summary: `Reaction total: ${reactionCount}`,
    type: 'message_reaction_count',
    updateId,
  };
}

function summarizeReactionUpdate(updateId: number, payload: Record<string, unknown>): StoredTelegramEvent {
  const oldReaction = Array.isArray(payload.old_reaction) ? payload.old_reaction.length : 0;
  const newReaction = Array.isArray(payload.new_reaction) ? payload.new_reaction.length : 0;

  return {
    chatId: getChatId(payload.chat),
    date: new Date().toISOString(),
    messageId: Number(payload.message_id),
    summary: `Reaction changed: ${oldReaction} -> ${newReaction}`,
    type: 'message_reaction',
    updateId,
  };
}

function summarizeMessageUpdate(updateId: number, type: string, payload: Record<string, unknown>): StoredTelegramEvent {
  const text = getMessageText(payload);
  const relatedMessageId = getRelatedMessageId(payload);
  const isComment = type === 'message' && relatedMessageId !== undefined;

  return {
    chatId: getChatId(payload.chat),
    date: new Date().toISOString(),
    messageId: Number(payload.message_id),
    relatedMessageId,
    summary: isComment ? `Comment: ${text || 'media/comment update'}` : text || 'Message update',
    type: isComment ? 'comment' : type,
    updateId,
  };
}

function enrichPostsWithEvents(posts: StoredPost[], events: StoredTelegramEvent[]) {
  return posts.map((post) => {
    const messageIds = new Set(post.messageIds);
    const comments = events.filter((event) => event.type === 'comment' && event.relatedMessageId !== undefined && messageIds.has(event.relatedMessageId)).length;
    const latestReactionCount = events.find(
      (event) => event.type === 'message_reaction_count' && event.messageId !== undefined && messageIds.has(event.messageId)
    );
    const reactionChanges = events.filter(
      (event) => event.type === 'message_reaction' && event.messageId !== undefined && messageIds.has(event.messageId)
    ).length;
    const reactionTotal = latestReactionCount ? latestReactionCount.count ?? 0 : reactionChanges;

    return {
      ...post,
      comments,
      reactions: reactionTotal,
    };
  });
}

function getChatId(chat: unknown) {
  return isRecord(chat) ? (chat.id as number | string | undefined) : undefined;
}

function getMessageText(message: Record<string, unknown>) {
  const text = typeof message.text === 'string' ? message.text : '';
  const caption = typeof message.caption === 'string' ? message.caption : '';

  return (text || caption).slice(0, 140);
}

function getRelatedMessageId(message: Record<string, unknown>) {
  const replyToMessage = message.reply_to_message;

  if (!isRecord(replyToMessage)) {
    return undefined;
  }

  const forwardOrigin = replyToMessage.forward_origin;

  if (isRecord(forwardOrigin)) {
    const forwardedMessageId = Number(forwardOrigin.message_id);

    if (Number.isFinite(forwardedMessageId)) {
      return forwardedMessageId;
    }
  }

  const legacyForwardedMessageId = Number(replyToMessage.forward_from_message_id);

  if (Number.isFinite(legacyForwardedMessageId)) {
    return legacyForwardedMessageId;
  }

  const messageId = Number(replyToMessage.message_id);
  return Number.isFinite(messageId) ? messageId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTelegramWebhookRequest(request: IncomingMessage) {
  if (!telegramWebhookSecret) {
    return true;
  }

  return request.headers['x-telegram-bot-api-secret-token'] === telegramWebhookSecret;
}

function isValidMaxWebhookRequest(request: IncomingMessage) {
  if (!maxWebhookSecret) {
    return true;
  }

  return request.headers['x-max-bot-api-secret'] === maxWebhookSecret;
}

function normalizeTelegramMessages(telegramResult: unknown) {
  const result = telegramResult as { result?: unknown };
  const messages = Array.isArray(result.result) ? result.result : [result.result];

  return messages.filter(Boolean) as Array<{
    media_group_id?: string;
    message_id?: number;
  }>;
}

async function readStoredPosts(): Promise<StoredPost[]> {
  try {
    const raw = await readFile(postsStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredPost[];
    return Array.isArray(parsed)
      ? parsed.map((post) => ({
          ...post,
          comments: post.comments ?? 0,
          reactions: post.reactions ?? 0,
        }))
      : [];
  } catch {
    return [];
  }
}

async function writeStoredPosts(posts: StoredPost[]) {
  await mkdir(dirname(postsStorePath), { recursive: true });
  await writeFile(postsStorePath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

async function readStoredMaxPosts(): Promise<StoredMaxPost[]> {
  try {
    const raw = await readFile(maxPostsStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredMaxPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredMaxPosts(posts: StoredMaxPost[]) {
  await mkdir(dirname(maxPostsStorePath), { recursive: true });
  await writeFile(maxPostsStorePath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

async function readStoredVkPosts(): Promise<StoredVkPost[]> {
  try {
    const raw = await readFile(vkPostsStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredVkPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredVkPosts(posts: StoredVkPost[]) {
  await mkdir(dirname(vkPostsStorePath), { recursive: true });
  await writeFile(vkPostsStorePath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
}

async function readStoredEvents(): Promise<StoredTelegramEvent[]> {
  try {
    const raw = await readFile(eventsStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredTelegramEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredEvents(events: StoredTelegramEvent[]) {
  await mkdir(dirname(eventsStorePath), { recursive: true });
  await writeFile(eventsStorePath, `${JSON.stringify(events, null, 2)}\n`, 'utf8');
}

async function readStoredMaxEvents(): Promise<StoredMaxEvent[]> {
  try {
    const raw = await readFile(maxEventsStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredMaxEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredMaxEvents(events: StoredMaxEvent[]) {
  await mkdir(dirname(maxEventsStorePath), { recursive: true });
  await writeFile(maxEventsStorePath, `${JSON.stringify(events, null, 2)}\n`, 'utf8');
}

async function callTelegramApi(method: string, payload: Record<string, unknown>) {
  const response = await fetchWithRetry(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const telegramPayload = (await response.json()) as { ok?: boolean; result?: unknown };

  if (!response.ok || !telegramPayload.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(telegramPayload)}`);
  }

  return telegramPayload.result;
}

async function sendMaxPost(text: string, attachments: Attachment[]) {
  const uploadedAttachments = attachments.filter((attachment) => attachment.buffer).slice(0, 12);
  const maxAttachments = [];

  for (const attachment of uploadedAttachments) {
    maxAttachments.push(await uploadMaxAttachment(attachment));
  }

  return sendMaxMessageWithRetry({
    attachments: maxAttachments.length > 0 ? maxAttachments : undefined,
    text: text || undefined,
  });
}

async function editMaxPost(messageId: string, text: string, attachments?: Attachment[]) {
  const uploadedAttachments = attachments?.filter((attachment) => attachment.buffer).slice(0, 12) ?? [];
  const maxAttachments = [];

  for (const attachment of uploadedAttachments) {
    maxAttachments.push(await uploadMaxAttachment(attachment));
  }

  return callMaxApi('PUT', `/messages?message_id=${encodeURIComponent(messageId)}`, {
    attachments: attachments === undefined ? undefined : maxAttachments,
    text,
  });
}

async function deleteMaxPost(messageId: string) {
  return callMaxApi('DELETE', `/messages?message_id=${encodeURIComponent(messageId)}`);
}

async function uploadMaxAttachment(attachment: Attachment) {
  const type = attachment.type === 'video' ? 'video' : 'image';
  const uploadInfo = await callMaxApi('POST', `/uploads?type=${type}`) as Record<string, unknown>;
  const uploadUrl = typeof uploadInfo.url === 'string' ? uploadInfo.url : '';

  if (!uploadUrl) {
    throw new Error(`MAX upload error: ${JSON.stringify(uploadInfo)}`);
  }

  const formData = new FormData();
  formData.append(
    'data',
    createAttachmentBlob(attachment),
    attachment.name ?? (type === 'video' ? 'socdep-video.mp4' : 'socdep-image.jpg')
  );

  const uploadResponse = await fetchWithRetry(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const uploadPayload = await readMaxUploadResponse(uploadResponse);
  const payload = isRecord(uploadPayload) && Object.keys(uploadPayload).length > 0 ? uploadPayload : uploadInfo;

  return {
    payload,
    type,
  };
}

async function sendMaxMessageWithRetry(body: Record<string, unknown>, attempts = 4) {
  let lastPayload: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await callMaxApi('POST', `/messages?chat_id=${encodeURIComponent(await getMaxTargetChatId())}`, body, false);
    lastPayload = response;

    if (!isMaxAttachmentNotReady(response)) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
  }

  throw new Error(`MAX API error: ${JSON.stringify(lastPayload)}`);
}

async function getMaxTargetChatId() {
  if (maxChatId) {
    return maxChatId;
  }

  const chat = await getMaxTargetChat();
  const chatId = chat.chat_id;

  if (typeof chatId !== 'number' && typeof chatId !== 'string') {
    throw new Error(`MAX channel lookup did not return chat_id: ${JSON.stringify(chat)}`);
  }

  return String(chatId);
}

async function getMaxTargetChat() {
  if (maxChatId) {
    return callMaxApi('GET', `/chats/${encodeURIComponent(maxChatId)}`) as Promise<Record<string, unknown>>;
  }

  const link = normalizeMaxChannelLink(maxChannelLink ?? '');
  return callMaxApi('GET', `/chats/${encodeURIComponent(link)}`) as Promise<Record<string, unknown>>;
}

function normalizeMaxChannelLink(link: string) {
  return link.trim().replace(/^https?:\/\/max\.ru\//, '').replace(/^@/, '');
}

async function callMaxApi(method: string, path: string, body?: Record<string, unknown>, throwOnApiError = true) {
  if (!maxBotToken) {
    throw new Error('MAX_BOT_TOKEN is not configured.');
  }

  const response = await fetchWithRetry(`${maxApiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: maxBotToken,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as unknown;

  if (throwOnApiError && (!response.ok || isMaxErrorPayload(payload))) {
    throw new Error(`MAX API error: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function readMaxUploadResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as unknown;

  if (!response.ok) {
    throw new Error(`MAX upload error: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function isMaxErrorPayload(payload: unknown) {
  return isRecord(payload) && (typeof payload.error === 'string' || typeof payload.code === 'string' || payload.success === false);
}

function isMaxAttachmentNotReady(payload: unknown) {
  if (!isRecord(payload)) {
    return false;
  }

  return payload.code === 'attachment.not.ready' || String(payload.message ?? '').includes('attachment.file.not.processed');
}

function extractMaxMessageId(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const message = isRecord(payload.message) ? payload.message : payload;
  const body = isRecord(message.body) ? message.body : undefined;
  const candidates = [message.message_id, message.mid, message.id, body?.mid, body?.message_id];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
  }

  return undefined;
}

function extractMaxMessageViews(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const message = isRecord(payload.message) ? payload.message : payload;
  const stat = isRecord(message.stat) ? message.stat : undefined;
  const views = Number(stat?.views);

  return Number.isFinite(views) ? views : undefined;
}

async function sendVkPost(text: string, attachments: Attachment[]) {
  const groupId = await getVkTargetGroupId();
  const vkAttachments = await uploadVkWallAttachments(groupId, attachments);
  const payload = await callVkApi('wall.post', {
    attachments: vkAttachments.length > 0 ? vkAttachments.join(',') : undefined,
    from_group: 1,
    message: text || undefined,
    owner_id: -groupId,
  });

  return payload;
}

async function editVkPost(postId: number, text: string) {
  const groupId = await getVkTargetGroupId();

  return callVkApi('wall.edit', {
    message: text,
    owner_id: -groupId,
    post_id: postId,
  });
}

async function deleteVkPost(postId: number) {
  const groupId = await getVkTargetGroupId();

  return callVkApi('wall.delete', {
    owner_id: -groupId,
    post_id: postId,
  });
}

async function uploadVkWallAttachments(groupId: number, attachments: Attachment[]) {
  const vkAttachments = [];

  for (const attachment of attachments.slice(0, 10)) {
    if (attachment.type === 'video') {
      throw new Error('VK video upload is not implemented yet. Attach photos or publish text for VK.');
    }

    vkAttachments.push(await uploadVkWallPhoto(groupId, attachment));
  }

  return vkAttachments;
}

async function uploadVkWallPhoto(groupId: number, attachment: Attachment) {
  const uploadServer = await callVkApi('photos.getWallUploadServer', { group_id: groupId }) as Record<string, unknown>;
  const uploadUrl = typeof uploadServer.upload_url === 'string' ? uploadServer.upload_url : '';

  if (!uploadUrl) {
    throw new Error(`VK photo upload server error: ${JSON.stringify(uploadServer)}`);
  }

  const formData = new FormData();
  formData.append(
    'photo',
    createAttachmentBlob(attachment),
    attachment.name ?? 'socdep-photo.jpg'
  );

  const uploadResponse = await fetchWithRetry(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  const uploadPayload = await uploadResponse.json().catch(() => ({})) as Record<string, unknown>;

  if (!uploadResponse.ok || !uploadPayload.photo || !uploadPayload.server || !uploadPayload.hash) {
    throw new Error(`VK photo upload error: ${JSON.stringify(uploadPayload)}`);
  }

  const savedPhotos = await callVkApi('photos.saveWallPhoto', {
    group_id: groupId,
    hash: uploadPayload.hash,
    photo: uploadPayload.photo,
    server: uploadPayload.server,
  });
  const photo = Array.isArray(savedPhotos) ? savedPhotos[0] : undefined;

  if (!isRecord(photo)) {
    throw new Error(`VK photo save error: ${JSON.stringify(savedPhotos)}`);
  }

  const ownerId = photo.owner_id;
  const id = photo.id;

  if ((typeof ownerId !== 'number' && typeof ownerId !== 'string') || (typeof id !== 'number' && typeof id !== 'string')) {
    throw new Error(`VK photo save did not return owner_id/id: ${JSON.stringify(photo)}`);
  }

  return `photo${ownerId}_${id}`;
}

async function getVkTargetGroup() {
  if (vkGroupId && /^-?\d+$/.test(vkGroupId)) {
    const groups = await callVkApi('groups.getById', {
      fields: 'members_count',
      group_id: vkGroupId.replace(/^-/, ''),
    });
    return extractVkGroup(groups);
  }

  const screenName = normalizeVkGroupScreenName(vkGroupScreenName ?? vkGroupId ?? '');
  const groups = await callVkApi('groups.getById', {
    fields: 'members_count',
    group_id: screenName,
  });

  return extractVkGroup(groups);
}

async function getVkTargetGroupId() {
  if (vkGroupId && /^-?\d+$/.test(vkGroupId)) {
    return Math.abs(Number(vkGroupId));
  }

  const group = await getVkTargetGroup();
  const id = Number(group.id);

  if (!Number.isFinite(id)) {
    throw new Error(`VK group lookup did not return id: ${JSON.stringify(group)}`);
  }

  return Math.abs(id);
}

function normalizeVkGroupScreenName(value: string) {
  return value.trim()
    .replace(/^https?:\/\/m?\.vk\.com\//, '')
    .replace(/^@/, '')
    .split('?')[0]
    .replace(/^club/, '');
}

function extractVkGroup(payload: unknown) {
  const groups = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.groups) ? payload.groups : [];
  const group = groups[0];

  if (!isRecord(group)) {
    throw new Error(`VK group lookup error: ${JSON.stringify(payload)}`);
  }

  return group;
}

async function callVkApi(method: string, params: Record<string, unknown>) {
  if (!vkAccessToken) {
    throw new Error('VK_ACCESS_TOKEN is not configured.');
  }

  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      body.append(key, String(value));
    }
  }

  body.append('access_token', vkAccessToken);
  body.append('v', vkApiVersion);

  const response = await fetchWithRetry(`${vkApiBaseUrl}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json() as unknown;

  if (!response.ok || (isRecord(payload) && isRecord(payload.error))) {
    throw new Error(`VK API error: ${JSON.stringify(payload)}`);
  }

  return isRecord(payload) && 'response' in payload ? payload.response : payload;
}

function extractVkPostId(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const postId = Number(payload.post_id ?? payload.id);
  return Number.isFinite(postId) ? postId : undefined;
}

async function sendTelegramMessage(text: string) {
  const response = await fetchWithRetry(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  return readTelegramResponse(response);
}

async function editTelegramPost(messageIds: number[], text: string) {
  const posts = await readStoredPosts();
  const post = posts.find((storedPost) => storedPost.messageIds.some((messageId) => messageIds.includes(messageId)));
  const messageId = messageIds[0];
  const hasMedia = Boolean(post?.attachmentTypes.length);
  const method = hasMedia ? 'editMessageCaption' : 'editMessageText';
  const payload = hasMedia
    ? {
        caption: text,
        chat_id: telegramChatId,
        message_id: messageId,
      }
    : {
        chat_id: telegramChatId,
        disable_web_page_preview: true,
        message_id: messageId,
        text,
      };

  return callTelegramApi(method, payload);
}

async function deleteTelegramPost(messageIds: number[]) {
  const results = [];

  for (const messageId of messageIds) {
    results.push(await callTelegramApi('deleteMessage', {
      chat_id: telegramChatId,
      message_id: messageId,
    }));
  }

  return results;
}

async function sendTelegramMediaGroup(text: string, attachments: Attachment[]) {
  const formData = new FormData();
  const media = attachments.slice(0, 10).map((attachment, index) => {
    const fieldName = `file${index}`;
    formData.append(
      fieldName,
      createAttachmentBlob(attachment),
      attachment.name ?? (attachment.type === 'video' ? `socdep-video-${index + 1}.mp4` : `socdep-image-${index + 1}.jpg`)
    );

    return {
      caption: index === 0 && text ? text : undefined,
      media: `attach://${fieldName}`,
      type: attachment.type === 'video' ? 'video' : 'photo',
    };
  });

  formData.append('chat_id', String(telegramChatId));
  formData.append('media', JSON.stringify(media));

  const response = await fetchWithRetry(`https://api.telegram.org/bot${telegramBotToken}/sendMediaGroup`, {
    method: 'POST',
    body: formData,
  });

  return readTelegramResponse(response);
}

async function sendTelegramMedia(text: string, attachment: Attachment) {
  const endpoint = attachment.type === 'video' ? 'sendVideo' : 'sendPhoto';
  const fieldName = attachment.type === 'video' ? 'video' : 'photo';
  const formData = new FormData();

  formData.append('chat_id', String(telegramChatId));

  if (text) {
    formData.append('caption', text);
  }

  formData.append(
    fieldName,
    createAttachmentBlob(attachment),
    attachment.name ?? (attachment.type === 'video' ? 'socdep-video.mp4' : 'socdep-image.jpg')
  );

  const response = await fetchWithRetry(`https://api.telegram.org/bot${telegramBotToken}/${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  return readTelegramResponse(response);
}

function createAttachmentBlob(attachment: Attachment) {
  const fileBuffer = attachment.buffer ?? Buffer.alloc(0);
  const fileArrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  const fileBytes = new Uint8Array(fileArrayBuffer);

  return new Blob([fileBytes], {
    type: attachment.mimeType ?? (attachment.type === 'video' ? 'video/mp4' : 'image/jpeg'),
  });
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Telegram request failed.';
  throw new Error(`Telegram network error: ${message}`);
}

async function readTelegramResponse(response: Response) {
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(payload)}`);
  }

  return payload;
}
