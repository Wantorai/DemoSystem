require('dotenv').config();

// Cron очистка логов
require("./cleanLogsScheduler");

// Cron очистка старых голосовых сообщений
require('./cleanVoiceMessages')


const { ChatMessage, RoomMessage, User, RoomUsers, UserConsultChat, BossMessage, BossChatUsers, PushToken, MessageDelivery, Room } = require('./models'); 

  
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { init: initSocket } = require('./socket');
const { v4: uuidv4 } = require('uuid');
const { sendPushNotification } = require('./services/sendPushNotification');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { sendBridgePost, normalizeDomain } = require('./services/crossChatBridge');
const { ensureRoomChatNotArchived } = require('./services/crossChatArchiveAccess');
const {
  socketConnected,
  socketDisconnected,
  isUserOnline,
} = require('./services/mobileDiagnosticsRuntime');
const { apiPerformanceMiddleware } = require('./services/apiPerformanceRuntime');
const { recordSecurityEventSafe } = require('./services/securityEventService');

const app = express();
const PORT = process.env.PORT || 5000;
const READ_DEBUG_LOGS = String(process.env.READ_DEBUG_LOGS || '').toLowerCase() === 'true';
const CHAT_TRACE_LOGS = String(process.env.CHAT_TRACE_LOGS || '').toLowerCase() === 'true';

const readDebugLog = (...args) => {
  if (READ_DEBUG_LOGS) console.log(...args);
};

const readDebugWarn = (...args) => {
  if (READ_DEBUG_LOGS) console.warn(...args);
};

const chatTraceLog = (...args) => {
  if (CHAT_TRACE_LOGS) console.log(...args);
};

const parseOriginList = (value) =>
    String(value || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean);

const developmentCorsOrigins = [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:19000',
];
const configuredCorsOrigins = parseOriginList(process.env.CORS_ORIGINS);
const supportClientOrigins = parseOriginList(process.env.SUPPORT_CLIENT_ORIGINS);
const corsOrigins = [
    ...new Set([
        ...configuredCorsOrigins,
        ...(process.env.NODE_ENV === 'production' ? [] : developmentCorsOrigins),
        ...supportClientOrigins,
    ]),
];
const configuredSocketOrigins = parseOriginList(process.env.SOCKET_CORS_ORIGINS);
const socketCorsOrigins = configuredSocketOrigins.length > 0
    ? configuredSocketOrigins
    : corsOrigins;


if (process.env.LANGUAGE === 'ru') {
  // 1️⃣ Подключаем роутер MAX
  const maxWebhookRouter = require('./routes/maxWebhook');
  app.use('/api', maxWebhookRouter); // будет доступно по /api/webhooks/max

  // 2️⃣ Регистрируем вебхук у MAX один раз при старте
  const registerMaxWebhook = require('./registerMaxWebhook');
  registerMaxWebhook().catch(err => console.error('❌ Failed to register MAX webhook', err));
  const registerMaxRoomWebhook = require('./registerMaxRoomWebhook');
  registerMaxRoomWebhook().catch(err => console.error('❌ Failed to register MAX room webhook', err));
}

const telegramWebhookRouter = require('./routes/telegramWebhook');
app.use('/api', telegramWebhookRouter);
const registerTelegramWebhook = require('./registerTelegramWebhook');
registerTelegramWebhook().catch((err) => {
  console.error('[Telegram] Failed to register webhook', {
    code: err?.code || null,
    status: err?.response?.status || null,
    message: err?.message || 'Unknown error',
  });
});

const whatsappWebhookRouter = require('./routes/whatsappWebhook');
app.use('/api', whatsappWebhookRouter);


// app.post('/test', (req, res) => {
//   console.log('>> Got /test');
//   res.json({ ok: true });
// });


// app.use((req, res, next) => {
//   console.log(`>> Incoming: ${req.method} ${req.originalUrl}`);
//   next();
// });

// если nginx на том же сервере (один прокси) — укажи 1
app.set('trust proxy', 1);

// или, чтобы доверять всем прокси (менее безопасно):
// app.set('trust proxy', true);

// затем твои middlewares и роуты


// --- MIDDLEWARES ---
app.use((req, _res, next) => {
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin && !corsOrigins.includes(origin)) {
    const sourceIp = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    recordSecurityEventSafe({
      req,
      eventType: 'unexpected_origin',
      severity: 'warning',
      details: { corsBlocked: true },
      throttleKey: `origin:${sourceIp}:${origin}:${req.method}:${String(req.path || '').slice(0, 200)}`,
      throttleMs: 5 * 60 * 1000,
    });
  }
  next();
});

// Добавляем middleware для обработки JSON
app.use(express.json());  // Это важно для парсинга тела запроса как JSON
// Для Express < 4.16
app.use(bodyParser.json());

app.use(express.urlencoded({ extended: true }));

// Поддержка Cross-Origin Resource Sharing
app.use(cors({
    origin: corsOrigins,
    methods: ['GET','POST','PUT','DELETE','OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type','Authorization','x-support-source'],
    exposedHeaders: ['x-api-duration-ms'],
}));
app.use(apiPerformanceMiddleware);

// --- РЕСТ-эндпоинты ---
app.get('/', (req, res) => {
    res.send('CRM Backend запущен');
});



// --- ПОДКЛЮЧАЕМ ДОП. РОУТЫ ---
try {

    // подключаем роут логов (до другой логики)
    app.use(require('./routes/clientLog'));

    // Подключаемм авторизацию
    const authRoutes = require('./routes/authRoutes');
    app.use('/api/auth', authRoutes);


    // Подключаем маршрут восстановления БД
    const restoreBackup = require('./routes/backupsRoutes');
    app.use('/api', restoreBackup);


    // Подключаем маршрут установщика
    const installerRoutes = require('./routes/installerRoutes');
    app.use('/api', installerRoutes);


    // Подключаем маршрут технологов
    const technicRoutes = require('./routes/technicRoutes');
    app.use('/api', technicRoutes);


    // Подключаем маршрут клиента
    const clientRoutes = require('./routes/clientRoutes');
    app.use('/api', clientRoutes);


    // Подключаем маршрут MainModel
    const mainModelRoutes = require('./routes/mainModelRoutes');
    app.use('/api', mainModelRoutes);


    // Подключаем маршруты для Order
    const orderRoutes = require("./routes/orderRoutes");
    app.use("/api", orderRoutes);


    // Подключаем маршрут Fields
    const fieldRoutes = require('./routes/fieldRoutes');
    app.use('/api', fieldRoutes);


    // Подключаем маршрут Paylist
    const paylistRoutes = require('./routes/paylistRoutes');
    app.use('/api', paylistRoutes);


    // Подключаем маршрут Comments
    const commentsRoutes = require('./routes/commentsRoutes');
    app.use('/api', commentsRoutes);


    // Подключаем маршруты для OrderConfig
    const orderConfigRoutes = require("./routes/orderConfigRoutes");
    app.use("/api", orderConfigRoutes);


    // Подключаем маршруты для ассоциаций
    const associationsRoutes = require("./routes/associationsRoutes");
    app.use("/api", associationsRoutes);


    // Подключаем маршруты для шаблона конфигурации
    const configRoute = require("./routes/configRoute");
    app.use("/api", configRoute);


    // Подключаем маршруты для всех конфигураций
    const configsRoute = require("./routes/configsRoute");
    app.use("/api", configsRoute);


    // Подключаем маршруты для надстроек
    const addonRoutes = require("./routes/addonRoutes");
    app.use("/api", addonRoutes);


    // Подключаем маршрут FurnVendor
    const furnVendorRoutes = require('./routes/furnVendorRoutes');
    app.use('/api', furnVendorRoutes);


    // Подключаем маршрут FasadVendor
    const fasadVendorRoutes = require('./routes/fasadVendorRoutes');
    app.use('/api', fasadVendorRoutes);


    // Подключаем маршрут WorkVendor
    const workVendorRoutes = require('./routes/workVendorRoutes');
    app.use('/api', workVendorRoutes);


    // Подключаем маршрут StatusColor
    const statusColorRoutes = require('./routes/statusColorRoutes');
    app.use('/api', statusColorRoutes);


    // Подключаем маршрут ScheduleConfig
    const scheduleConfigRoutes = require('./routes/scheduleConfigRoutes');
    app.use('/api', scheduleConfigRoutes);


    // Маршруты для конфига выходных
    const holidayConfigsRouter = require('./routes/holidayConfigsRoutes');
    app.use('/api/holidays', holidayConfigsRouter);


    // Маршруты для статусов заказа
    const orderStatusRoutes = require('./routes/orderStatusRoutes');
    app.use('/api', orderStatusRoutes);


    // Маршруты для имен ссылок в конфиге
    const configLinksRoutes = require('./routes/configLinksRoutes');
    app.use('/api', configLinksRoutes);


    // Маршруты для сохранения конфига ссобытия
    const configEventRoutes = require('./routes/configEventRoutes');
    app.use('/api', configEventRoutes);


    // Маршруты для ролей
    const roleRoutes = require("./routes/roleRoutes");
    app.use("/api", roleRoutes);

    // Маршруты для прав
    const permissionRoutes = require("./routes/permissionRoutes");
    app.use("/api", permissionRoutes);


    // Маршруты для прав параметров
    const permissionParamsRoutes = require("./routes/permissionParamsRoutes");
    app.use("/api", permissionParamsRoutes);


    // Маршруты для user
    const userRoutes = require("./routes/userRoutes");
    app.use("/api", userRoutes);

    // Единая система тикетов поддержки
    const supportTicketRoutes = require('./routes/supportTicketRoutes');
    app.use('/api', supportTicketRoutes);


    // Маршруты для event-info
    const eventInfoRoutes = require("./routes/eventInfoRoutes");
    app.use("/api", eventInfoRoutes);


    // Маршруты для simple-event
    const simpleEventRoutes = require("./routes/simpleEventRoutes");
    app.use("/api", simpleEventRoutes);


    // Маршруты для column-config
    const columnWidthRoutes = require("./routes/columnWidthRoutes");
    app.use("/api", columnWidthRoutes);


    // Маршруты для обновлений
    const systemRoutes = require('./routes/systemRoutes');
    app.use('/api/system', systemRoutes);


    // Подключаем маршрут InfoSource
    const infoSourceRoutes = require('./routes/infoSourceRoutes');
    app.use('/api', infoSourceRoutes);


    // Маршрут для экспорта заказов в Excel
    const exportOrdersRouter = require('./routes/exportOrders');
    app.use('/api/orders', exportOrdersRouter);

    // Маршрут для crm
    const crmRoutes = require('./routes/crmRoutes');
    app.use('/api', crmRoutes);

    // Маршрут для crmConfig
    const crmConfigRoutes = require('./routes/crmConfigRoutes');
    app.use('/api', crmConfigRoutes);


    // Маршрут для получения всех звонков по номеру
    const callRoutes = require('./routes/callRoutes');
    app.use('/api', callRoutes);


    // Маршруты для статусов CRM
    const statusCRMRoutes = require('./routes/statusCRMRoutes');
    app.use('/api', statusCRMRoutes);


    // Подключаем маршрут менеджеров
    const managerRoutes = require('./routes/managerRoutes');
    app.use('/api', managerRoutes);


    // Подключаем маршрут отчетов
    const dashboardRoutes = require('./routes/dashboardRoutes');
    app.use('/api', dashboardRoutes);


    // Подключаем маршрут логов
    const orderLogsRoutes = require('./routes/orderLogsRoutes');
    app.use('/api', orderLogsRoutes);


    // Для tele2
    const tele2Routes = require('./routes/tele2Routes');
    app.use('/api/tele2', tele2Routes);


    // Для передачи файлов с приложения
    app.use('/uploads', express.static('uploads')); // отдача файлов
    app.use('/api/upload', require('./routes/uploadRoutes')); // роут загрузки

    // Для передачи файлов с веб версии чата
    app.use('/api/uploadfiles', require('./routes/uploadWebChatRoute')); // роут загрузки    


    // Маршрут для загрузки мобильного приложения и его версии
    const downloadAppRoute = require('./routes/downloadApp');
    app.use('/', downloadAppRoute);

    const versionAppRoute = require('./routes/version');
    app.use('/', versionAppRoute);

    const versionApp = require('./routes/appVersion');
    app.use('/', versionApp);

    // Max proxy
    app.use('/api/proxy', require('./routes/MaxProxy'));

  


} catch (err) {
  console.error('Ошибка при подключении модулей:', err);
  process.exit(1);
}



// --- СОЗДАЁМ HTTP‑сервер и SOCKET.IO ---
const server = http.createServer(app);

// "Опции" — это конфигурация Socket.IO.
// Здесь мы задаём CORS для сокетов и указываем, что транспорт — вебсокеты:
const io = new initSocket(server, {
  cors: {
    origin: socketCorsOrigins,
    methods: ['GET','POST'],
    allowedHeaders: ['Authorization'],
    credentials: true,
  },
  transports: ['websocket'], // сокеты через WebSocket, без long-polling
});

// Подключаем маршрут для чата
const chatRoutes = require('./routes/chatRoutes');
app.use('/api', chatRoutes);

// Подключаем маршрут чатов
const roomRoutes = require('./routes/roomRoutes');
app.use('/api', roomRoutes);

// Подключаем маршрут сообщений чатов
const roomMessagesRoutes = require('./routes/roomMessagesRoutes');
app.use('/api', roomMessagesRoutes);

const roomPinnedRoutes = require('./routes/roomPinnedRoutes');
app.use('/api', roomPinnedRoutes);

// Для push уведомлений
const pushRoutes = require('./routes/pushRoutes');
app.use('/api', pushRoutes);
const employeeCallRoutes = require('./routes/employeeCallRoutes');
app.use('/api', employeeCallRoutes);
const quickReplyRoutes = require('./routes/quickReplyRoutes');
app.use('/api', quickReplyRoutes);

// Подключаем маршрут для boss-чатов
const bossChatRoutes = require('./routes/bossChatRoutes');
const bossMsgRoutes  = require('./routes/bossMessageRoutes');
app.use('/api', bossChatRoutes);
app.use('/api', bossMsgRoutes);
const bossPinnedRoutes = require('./routes/bossPinnedRoutes');
app.use('/api', bossPinnedRoutes);
const scheduledMessageRoutes = require('./routes/scheduledMessageRoutes');
app.use('/api', scheduledMessageRoutes);
const reminderRoutes = require('./routes/reminderRoutes');
app.use('/api', reminderRoutes);
const alertRoutes = require('./routes/alertRoutes');
app.use('/api', alertRoutes);
app.use('/api', require('./routes/fileSpaceRoutes'));
const crossChatRoutes = require('./routes/crossChatRoutes');
app.use('/api', crossChatRoutes);
const chatPinsRoutes = require('./routes/chatPinsRoutes');
app.use('/api', chatPinsRoutes);
const schedulerRoutes = require('./routes/schedulerRoutes');
app.use('/api', schedulerRoutes);

const appStyleRoutes = require('./routes/appStyleRoutes');
app.use('/api', appStyleRoutes);
const userSettingsRoutes = require('./routes/userSettingsRoutes');
app.use('/api', userSettingsRoutes);
const scene3dRoutes = require('./routes/scene3dRoutes');
app.use('/api', scene3dRoutes);
const mobileUpdatesRoutes = require('./routes/mobileUpdatesRoutes');
app.use('/api', mobileUpdatesRoutes);
const connectionSpeedRoutes = require('./routes/connectionSpeedRoutes');
app.use('/api', connectionSpeedRoutes);
const mobileDiagnosticsRoutes = require('./routes/mobileDiagnosticsRoutes');
app.use('/api', mobileDiagnosticsRoutes);
const securityDiagnosticsRoutes = require('./routes/securityDiagnosticsRoutes');
app.use('/api', securityDiagnosticsRoutes);


// // Для эмита из воркера в клиент
const internalRoutes = require('./routes/internal');
app.use('/internal', internalRoutes);
app.post('/api/site-callback-alert', internalRoutes.siteCallbackAlertHandler);

// // Маршрут для удаления сообщений из чатов
const deleteMessages = require('./routes/deleteMessages');
app.use('/api', deleteMessages);

// Маршруты для Макса
const maxChatsRoutes = require('./routes/maxChatsRoutes');
app.use('/api', maxChatsRoutes);
const telegramChatsRoutes = require('./routes/telegramChatsRoutes');
app.use('/api', telegramChatsRoutes);
const whatsappChatsRoutes = require('./routes/whatsappChatsRoutes');
app.use('/api', whatsappChatsRoutes);


io.on('connection', async (socket) => {

  chatTraceLog(`Новый клиент подключился: ${socket.id}`);
  const token = socket.handshake.auth.token; // получаем токен из auth
  chatTraceLog('Token received:', token ? token.substring(0, 20) + '...' : 'none');

  if (!token) {
    chatTraceLog('No token provided, disconnecting socket');
    socket.disconnect();
    return;
  }


  try {
    // Проверяем и декодируем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // замените на ваш секрет
    const userId = decoded.id; // предполагаем, что в токене поле id (или userId)
    chatTraceLog('Authenticated user ID:', userId);

    // Сохраняем userId в объекте сокета для удобства
    socket.userId = userId;

    // Добавляем сокет в комнату пользователя
    socket.join(`user:${userId}`);

    const { wasOffline } = socketConnected(userId, socket.id);

    if (wasOffline) {
      io.emit('presence:updated', {
        userId: Number(userId),
        online: true,
        lastSeenAt: null,
      });
    }

    socket.on('presence:get', async (payload = {}, callback) => {
      try {
        const targetUserId = Number(payload?.userId);
        if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
          if (typeof callback === 'function') callback({ online: false, lastSeenAt: null });
          return;
        }
        const online = isUserOnline(targetUserId);
        let lastSeenAt = null;
        if (!online) {
          const targetUser = await User.findByPk(targetUserId, { attributes: ['lastSeenAt'] });
          lastSeenAt = targetUser?.lastSeenAt || null;
        }
        if (typeof callback === 'function') {
          callback({ userId: targetUserId, online, lastSeenAt });
        }
      } catch (error) {
        console.warn('presence:get failed:', error?.message || error);
        if (typeof callback === 'function') callback({ online: false, lastSeenAt: null });
      }
    });

    socket.on('disconnect', async () => {
      const { wasOnline, isOffline } = socketDisconnected(userId, socket.id);
      if (!wasOnline || !isOffline) return;

      const lastSeenAt = new Date();
      try {
        await User.update({ lastSeenAt }, { where: { id: userId } });
      } catch (error) {
        console.warn('lastSeenAt update failed:', error?.message || error);
      }
      io.emit('presence:updated', {
        userId: Number(userId),
        online: false,
        lastSeenAt: lastSeenAt.toISOString(),
      });
    });

  } catch (err) {
    console.error('Invalid token:', err.message);
    socket.disconnect();
  }

  const parseBridgePeerPhone = (value) => {
    const raw = String(value || '').trim();
    const match = /^xbridge:([^:]+):(.+)$/i.exec(raw);
    if (!match) return null;
    const domain = normalizeDomain(match[1]);
    const phone = String(match[2] || '').replace(/\D/g, '');
    if (!domain || !phone) return null;
    return { domain, phone };
  };

  const getOwnBridgeDomainFromSocket = () => {
    const envDomain = normalizeDomain(process.env.CROSS_CHAT_BRIDGE_DOMAIN || '');
    if (envDomain) return envDomain;
    const forwarded = String(socket.handshake?.headers?.['x-forwarded-host'] || '').trim();
    const host = forwarded || String(socket.handshake?.headers?.host || '').trim();
    return normalizeDomain(host);
  };

  const relayCrossCompanyReadIfNeeded = async ({ roomId, safeLastRead, actorUserId }) => {
    try {
      const roomIdNum = Number(roomId) || 0;
      const safeLastReadNum = Number(safeLastRead) || 0;
      const actorIdNum = Number(actorUserId) || 0;
      if (!roomIdNum || !safeLastReadNum || !actorIdNum) return;

      const room = await Room.findByPk(roomIdNum, {
        attributes: ['id', 'type'],
        include: [{ model: User, attributes: ['id', 'name', 'phone'], through: { attributes: [] } }],
      });
      if (!room || room.type !== 'personal') return;

      const users = Array.isArray(room.Users) ? room.Users : [];
      const actorUser = users.find((u) => Number(u?.id) === actorIdNum);
      const bridgePeer = users.find((u) => Number(u?.id) !== actorIdNum && String(u?.phone || '').startsWith('xbridge:'));
      if (!actorUser || !bridgePeer) return;

      const peer = parseBridgePeerPhone(bridgePeer.phone);
      if (!peer?.domain || !peer?.phone) return;

      const bridgedMessage = await RoomMessage.findOne({
        where: {
          roomId: roomIdNum,
          id: { [Op.lte]: safeLastReadNum },
          clientId: { [Op.like]: 'bridge:%' },
        },
        attributes: ['id', 'clientId'],
        order: [['id', 'DESC']],
      });
      if (!bridgedMessage?.clientId) return;

      const bridgeClientMatch = /^bridge:([^:]+):(.+)$/i.exec(String(bridgedMessage.clientId || ''));
      if (!bridgeClientMatch) return;
      const sourceDomain = normalizeDomain(bridgeClientMatch[1]);
      const externalMessageId = String(bridgeClientMatch[2] || '').trim();
      if (!sourceDomain || !externalMessageId) return;

      const ownDomain = getOwnBridgeDomainFromSocket();
      if (!ownDomain) {
        console.warn('[cross-chat][bridge][read] skip:no-own-domain', { roomId: roomIdNum, actorUserId: actorIdNum });
        return;
      }

      await sendBridgePost(
        sourceDomain,
        '/api/cross-chat/bridge/read',
        {
          externalMessageId,
          sender: {
            userId: actorIdNum,
            name: String(actorUser.name || '').trim() || `User ${actorIdNum}`,
            phone: String(actorUser.phone || ''),
            domain: ownDomain,
          },
          target: {
            phone: peer.phone,
            domain: sourceDomain,
          },
          read: {
            roomId: roomIdNum,
            lastReadMessageId: safeLastReadNum,
            readAt: new Date().toISOString(),
          },
        },
        ownDomain
      );
      readDebugLog('[cross-chat][bridge][read] relayed', {
        roomId: roomIdNum,
        actorUserId: actorIdNum,
        ownDomain,
        sourceDomain,
        targetPhone: peer.phone,
        externalMessageId,
        safeLastRead: safeLastReadNum,
      });
    } catch (err) {
      console.warn('[cross-chat][bridge][read] relay failed:', err?.message || err);
    }
  };



  // 1. Загружаем историю чата Консультаций из базы
  try {
    const records = await ChatMessage.findAll({ 
      order: [['createdAt','DESC']], 
    });
    const history = records
      .map(r => r.get({ plain: true }))
      .reverse(); 
    socket.emit('history', history);
  } catch (err) {
    console.error('Ошибка загрузки истории чата из БД:', err);
  }


  // Подключение к комнате
  socket.on('join', (consult) => {
    chatTraceLog('[socket] join room:', consult, 'socket=', socket.id);
    socket.join(consult);
  });

  // Консультации
  socket.on('message', async (msg) => {
    try {
      chatTraceLog('‹SERVER› got message:', JSON.stringify(msg));

      const messageId = uuidv4();
      const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();

      // Если у нас есть replyTo — убедимся, что оно сериализовано в metadata
      let metadata = msg.metadata ?? {};
      if (msg.metadata?.replyTo?._id) {
        metadata.replyTo = msg.metadata.replyTo;
      }

      // Сохраняем сообщение в БД (любого типа)
      await ChatMessage.create({
        _id: messageId,
        userId: msg.user._id.toString(),
        userName: msg.user.name,
        text: msg.text ?? null,
        type: msg.type ?? 'text',
        mediaUrl: msg.mediaUrl ?? null,
        fileName: msg.fileName ?? null,
        metadata,
        createdAt,
      });

      // Формируем пакет для отправки клиентам
      const outgoingMessage = {
        ...msg,
        _id: messageId,
        createdAt,
        metadata,
      };

      chatTraceLog('outgoingMessage =', outgoingMessage)

      io.emit('message', outgoingMessage);
      io.emit('newMessage');

      // if (!msg.type || msg.type === 'text') {

        // Определяем senderId — числовой, если возможно
        const rawSender = msg?.user?._id ?? msg?.userId ?? null;
        const senderId = rawSender != null && !isNaN(Number(rawSender)) ? Number(rawSender) : null;

        // 1) Получаем список участников консультационного чата (UserConsultChat)
        //    Здесь предполагаем, что UserConsultChat связан с User через alias 'user'
        const participants = await UserConsultChat.findAll({
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        });

        // 2) Получаем уникальные userId участников, исключая отправителя
        const recipientUserIds = Array.from(new Set(
          participants
            .map(p => p.user?.id)
            .filter(id => id != null && (!senderId || Number(id) !== senderId))
        ));

        if (recipientUserIds.length === 0) {
          // console.log('No recipients for push (consult chat) — nothing to send.');
        } else {
          // 3) Берём push-токены для этих пользователей
          const tokenRows = await PushToken.findAll({
            where: { userId: { [Op.in]: recipientUserIds } },
            attributes: ['token', 'userId'],
          });

          // 4) Отфильтруем и дедуплируем токены (и исключим токены отправителя на всякий)
          const tokens = Array.from(new Set(
            tokenRows
              .filter(r => !(senderId && Number(r.userId) === senderId))
              .map(r => r.token)
              .filter(Boolean)
          ));

          if (tokens.length === 0) {
            //console.log('No push tokens found for recipients.');
          } else {
            // 5) Формируем title/body — простой вариант
            const senderName = msg?.user?.name || msg?.userName || 'Коллега';
            const body = (msg.text && String(msg.text).trim().length > 0)
              ? (String(msg.text).length > 140 ? String(msg.text).slice(0,140) + '...' : String(msg.text))
              : 'НС:';

            const title = `От ${senderName}`;

            //console.log('Sending push to tokens count=', tokens.length, 'recipients=', recipientUserIds.length);

            // 6) Отправляем пакетно — sendPushNotification умеет принимать массив токенов
            await sendPushNotification(tokens, title, body, { screen: 'consultChat' });

            //console.log('Push notifications queued/sent.');
          }
        }
      //}

    } catch (err) {
      console.error('Ошибка в message-handler:', err);
    }
  });


  // Для special чата для обновления непрочитанных сообщений
  socket.on('markConsultChatAsRead', async ({ userId, lastReadChatMessageId }) => {
    readDebugLog('📥 Получен markConsultChatAsRead:', { userId, lastReadChatMessageId });
    try {

      let targetLastReadId = lastReadChatMessageId;
      const messageExists = await ChatMessage.findByPk(lastReadChatMessageId);
      if (!messageExists) {
        const latest = await ChatMessage.findOne({
          attributes: ['_id'],
          order: [['createdAt', 'DESC']],
        });
        targetLastReadId = latest?._id || null;
        console.warn('❗ Message ' + lastReadChatMessageId + ' not found — fallback to latest ' + (targetLastReadId || 'null') + '.');
      }

      await UserConsultChat.upsert({ userId, lastReadChatMessageId: targetLastReadId });
      // Эмитим событие, что статус прочтения special-чата изменился
      io.emit('consultReadStatusUpdated', { userId });

    } catch (err) {
      console.error('Error updating consult lastReadChatMessageId:', err);
    }
  });




  // --- Boss чаты и сообщения ---
  // Подключение к boss-чату
  socket.on('joinBossChat', async (chatId) => {
    socket.join(`chat-${chatId}`);

    // Загрузка истории сообщений
    try {
      const messages = await BossMessage.findAll({
        where: { chatId },
        include: [
            { model: User, attributes: ['id', 'name'] },
            {
              model: BossMessage,
              as: 'replyToMessage',
              include: [{ model: User, attributes: ['id', 'name'] }],
            },
        ],
        order: [['createdAt', 'ASC']],
      });
      socket.emit('bossChatHistory', { chatId, messages });
    } catch (err) {
      console.error('Ошибка загрузки истории чата:', err);
    }
  });


  // Обработка нового сообщения
  socket.on('bossChatMessage', async (msg) => {
    // console.log('Received bossChatMessage event:', msg);

    const now = new Date();

    try {

      const {
        chatId,
        userId,
        content = null,
        type = 'text',
        mediaUrl = null,
        fileName = null,
        replyToMessage = null,
      } = msg;


      if (!chatId || !userId || (!content && !mediaUrl)) {
        //console.log('Invalid bossChatMessage message data:', msg);
        return;
      }

      const created = await BossMessage.create({
        chatId,
        userId,
        content,
        type,
        mediaUrl,
        fileName,
        createdAt: now,
        replyToMessageId: replyToMessage,
      });

      //console.log('Message created in DB:', created.toJSON());

      const fullMsg = await BossMessage.findByPk(created.id, {
          include: [
            { model: User, attributes: ['id', 'name'] },
            {
              model: BossMessage,
              as: 'replyToMessage',
              include: [{ model: User, attributes: ['id', 'name'] }],
            },
          ],
      });

      //console.log('Broadcasting newBossChatMessage:', fullMsg.toJSON());

      io.to(`chat-${msg.chatId}`).emit('newBossChatMessage', fullMsg);
      // io.emit('newMessage');
      // console.log('[server] newMessage EMIT')

      // получаем участников чата
      const participants = await BossChatUsers.findAll({
        where: { chatId },
        include: [{ model: User, as: 'user', attributes: ['id','name'] }],
      });

      // исключаем отправителя (msg.userId)
      const recipientUserIds = Array.from(new Set(
        participants
          .map(p => p.user && p.user.id)
          .filter(id => id && id !== userId)
      ));

      if (recipientUserIds.length > 0) {
        // достаём push-токены
        const tokensRows = await PushToken.findAll({
          where: { userId: { [Op.in]: recipientUserIds } },
          attributes: ['token'],
        });

        const tokens = Array.from(new Set(tokensRows.map(r => r.token).filter(Boolean)));

        if (tokens.length > 0) {
          const title = `От ${fullMsg.User?.name || 'Коллеги'}`;
          const body = (content && content.length > 0) ? (content.length > 100 ? content.slice(0,100)+'...' : content) : (fileName || 'НС:');

          // sendPushNotification умеет принимать массив токенов или токен
          await sendPushNotification(tokens, title, body, { screen: 'admin', chatId });
        }
      }

    } catch (err) {
      console.error('Error in bossChatMessage handler:', err);
    }
  });


  // Обработка события markAsRead для админ чата
  socket.on('markAsReadChat', async ({ chatId, lastReadMessageId, userId, lastReadAt }) => {

      const chatIdNum = Number(chatId) || 0;
      const requestedLastRead = Number(lastReadMessageId) || 0;
      const actorUserId = Number(socket.userId) || Number(userId) || 0;
      readDebugLog('[ReadDebug][backend:markAsReadChat][incoming]', {
        socketUserId: Number(socket.userId) || null,
        payloadUserId: Number(userId) || null,
        actorUserId,
        chatId: chatIdNum,
        requestedLastRead,
      });
      if (!chatIdNum || !requestedLastRead || !actorUserId) return;

      // Сохраняем только существующий message id в рамках этого boss-чата.
      const safeLastRead =
        Number(
          await BossMessage.max('id', {
            where: { chatId: chatIdNum, id: { [Op.lte]: requestedLastRead } },
          })
        ) || 0;
      if (!safeLastRead) return;
      if (safeLastRead !== requestedLastRead) {
        readDebugWarn('[ReadDebug][backend:markAsReadChat][clamped]', {
          chatId: chatIdNum,
          actorUserId,
          requestedLastRead,
          safeLastRead,
          payloadUserId: Number(userId) || null,
        });
      }

    try {
      const [bossChatUser, created] = await BossChatUsers.findOrCreate({
        where: { chatId: chatIdNum, userId: actorUserId },
        defaults: {
          chatId: chatIdNum,
          userId: actorUserId,
          lastReadMessageId: safeLastRead,
          lastReadAt: lastReadAt || new Date(),
        },
      });

      if (!created) {
        const prevLastRead = Number(bossChatUser.lastReadMessageId) || 0;
        if (safeLastRead > prevLastRead) {
          bossChatUser.lastReadMessageId = safeLastRead;
          bossChatUser.lastReadAt = lastReadAt || new Date();
          await bossChatUser.save();
        }
        readDebugLog('[ReadDebug][backend:markAsReadChat][saved-existing]', {
          chatId: chatIdNum,
          userId: actorUserId,
          prevLastRead,
          safeLastRead,
        });
      } else {
        readDebugLog('[ReadDebug][backend:markAsReadChat][saved-created]', {
          chatId: chatIdNum,
          userId: actorUserId,
          safeLastRead,
        });
      }

      io.emit('readStatusUpdatedChat', { chatId: chatIdNum, userId: actorUserId, lastReadMessageId: safeLastRead });

      //console.log('io.emit readStatusUpdatedChat ')

    } catch (err) {
      console.error(err);
    }
  });


  // Подключение к комнате
  socket.on('joinRoom', async (roomId) => {
    socket.join(`room-${roomId}`);
    // console.log('[joinRoom] socket.rooms:', Array.from(socket.rooms));
    // const members = io.sockets.adapter.rooms.get(`room-${roomId}`);
    // console.log('[joinRoom] room members:', members ? Array.from(members) : 'EMPTY');


    // Загрузка истории сообщений
    try {
      const messages = await RoomMessage.findAll({
        where: { roomId },
        order: [['createdAt', 'ASC']],
        include: [
          { model: User, attributes: ['id', 'name'] },
          {
            model: RoomMessage,
            as: 'replyToMessage',
            include: [{ model: User, attributes: ['id', 'name'] }],
          },
        ],
      });

      socket.emit('roomHistory', { roomId, messages });
    } catch (err) {
      console.error('Ошибка загрузки истории комнаты:', err);
    }
  });
  

  socket.on('leaveRoom', async (roomId) => {
    socket.leave(`room-${roomId}`);
    chatTraceLog(`[SERVER leaveRoom] pid=${process.pid} socket.id=${socket.id} leaveRoom room-${roomId}`);
  });

  socket.on('roomMediaUploadStarted', (payload = {}) => {
    try {
      const roomIdNum = Number(payload?.roomId);
      if (!Number.isFinite(roomIdNum) || roomIdNum <= 0) return;
      const eventPayload = {
        roomId: roomIdNum,
        clientId: String(payload?.clientId || '').trim() || null,
        messageType: String(payload?.messageType || 'file'),
        fileName: payload?.fileName ? String(payload.fileName) : null,
        mimeType: payload?.mimeType ? String(payload.mimeType) : null,
        createdAt: payload?.createdAt || new Date().toISOString(),
        userId: Number(payload?.userId || socket.userId || 0) || null,
      };
      const { clearMediaUploadCancellation } = require('./services/mediaUploadCancellation');
      clearMediaUploadCancellation('room', roomIdNum, eventPayload.clientId);
      // console.log('[roomMediaUploadStarted] received', {
      //   socketId: socket.id,
      //   roomId: roomIdNum,
      //   clientId: eventPayload.clientId,
      //   messageType: eventPayload.messageType,
      //   userId: eventPayload.userId,
      // });
      io.to(`room-${roomIdNum}`).emit('roomMediaUploadStarted', eventPayload);
      // Также отправляем глобально, чтобы клиент мог поймать и закэшировать
      // pending-медиа даже если сейчас не находится в активной room-подписке.
      io.emit('roomMediaUploadStarted', eventPayload);
    } catch (err) {
      console.warn('[roomMediaUploadStarted] relay failed:', err?.message || err);
    }
  });


  // Обработка нового сообщения
  socket.on('roomMessage', async (msg) => {
    chatTraceLog('Received roomMessage event:', msg);

    try {

      const {
        roomId,
        userId,
        content = null,
        type = 'text',
        mediaUrl = null,
        fileName = null,
        replyToMessage = null,
      } = msg;


      if (!roomId || !userId || (!content && !mediaUrl)) {
        chatTraceLog('Invalid roomMessage message data:', msg);
        return;
      }
      try {
        await ensureRoomChatNotArchived(Number(roomId));
      } catch (archiveErr) {
        if (archiveErr?.status === 403) {
          socket.emit('roomMessageError', {
            roomId: Number(roomId),
            code: archiveErr.code || 'CROSS_CHAT_ARCHIVED',
            message: archiveErr.message || 'Чат в архиве',
          });
          return;
        }
        throw archiveErr;
      }

      const created = await RoomMessage.create({
        roomId,
        userId,
        content,
        type,
        mediaUrl,
        fileName,
        replyToMessageId: replyToMessage,
      });

      chatTraceLog('Message created in DB:', created.toJSON());

      const fullMsg = await RoomMessage.findByPk(created.id, {
        include: [
          { model: User, attributes: ['id', 'name'] },
          {
            model: RoomMessage,
            as: 'replyToMessage',
            include: [{ model: User, attributes: ['id', 'name'] }],
          },
        ],
      });


      io.to(`room-${msg.roomId}`).emit('newRoomMessage', fullMsg);
      // io.emit('newMessage');
      // console.log('[server] emit newMessage')

      // получаем участников чата
      const participants = await RoomUsers.findAll({
        where: { roomId },
        include: [{ model: User, as: 'user', attributes: ['id','name'] }],
      });

      // исключаем отправителя (msg.userId)
      const recipientUserIds = Array.from(new Set(
        participants
          .map(p => p.user && p.user.id)
          .filter(id => id && id !== userId)
      ));

      if (recipientUserIds.length > 0) {
        // достаём push-токены
        const tokensRows = await PushToken.findAll({
          where: { userId: { [Op.in]: recipientUserIds } },
          attributes: ['token'],
        });

        const tokens = Array.from(new Set(tokensRows.map(r => r.token).filter(Boolean)));

        if (tokens.length > 0) {
          const title = `От ${fullMsg.User?.name || 'Не опознан'}`;
          const body = (content && content.length > 0) ? (content.length > 100 ? content.slice(0,100)+'...' : content) : (fileName || 'НС:');

          // sendPushNotification умеет принимать массив токенов или токен
          await sendPushNotification(tokens, title, body, { screen: 'room', roomId });
        }
      }

    } catch (err) {
      console.error('Error in roomMessage handler:', err);
    }
  });
  

  // Обработка события markAsRead для комнаты
  socket.on('markAsRead', async ({ roomId, lastReadMessageId, userId }, ack) => {
    let acknowledged = false;
    const respond = (payload) => {
      if (acknowledged || typeof ack !== 'function') return;
      acknowledged = true;
      ack(payload);
    };
    try {
      const roomIdNum = Number(roomId) || 0;
      const requestedLastRead = Number(lastReadMessageId) || 0;
      const actorUserId = Number(socket.userId) || Number(userId) || 0;
      readDebugLog('[ReadDebug][backend:markAsRead][incoming]', {
        socketUserId: Number(socket.userId) || null,
        payloadUserId: Number(userId) || null,
        actorUserId,
        roomId: roomIdNum,
        requestedLastRead,
      });
      if (!roomIdNum || !requestedLastRead || !actorUserId) {
        respond({ ok: false, error: 'invalid_read_payload' });
        return;
      }

      // Защита от битых/чужих ID: сохраняем только существующий ID в рамках этой комнаты.
      const safeLastRead =
        Number(
          await RoomMessage.max('id', {
            where: { roomId: roomIdNum, id: { [Op.lte]: requestedLastRead } },
          })
        ) || 0;
      if (!safeLastRead) {
        respond({ ok: false, error: 'message_not_found' });
        return;
      }
      if (safeLastRead !== requestedLastRead) {
        readDebugWarn('[ReadDebug][backend:markAsRead][clamped]', {
          roomId: roomIdNum,
          actorUserId,
          requestedLastRead,
          safeLastRead,
          payloadUserId: Number(userId) || null,
        });
      }

      const roomUser = await RoomUsers.findOne({
        where: { roomId: roomIdNum, userId: actorUserId },
      });
      if (!roomUser) {
        const roomType = await Room.findByPk(roomIdNum, { attributes: ['type'] });
        console.warn('[PersonalGuard][backend:markAsRead][skip-non-member]', {
          roomId: roomIdNum,
          roomType: roomType?.type || null,
          userId: actorUserId,
          requestedLastRead,
          safeLastRead,
        });
        respond({ ok: false, error: 'room_membership_required' });
        return;
      }

      const prevLastRead = Number(roomUser.lastReadMessageId || 0);
      if (prevLastRead < safeLastRead) {
        roomUser.lastReadMessageId = safeLastRead;
        await roomUser.save();
      }
      readDebugLog('[ReadDebug][backend:markAsRead][saved-existing]', {
        roomId: roomIdNum,
        userId: actorUserId,
        prevLastRead,
        safeLastRead,
      });

      readDebugLog(`User ${actorUserId} marked messages as read up to ${safeLastRead} in room ${roomIdNum}`);

      io.emit('readStatusUpdated', { roomId: roomIdNum, userId: actorUserId, lastReadMessageId: safeLastRead });
      respond({ ok: true, roomId: roomIdNum, lastReadMessageId: safeLastRead });
      await relayCrossCompanyReadIfNeeded({ roomId: roomIdNum, safeLastRead, actorUserId });

    } catch (err) {
      console.error('Error updating lastReadMessageId:', err);
      respond({ ok: false, error: 'read_update_failed' });
    }
  });

  socket.on('roomMediaUploadCancelled', (payload = {}) => {
    try {
      const roomIdNum = Number(payload?.roomId);
      const clientId = String(payload?.clientId || '').trim();
      if (!Number.isFinite(roomIdNum) || roomIdNum <= 0 || !clientId) return;
      const { markMediaUploadCancelled } = require('./services/mediaUploadCancellation');
      markMediaUploadCancelled('room', roomIdNum, clientId);

      const eventPayload = {
        roomId: roomIdNum,
        clientId,
        userId: Number(socket.userId || payload?.userId || 0) || null,
        cancelledAt: new Date().toISOString(),
      };
      io.to(`room-${roomIdNum}`).emit('roomMediaUploadCancelled', eventPayload);
      io.emit('roomMediaUploadCancelled', eventPayload);
    } catch (err) {
      console.warn('[roomMediaUploadCancelled] relay failed:', err?.message || err);
    }
  });


  // Подключение k MAX
  // console.log('🔗 User connected:', socket.id);
  
  socket.on('max:join', (chatId) => {
    const roomName = `room-max-${chatId}`;
    socket.join(roomName);
    //console.log(`📌 User ${socket.id} joined room: ${roomName}`);
    
    // Проверяем, кто в комнате
    //const room = io.sockets.adapter.rooms.get(roomName);
   //console.log(`👥 Now ${room ? room.size : 0} users in ${roomName}`);
  });

  socket.on('max:leave', (chatId) => {
    const roomName = `room-max-${chatId}`;
    socket.leave(roomName);
    //console.log(`📌 User ${socket.id} left room: ${roomName}`);
  });

  socket.on('disconnect', (reason) => {
    //console.log(`❌ User ${socket.id} disconnected:`, reason);
  });


  // Обрабатываем событие maintenance:warning
  socket.on('maintenance:warning', ({ secondsLeft }) => {
    io.emit('maintenance:warning', { secondsLeft }); // пересылаем всем
  });


  // Подтверждение доставки от получателя
  socket.on('message_delivered', async ({ messageId }) => {
    try {
      const userId = socket.userId; // берём из сокета
      if (!userId) return;
      //console.log('[message_delivered] userId', userId)
      const message = await RoomMessage.findByPk(messageId, {
        include: [{ model: Room, attributes: ['type', 'id'] }]
      });
      if (!message) return;

      // Игнорируем, если это сообщение от самого пользователя (отправитель не может подтвердить доставку)
      if (message.userId === userId) return;

      // Создаём запись о доставке
      await MessageDelivery.findOrCreate({
        where: { messageId, userId },
        defaults: { deliveredAt: new Date() }
      });

      // Отправляем отправителю (он в комнате user:userId)
      io.to(`user:${message.userId}`).emit('delivery_updated', { messageId });

    } catch (err) {
      console.error('Error in message_delivered:', err);
    }
  });

  // Обновление последнего прочитанного сообщения в комнате
  socket.on('messages_read', async ({ roomId, lastReadMessageId }, ack) => {
    let acknowledged = false;
    const respond = (payload) => {
      if (acknowledged || typeof ack !== 'function') return;
      acknowledged = true;
      ack(payload);
    };
    //console.log(`[SERVER] messages_read received: userId=${socket.userId}, roomId=${roomId}, lastReadMessageId=${lastReadMessageId}`);
    try {
      const userId = Number(socket.userId) || 0;
      const roomIdNum = Number(roomId) || 0;
      const requestedLastRead = Number(lastReadMessageId) || 0;
      if (!userId || !roomIdNum || !requestedLastRead) {
        respond({ ok: false, error: 'invalid_read_payload' });
        return;
      }

      // Защита от битых/чужих ID: сохраняем только существующий ID в рамках этой комнаты.
      const safeLastRead =
        Number(
          await RoomMessage.max('id', {
            where: { roomId: roomIdNum, id: { [Op.lte]: requestedLastRead } },
          })
        ) || 0;
      if (!safeLastRead) {
        respond({ ok: false, error: 'message_not_found' });
        return;
      }
      if (safeLastRead !== requestedLastRead) {
        readDebugWarn('[ReadDebug][backend:messages_read][clamped]', {
          roomId: roomIdNum,
          userId,
          requestedLastRead,
          safeLastRead,
        });
      }

      // Обновляем только существующую запись в RoomUsers (без auto-create),
      // чтобы read-событие не могло добавить пользователя в личный чат.
      const roomUser = await RoomUsers.findOne({
        where: { roomId: roomIdNum, userId },
      });
      if (!roomUser) {
        const roomType = await Room.findByPk(roomIdNum, { attributes: ['type'] });
        console.warn('[PersonalGuard][backend:messages_read][skip-non-member]', {
          roomId: roomIdNum,
          roomType: roomType?.type || null,
          userId,
          requestedLastRead,
          safeLastRead,
        });
        respond({ ok: false, error: 'room_membership_required' });
        return;
      }
      if (Number(roomUser.lastReadMessageId || 0) < safeLastRead) {
        roomUser.lastReadMessageId = safeLastRead;
        await roomUser.save();
      }

      // Для личного чата уведомляем собеседника
      const room = await Room.findByPk(roomIdNum, {
        include: [{ model: User, through: { attributes: [] } }]
      });

      if (room.type === 'personal') {
        const otherUser = room.Users.find(u => u.id !== userId);
        if (otherUser) {
          //console.log(`[SERVER] sending read_updated to user ${otherUser.id} (room ${roomId}, lastReadMessageId=${lastReadMessageId})`);
          const otherUserId = otherUser.id;
          io.to(`user:${otherUserId}`).emit('read_updated', {
            userId: socket.userId,
            roomId: roomIdNum,
            lastReadMessageId: safeLastRead
          });
        }
      } else {
        //console.log(`[SERVER] otherUser not found for room ${roomId}`);
      }
      io.emit('readStatusUpdated', {
        roomId: roomIdNum,
        userId,
        lastReadMessageId: safeLastRead,
      });
      respond({ ok: true, roomId: roomIdNum, lastReadMessageId: safeLastRead });
      await relayCrossCompanyReadIfNeeded({ roomId: roomIdNum, safeLastRead, actorUserId: userId });
      // Для групповых чатов обработку добавим позже
    } catch (err) {
      console.error('[SERVER] error in messages_read:', err);
      respond({ ok: false, error: 'read_update_failed' });
    }
  });

  socket.on('telegram:join', (chatId) => {
    socket.join(`room-telegram-${Number(chatId)}`);
  });

  socket.on('telegram:leave', (chatId) => {
    socket.leave(`room-telegram-${Number(chatId)}`);
  });


  // socket.on('disconnect', () => {
  //   delete connectedSockets[userId];
  // });



  // // При отключении
  // socket.on('disconnect', () => {
  //   //console.log(`Клиент отключился: ${socket.id}`);
  // });
});



// // Эндпоинт для передачи заявки в чат
// app.post('/api/notifications/send-to-chat', (req, res) => {
//   console.log('>>> Получен POST /api/notifications/send-to-chat, тело:', req.body);
//   const data = req.body; // ожидаем, что здесь лежит ваш updatedPayload
//   // Формируем сообщение для чата

  
//   const date = new Date(data.requestDate).toLocaleString('ru-RU', {
//     year: 'numeric', month: '2-digit', day: '2-digit',
//     hour: '2-digit', minute: '2-digit'
//   });


//   const dt = new Date(data.serviceDate); // 2025-06-22T14:00:00.000Z

//   const serviceDateStr = dt.toLocaleDateString('ru-RU', {
//     day: '2-digit',
//     month: '2-digit',
//     year: 'numeric',
//     timeZone: 'Asia/Vladivostok'
//   });

//   const textLines = [
//     `🆕 Новая консультация от ${date.split(',')[0]}:`,
//     `📞 Телефон: ${data.clientPhone}`,
//     `👤 Клиент: ${data.clientName}`,
//     `🏠 Адрес: ${data.address}`,
//     `💡 Требуется: ${data.serviceRequired}`,
//     `📦 Кол-во изделий: ${data.numberObjects}`,
//     `🗓 Дата: ${serviceDateStr}`,
//     `⏰ Время: ${data.serviceTime}`,
//     `💼 Технолог: ${data.technicName || '–'}`,
//     `💬 Комментарий: ${data.comment || '–'}`,
//     `💰 Оплата: ${data.paymentAmount}`,    
//     `🔗 Источник: ${data.source || '–'}`,
//   ].join('\n');

//   const chatMsg = {
//     _id: uuidv4(),
//     createdAt: new Date(),
//     user: { _id: 'system', name: 'Система' },
//     text: textLines,
//     metadata: {
//       ...data,
//       id: data.id,     
//     },
//   };

//   // Добавляем в память (для простоты; в продакшене хранить в БД)
//   chatHistory.push(chatMsg);
//   // Шлём всем подключённым клиентам
//   io.emit('message', chatMsg);
//   console.log('>>> Отправлено событие Socket.IO message:', chatMsg);

//   return res.sendStatus(200);
// });


// // Эндпоинт для отправки уведомления в чат
// app.post('/api/notifications/send-notification', (req, res) => {
//   const { id, technicName } = req.body;

//   if (!id || !technicName) {
//     return res.status(400).send('Missing id or technicName');
//   }

//   const notificationMessage = {
//     _id: uuidv4(),
//     createdAt: new Date(),
//     user: {
//       _id: technicName,
//       name: technicName,
//     },
//     text: `🚀 Взял: ${technicName}`,
//     metadata: {
//       id,
//       type: 'notification',
//     },
//   };

//   chatHistory.push(notificationMessage);
//   io.emit('message', notificationMessage);

//   res.sendStatus(200);
// });





// Запускаем сервер
const { startScheduledMessagesWorker } = require('./workers/scheduledMessagesWorker');
const { startRemindersWorker } = require('./workers/remindersWorker');
const { startAlertsWorker } = require('./workers/alertsWorker');
const { startConsultProjectReadyReminderWorker } = require('./workers/consultProjectReadyReminderWorker');
const { startSchedulerWorker } = require('./workers/schedulerWorker');
const { startFileSpaceTrashScheduler } = require('./workers/fileSpaceTrashScheduler');
const { startFileSpaceAntivirusWorker } = require('./workers/fileSpaceAntivirusWorker');
const { ensureReminderTable } = require('./controllers/reminderController');
const { ensureAlertTables } = require('./controllers/alertController');
const { ensureCrossChatTables } = require('./controllers/crossChatController');
const { ensureChatPinsTable } = require('./controllers/chatPinsController');
const { ensureSchedulerSeed } = require('./services/schedulerService');
ensureReminderTable().catch((err) => console.error('[reminders] ensure table failed:', err));
ensureAlertTables().catch((err) => console.error('[alerts] ensure tables failed:', err));
ensureCrossChatTables().catch((err) => console.error('[cross-chat] ensure table failed:', err));
ensureChatPinsTable().catch((err) => console.error('[chat-pins] ensure table failed:', err));
ensureSchedulerSeed().catch((err) => console.error('[scheduler] seed failed:', err));
startScheduledMessagesWorker();
startRemindersWorker();
startAlertsWorker();
startConsultProjectReadyReminderWorker();
startSchedulerWorker();
startFileSpaceTrashScheduler();
startFileSpaceAntivirusWorker();

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});




// app.use((req, res, next) => {
//     console.log(`Incoming Request: ${req.method} ${req.url}`);
//     console.log('Body:', req.body);
//     next();
//   });

// // Запускаем сервер только в том случае, если не находимся в тестовой среде
// if (process.env.NODE_ENV !== 'test') {
//     sequelize.sync({ alter: true }).then(() => {
//       console.log('База синхронизирована');
//       app.listen(PORT, () => {
//         console.log(`Server running on http://localhost:${PORT}`);
//       });
//     });
//   } else {
//     // Для тестов просто экспортируем приложение
//     module.exports = app;
//   }

// module.exports = app; // Экспортируем приложение для тестирования  
  

// // Синхронизируем модель с базой данных
// const sequelize = require('./config/database');
// sequelize.sync({ alter: true }).then(() => console.log('База синхронизирована'));






