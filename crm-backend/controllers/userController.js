const db = require('../models');
const User = db.sequelize.models.User;
const Role = db.sequelize.models.Role;
const Technic = db.sequelize.models.Technic;
const Installer = db.sequelize.models.Installer;
const Manager = db.sequelize.models.Manager;
const ManagedDomain = db.sequelize.models.ManagedDomain;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const bcrypt = require("bcrypt");
const axios = require("axios");
const { Op } = require('sequelize');

const parseIdSet = (raw, fallback = "") =>
  new Set(
    String(raw || fallback)
      .split(",")
      .map((x) => Number(String(x || "").trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const SUPER_ADMIN_ROLE_IDS = parseIdSet(process.env.SUPER_ADMIN_ROLE_IDS, "1");
const SUPER_ADMIN_USER_IDS = parseIdSet(process.env.SUPER_ADMIN_USER_IDS, "");
const ADMIN_ROLE_IDS = parseIdSet(process.env.ADMIN_ROLE_IDS, "2");
const ADMIN_USERS_ALLOWED_HOSTS = new Set(
  String(process.env.ADMIN_USERS_ALLOWED_HOSTS || "orderspace.ru,backup.orderspace.ru,test.orderspace.ru")
    .split(",")
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_USERS_PROXY_SECRET = String(process.env.ADMIN_USERS_PROXY_SECRET || "").trim();
const ADMIN_USERS_PROXY_SECRET_HEADER = "x-admin-users-proxy-secret";
const ADMIN_USERS_PROXY_ORIGIN_HOST_HEADER = "x-admin-users-origin-host";
const AUTO_CHAT_BOOTSTRAP_DEBUG = String(process.env.AUTO_CHAT_BOOTSTRAP_DEBUG || "false").toLowerCase() === "true";
const SELF_CHAT_NAME = "Отправка себе";
const SELF_CHAT_TYPE = "personal";
const autoChatDebug = (...args) => {
  if (!AUTO_CHAT_BOOTSTRAP_DEBUG) return;
  console.log(...args);
};

const isRequestSuperAdmin = (req) => {
  const uid = Number(req.user?.id || 0);
  const rid = Number(req.user?.roleId || 0);
  return SUPER_ADMIN_USER_IDS.has(uid) || SUPER_ADMIN_ROLE_IDS.has(rid);
};

const extractHostName = (value) =>
  String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");

const getDirectAdminUsersHostCandidates = (req) => [
  req.headers?.host,
  req.headers?.["x-forwarded-host"],
  req.headers?.origin,
  req.headers?.referer,
];

const getTrustedAdminUsersProxyOriginHost = (req) => {
  if (!ADMIN_USERS_PROXY_SECRET) return "";
  const providedSecret = String(req.headers?.[ADMIN_USERS_PROXY_SECRET_HEADER] || "").trim();
  if (!providedSecret || providedSecret !== ADMIN_USERS_PROXY_SECRET) return "";
  const originHost = extractHostName(req.headers?.[ADMIN_USERS_PROXY_ORIGIN_HOST_HEADER]);
  return ADMIN_USERS_ALLOWED_HOSTS.has(originHost) ? originHost : "";
};

const getAllowedAdminUsersOriginHost = (req) => {
  const proxyOriginHost = getTrustedAdminUsersProxyOriginHost(req);
  if (proxyOriginHost) return proxyOriginHost;
  for (const candidate of getDirectAdminUsersHostCandidates(req)) {
    const host = extractHostName(candidate);
    if (ADMIN_USERS_ALLOWED_HOSTS.has(host)) return host;
  }
  return "";
};

const isAllowedAdminUsersHost = (req) => Boolean(getAllowedAdminUsersOriginHost(req));

const buildRemoteAdminHeaders = (req, contentType = false) => {
  const headers = {
    Authorization: req.headers.authorization || "",
  };
  if (contentType) headers["Content-Type"] = "application/json";

  const originHost = getAllowedAdminUsersOriginHost(req);
  if (ADMIN_USERS_PROXY_SECRET && originHost) {
    headers[ADMIN_USERS_PROXY_SECRET_HEADER] = ADMIN_USERS_PROXY_SECRET;
    headers[ADMIN_USERS_PROXY_ORIGIN_HOST_HEADER] = originHost;
  }

  return headers;
};

const getUsersAdminAccessMode = (req) => {
  if (isRequestSuperAdmin(req)) return 'full';
  const rid = Number(req.user?.roleId || 0);
  if (ADMIN_ROLE_IDS.has(rid)) {
    return isAllowedAdminUsersHost(req) ? 'full' : 'read';
  }
  return 'deny';
};

const canReadUsersAdmin = (req) => {
  const mode = getUsersAdminAccessMode(req);
  return mode === 'full' || mode === 'read';
};

const canWriteUsersAdmin = (req) => getUsersAdminAccessMode(req) === 'full';

const ensureUsersAdminAccess = (req, res) => {
  if (canWriteUsersAdmin(req)) return true;
  res.status(403).json({ error: "Доступ к пользователям запрещен" });
  return false;
};

const getUsersAccessMode = async (req, res) => {
  const mode = getUsersAdminAccessMode(req);
  if (mode === 'deny') {
    return res.status(403).json({ error: "Нет доступа" });
  }
  return res.json({
    mode,
    readOnly: mode !== 'full',
  });
};

const normalizeMachineIdField = (value) => {
  if (value == null) return null;
  const normalized = String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(',');
  return normalized || null;
};

const normalizeDomainInput = (raw) => {
  const source = String(raw || "").trim();
  if (!source) return "";
  const withProto = /^https?:\/\//i.test(source) ? source : `https://${source}`;
  try {
    const url = new URL(withProto);
    const host = String(url.hostname || "").trim().toLowerCase().replace(/^www\./, "");
    return host;
  } catch {
    return String(source)
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split(":")[0]
      .trim()
      .toLowerCase();
  }
};

const buildRemoteApiBase = (domain) => {
  const host = normalizeDomainInput(domain);
  if (!host) return "";
  return `https://${host}/api`;
};

const ensureSelfRoomForUser = async (userId) => {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return false;

  const candidateRooms = await Room.findAll({
    where: {
      name: SELF_CHAT_NAME,
      type: SELF_CHAT_TYPE,
    },
    attributes: ["id"],
    include: [{
      model: User,
      where: { id: uid },
      through: { attributes: [] },
      attributes: ["id"],
      required: true,
    }],
  });

  for (const room of candidateRooms) {
    const usersCount = await RoomUsers.count({ where: { roomId: room.id } });
    if (Number(usersCount) === 1) {
      return false;
    }
  }

  const room = await Room.create({
    name: SELF_CHAT_NAME,
    type: SELF_CHAT_TYPE,
    creatorUserId: uid,
  });
  await room.addUsers([uid]);
  return true;
};

const ensurePersonalChatsForUser = async (userId) => {
  const currentUserId = Number(userId);
  if (!Number.isFinite(currentUserId) || currentUserId <= 0) return { created: 0, existed: 0 };

  const currentUser = await User.findByPk(currentUserId, {
    attributes: ['id', 'name', 'isActive', 'canChat', 'system', 'autoCreatePersonalChats'],
  });
  if (!currentUser || currentUser.system === true || currentUser.autoCreatePersonalChats === false) {
    autoChatDebug('[auto-chat-bootstrap] skip: current user invalid or autoCreatePersonalChats=false', {
      userId: currentUserId,
      exists: Boolean(currentUser),
      autoCreatePersonalChats: currentUser?.autoCreatePersonalChats,
      system: currentUser?.system,
      isActive: currentUser?.isActive,
      canChat: currentUser?.canChat,
    });
    return { created: 0, existed: 0 };
  }

  const selfChatCreated = await ensureSelfRoomForUser(currentUserId);

  const candidates = await User.findAll({
    where: {
      id: { [Op.ne]: currentUserId },
      isActive: true,
      canChat: true,
      autoCreatePersonalChats: true,
      system: false,
    },
    attributes: ['id', 'name'],
  });
  autoChatDebug('[auto-chat-bootstrap] candidates loaded', { userId: currentUserId, candidatesCount: candidates.length });

  const allPersonalRooms = await Room.findAll({
    where: { type: 'personal' },
    attributes: ['id'],
    include: [{
      model: User,
      where: { id: currentUserId },
      through: { attributes: [] },
      attributes: ['id'],
      required: true,
    }],
  });

  const existingPartnerIds = new Set();
  for (const room of allPersonalRooms) {
    const rows = await RoomUsers.findAll({
      where: { roomId: room.id },
      attributes: ['userId'],
    });
    const ids = rows.map((r) => Number(r.userId)).filter((n) => Number.isFinite(n));
    if (ids.length !== 2) continue;
    if (!ids.includes(currentUserId)) continue;
    const partnerId = ids.find((id) => id !== currentUserId);
    if (partnerId) existingPartnerIds.add(partnerId);
  }

  let created = 0;
  let existed = 0;
  for (const otherUser of candidates) {
    const otherId = Number(otherUser.id);
    if (!Number.isFinite(otherId) || otherId <= 0) continue;
    if (existingPartnerIds.has(otherId)) {
      existed += 1;
      continue;
    }
    const room = await Room.create({
      name: `Чат с ${otherUser.name}`,
      type: 'personal',
      creatorUserId: currentUserId,
    });
    await room.addUsers([currentUserId, otherId]);
    created += 1;
  }

  autoChatDebug('[auto-chat-bootstrap] done', { userId: currentUserId, created, existed, selfChatCreated });
  return { created, existed, selfChatCreated };
};
// Получение всех пользователей
const getAllUsers = async (req, res) => {
  try {
      if (!canReadUsersAdmin(req)) {
        return res.status(403).json({ error: "Доступ к пользователям запрещен" });
      }

      const { roleId } = req.query;
      const where = {};
      if (roleId) {
        where.roleId = parseInt(roleId);
      }

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'roleId', 'phone', 'machineId', 'isActive', 'canChat', 'canMax', 'canTelegram', 'canWhatsApp', 'system', 'autoCreatePersonalChats'],
      include: [{
          model: db.sequelize.models.Technic,
          attributes: ['viewAll'],
        },
        {
          model: db.sequelize.models.Manager,
          attributes: ['viewAll'],
        },
      ],
      order: [['name', 'ASC']],

    });
    res.json(users);
  } catch (error) {
    console.error("Ошибка при получении пользователей:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};



// Получение пользователя по ID
const getUserById = async (req, res) => {
  try {
    if (!canReadUsersAdmin(req)) {
      return res.status(403).json({ error: "Доступ к пользователям запрещен" });
    }
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    res.json(user);
  } catch (error) {
    console.error("Ошибка при получении пользователя:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Создание пользователя
const createUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const { name, password, roleId, viewAll = false, phone, canChat = true, canMax = true, canTelegram = true, canWhatsApp = true, system = false, autoCreatePersonalChats = true, machineId = null } = req.body;
    const isSystemUser = system === true;
    const normalizedMachineId = normalizeMachineIdField(machineId);

    // console.log("Получаем юзера = ", req.body)

    if (!name || !password || !roleId || !phone) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    // Проверяем, существует ли уже пользователь с таким именем
    const existingUser = await User.findOne({ where: { name } });
    if (existingUser) {
      return res.status(400).json({ error: "Пользователь с таким именем уже существует" });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      password: hashedPassword,
      roleId,
      phone,
      machineId: normalizedMachineId,
      canChat, // Добавляем новое поле
      canMax,
      canTelegram,
      canWhatsApp,
      system: isSystemUser,
      autoCreatePersonalChats: isSystemUser ? false : autoCreatePersonalChats,
    });


    // Получаем роль
    const role = await Role.findByPk(roleId);

    if (role && role.name === 'Технолог') {
      // Создаём технаря
      await Technic.create({
        name: newUser.name,
        phone: '',
        userId: newUser.id,
        viewAll 
      });
    }

    if (role && role.name === 'Менеджер') {
      // Создаём менеджера
      await Manager.create({
        name: newUser.name,
        phone: '',
        userId: newUser.id,
        viewAll 
      });
    }


    if (role && role.name === 'Установщик') {
      // Создаём установщика
      await Installer.create({
        name: newUser.name,
        phone: '',
        userId: newUser.id,
        order: 99,
      });
    }

    if (!newUser.system && newUser.autoCreatePersonalChats !== false) {
      try {
        const bootstrap = await ensurePersonalChatsForUser(newUser.id);
        autoChatDebug('[auto-chat-bootstrap] triggered from createUser', {
          userId: Number(newUser.id),
          result: bootstrap,
        });
      } catch (chatInitErr) {
        console.error("Ошибка создания автоматических чатов нового пользователя:", chatInitErr);
      }
    }

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Ошибка при создании пользователя:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Обновление пользователя
const updateUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const { id } = req.params;
    const { name, password, roleId, viewAll, phone, isActive, canChat, canMax, canTelegram, canWhatsApp, system, autoCreatePersonalChats, machineId } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const prevAutoCreatePersonalChats = user.autoCreatePersonalChats !== false;

    if (name !== undefined) user.name = name;
    if (roleId !== undefined) user.roleId = roleId;
    if (viewAll !== undefined) user.viewAll = viewAll;
    if (phone !== undefined) user.phone = phone;
    if (machineId !== undefined) user.machineId = normalizeMachineIdField(machineId);
    if (isActive !== undefined) user.isActive = isActive;
    user.canChat = canChat !== undefined ? canChat : user.canChat;
    user.canMax = canMax !== undefined ? canMax : user.canMax;
    user.canTelegram = canTelegram !== undefined ? canTelegram : user.canTelegram;
    user.canWhatsApp = canWhatsApp !== undefined ? canWhatsApp : user.canWhatsApp;
    if (system !== undefined) user.system = system === true;
    user.autoCreatePersonalChats =
      user.system === true ? false : (autoCreatePersonalChats !== undefined ? autoCreatePersonalChats : user.autoCreatePersonalChats);

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    const currentRole = await Role.findByPk(user.roleId);
    if (currentRole && currentRole.name === 'Установщик') {
      const [installer] = await Installer.findOrCreate({
        where: { userId: user.id },
        defaults: { name: user.name, phone: user.phone, order: 99 },
      });
      if (installer.name !== user.name || installer.phone !== user.phone) {
        installer.name = user.name;
        installer.phone = user.phone;
        await installer.save();
      }
    }

    const nextAutoCreatePersonalChats = user.autoCreatePersonalChats !== false;
    if (!user.system && !prevAutoCreatePersonalChats && nextAutoCreatePersonalChats) {
      try {
        const bootstrap = await ensurePersonalChatsForUser(user.id);
        autoChatDebug('[auto-chat-bootstrap] triggered from updateUser', {
          userId: Number(user.id),
          prevAutoCreatePersonalChats,
          nextAutoCreatePersonalChats,
          result: bootstrap,
        });
      } catch (chatInitErr) {
        console.error("Ошибка доинициализации личных чатов при включении autoCreatePersonalChats:", chatInitErr);
      }
    }
    res.json(user);
  } catch (error) {
    console.error("Ошибка при обновлении пользователя:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Удаление пользователя
const deleteUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    // Удаляем связанного технолога, если он есть
    const technic = await Technic.findOne({ where: { userId: user.id } });
    if (technic) {
      await technic.destroy();
    }

    // Удаляем связанного менеджера, если он есть
    const manager = await Manager.findOne({ where: { userId: user.id } });
    if (manager) {
      await manager.destroy();
    }
    

    // Удаляем связанного установщика, если он есть
    const installer = await Installer.findOne({ where: { userId: user.id } });
    if (installer) {
      await installer.destroy();
    }

    await user.destroy();
    res.json({ message: "Пользователь удален" });
  } catch (error) {
    console.error("Ошибка при удалении пользователя:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Управление активностью пользователя 
const toggleUserActive = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.isActive = isActive;
    await user.save();

    res.json({ success: true, isActive });
  } catch (err) {
    console.error('Ошибка при обновлении isActive:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};


// Добавляем функцию для управления canChat
const toggleUserChatPermission = async (req, res) => {
  const { id } = req.params;
  const { canChat } = req.body;

  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.canChat = canChat;
    await user.save();

    res.json({ 
      success: true, 
      canChat,
      message: canChat 
        ? 'Пользователю разрешены личные чаты' 
        : 'Пользователю запрещены личные чаты'
    });
  } catch (err) {
    console.error('Ошибка при обновлении canChat:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const toggleUserMaxPermission = async (req, res) => {
  const { id } = req.params;
  const { canMax } = req.body;

  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.canMax = canMax;
    await user.save();

    res.json({
      success: true,
      canMax,
      message: canMax
        ? 'Пользователю разрешен доступ к MAX чатам'
        : 'Пользователю запрещен доступ к MAX чатам'
    });
  } catch (err) {
    console.error('Ошибка при обновлении canMax:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const toggleUserTelegramPermission = async (req, res) => {
  const { id } = req.params;
  const { canTelegram } = req.body;

  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.canTelegram = canTelegram;
    await user.save();

    res.json({
      success: true,
      canTelegram,
      message: canTelegram
        ? 'Пользователю разрешен доступ к Telegram чатам'
        : 'Пользователю запрещен доступ к Telegram чатам',
    });
  } catch (err) {
    console.error('Ошибка при обновлении canTelegram:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const toggleUserWhatsAppPermission = async (req, res) => {
  const { id } = req.params;
  const { canWhatsApp } = req.body;

  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.canWhatsApp = canWhatsApp;
    await user.save();

    res.json({
      success: true,
      canWhatsApp,
      message: canWhatsApp
        ? 'Пользователю разрешен доступ к WhatsApp чатам'
        : 'Пользователю запрещен доступ к WhatsApp чатам',
    });
  } catch (err) {
    console.error('Ошибка при обновлении canWhatsApp:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

const getRemoteRoles = async (req, res) => {
  try {
    if (!canReadUsersAdmin(req)) {
      return res.status(403).json({ error: "Доступ к пользователям запрещен" });
    }
    const domain = normalizeDomainInput(req.query?.domain);
    if (!domain) {
      return res.status(400).json({ error: "Укажите домен" });
    }

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.get(`${apiBase}/admin/roles`, {
      headers: buildRemoteAdminHeaders(req),
      timeout: 15000,
      validateStatus: () => true,
    });

    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось получить роли удаленной системы",
        details: remoteRes.data || null,
      });
    }

    return res.json(Array.isArray(remoteRes.data) ? remoteRes.data : []);
  } catch (error) {
    console.error("Ошибка при получении ролей удаленной системы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе ролей" });
  }
};

const getRemotePermissionsBundle = async (req, res) => {
  try {
    if (!canReadUsersAdmin(req)) {
      return res.status(403).json({ error: "Доступ к правам запрещен" });
    }
    const domain = normalizeDomainInput(req.query?.domain);
    if (!domain) {
      return res.status(400).json({ error: "Укажите домен" });
    }

    const apiBase = buildRemoteApiBase(domain);
    const authHeaders = buildRemoteAdminHeaders(req);

    const [rolesRes, syncRes, permissionsRes, proAccessRes] = await Promise.all([
      axios.get(`${apiBase}/admin/roles`, {
        headers: authHeaders,
        timeout: 20000,
        validateStatus: () => true,
      }),
      axios.post(`${apiBase}/admin/permissions/sync-permissions`, {}, {
        headers: buildRemoteAdminHeaders(req, true),
        timeout: 20000,
        validateStatus: () => true,
      }),
      axios.get(`${apiBase}/admin/permissions`, {
        headers: authHeaders,
        timeout: 20000,
        validateStatus: () => true,
      }),
      axios.get(`${apiBase}/admin/permissions/pro-access`, {
        headers: authHeaders,
        timeout: 20000,
        validateStatus: () => true,
      }),
    ]);

    if (rolesRes.status < 200 || rolesRes.status >= 300) {
      return res.status(rolesRes.status || 502).json({
        error: "Не удалось получить роли удаленной системы",
        details: rolesRes.data || null,
      });
    }
    if (syncRes.status < 200 || syncRes.status >= 300) {
      return res.status(syncRes.status || 502).json({
        error: "Не удалось синхронизировать страницы удаленной системы",
        details: syncRes.data || null,
      });
    }
    if (permissionsRes.status < 200 || permissionsRes.status >= 300) {
      return res.status(permissionsRes.status || 502).json({
        error: "Не удалось получить permissions удаленной системы",
        details: permissionsRes.data || null,
      });
    }
    if (proAccessRes.status < 200 || proAccessRes.status >= 300) {
      return res.status(proAccessRes.status || 502).json({
        error: "Не удалось получить PRO-доступы удаленной системы",
        details: proAccessRes.data || null,
      });
    }

    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const pages = Array.isArray(syncRes.data?.pages) ? syncRes.data.pages : [];
    const permissions = Array.isArray(permissionsRes.data) ? permissionsRes.data : [];
    const proAccess = Array.isArray(proAccessRes.data) ? proAccessRes.data : [];

    const rolePermissionsEntries = await Promise.all(
      roles.map(async (role) => {
        const roleId = Number(role?.id);
        if (!Number.isFinite(roleId) || roleId <= 0) return [String(roleId || 0), []];
        const rpRes = await axios.get(`${apiBase}/admin/roles/${roleId}/permissions`, {
          headers: authHeaders,
          timeout: 20000,
          validateStatus: () => true,
        });
        if (rpRes.status < 200 || rpRes.status >= 300) {
          return [String(roleId), []];
        }
        return [String(roleId), Array.isArray(rpRes.data) ? rpRes.data : []];
      })
    );
    const rolePermissionsByRole = Object.fromEntries(rolePermissionsEntries);

    return res.json({
      roles,
      pages,
      permissions,
      proAccess,
      rolePermissionsByRole,
    });
  } catch (error) {
    console.error("Ошибка при получении bundle прав удаленной системы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе прав" });
  }
};

const updateRemoteRolePermissions = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    const roleId = Number(req.params?.roleId);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });
    if (!Number.isFinite(roleId) || roleId <= 0) return res.status(400).json({ error: "Некорректный id роли" });

    const payload = { ...req.body };
    delete payload.domain;

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.post(`${apiBase}/admin/roles/${roleId}/permissions`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось обновить права роли удаленной системы",
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data || { success: true });
  } catch (error) {
    console.error("Ошибка при обновлении прав роли удаленной системы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе прав" });
  }
};

const updateRemotePermissionLabel = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    const permissionId = Number(req.params?.id);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });
    if (!Number.isFinite(permissionId) || permissionId <= 0) return res.status(400).json({ error: "Некорректный id страницы" });

    const payload = { ...req.body };
    delete payload.domain;

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.put(`${apiBase}/admin/permissions/${permissionId}`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось обновить label страницы удаленной системы",
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data || { success: true });
  } catch (error) {
    console.error("Ошибка при обновлении label удаленной страницы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе прав" });
  }
};

const updateRemoteProAccess = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });

    const payload = { items: Array.isArray(req.body?.items) ? req.body.items : [] };
    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.put(`${apiBase}/admin/permissions/pro-access`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось обновить PRO-доступ удаленной системы",
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data || { success: true });
  } catch (error) {
    console.error("Ошибка при обновлении PRO-доступа удаленной системы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе прав" });
  }
};

const createRemoteUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain);
    if (!domain) {
      return res.status(400).json({ error: "Укажите домен" });
    }

    const payload = { ...req.body };
    delete payload.domain;

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.post(`${apiBase}/admin/users`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });

    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось создать пользователя в удаленной системе",
        details: remoteRes.data || null,
      });
    }

    return res.status(201).json(remoteRes.data);
  } catch (error) {
    console.error("Ошибка при создании пользователя в удаленной системе:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе пользователей" });
  }
};

const getRemoteUsers = async (req, res) => {
  try {
    if (!canReadUsersAdmin(req)) {
      return res.status(403).json({ error: "Доступ к пользователям запрещен" });
    }
    const domain = normalizeDomainInput(req.query?.domain);
    if (!domain) {
      return res.status(400).json({ error: "Укажите домен" });
    }

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.get(`${apiBase}/admin/users`, {
      headers: buildRemoteAdminHeaders(req),
      timeout: 20000,
      validateStatus: () => true,
    });

    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось получить пользователей удаленной системы",
        details: remoteRes.data || null,
      });
    }

    return res.json(Array.isArray(remoteRes.data) ? remoteRes.data : []);
  } catch (error) {
    console.error("Ошибка при получении пользователей удаленной системы:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе пользователей" });
  }
};

const updateRemoteUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    const userId = Number(req.params?.id);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: "Некорректный id пользователя" });

    const payload = { ...req.body };
    delete payload.domain;

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.put(`${apiBase}/admin/users/${userId}`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось обновить пользователя удаленной системы",
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data);
  } catch (error) {
    console.error("Ошибка при обновлении удаленного пользователя:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе пользователей" });
  }
};

const deleteRemoteUser = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    const userId = Number(req.params?.id);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: "Некорректный id пользователя" });

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.delete(`${apiBase}/admin/users/${userId}`, {
      headers: buildRemoteAdminHeaders(req),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: "Не удалось удалить пользователя удаленной системы",
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data || { success: true });
  } catch (error) {
    console.error("Ошибка при удалении удаленного пользователя:", error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе пользователей" });
  }
};

async function proxyRemoteToggle(req, res, togglePath, genericError) {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain || req.query?.domain);
    const userId = Number(req.params?.id);
    if (!domain) return res.status(400).json({ error: "Укажите домен" });
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: "Некорректный id пользователя" });

    const payload = { ...req.body };
    delete payload.domain;

    const apiBase = buildRemoteApiBase(domain);
    const remoteRes = await axios.put(`${apiBase}/admin/users/${userId}/${togglePath}`, payload, {
      headers: buildRemoteAdminHeaders(req, true),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (remoteRes.status < 200 || remoteRes.status >= 300) {
      return res.status(remoteRes.status || 502).json({
        error: genericError,
        details: remoteRes.data || null,
      });
    }
    return res.json(remoteRes.data);
  } catch (error) {
    console.error(`${genericError}:`, error?.message || error);
    return res.status(502).json({ error: "Ошибка подключения к удаленной системе пользователей" });
  }
}

const toggleRemoteUserActive = async (req, res) =>
  proxyRemoteToggle(req, res, 'toggle-active', 'Не удалось изменить активность удаленного пользователя');
const toggleRemoteUserChatPermission = async (req, res) =>
  proxyRemoteToggle(req, res, 'toggle-chat', 'Не удалось изменить разрешение на чат удаленного пользователя');
const toggleRemoteUserMaxPermission = async (req, res) =>
  proxyRemoteToggle(req, res, 'toggle-max', 'Не удалось изменить доступ к MAX удаленного пользователя');
const toggleRemoteUserTelegramPermission = async (req, res) =>
  proxyRemoteToggle(req, res, 'toggle-telegram', 'Не удалось изменить доступ к Telegram удаленного пользователя');
const toggleRemoteUserWhatsAppPermission = async (req, res) =>
  proxyRemoteToggle(req, res, 'toggle-whatsapp', 'Не удалось изменить доступ к WhatsApp удаленного пользователя');

const getManagedDomains = async (req, res) => {
  try {
    if (!canReadUsersAdmin(req)) {
      return res.status(403).json({ error: "Доступ к пользователям запрещен" });
    }
    const rows = await ManagedDomain.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['domain', 'ASC']],
    });
    return res.json(rows);
  } catch (error) {
    console.error("Ошибка при получении managed_domains:", error);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
};

const upsertManagedDomain = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const domain = normalizeDomainInput(req.body?.domain);
    const labelRaw = String(req.body?.label || "").trim();
    if (!domain) {
      return res.status(400).json({ error: "Укажите домен" });
    }

    const [row] = await ManagedDomain.findOrCreate({
      where: { domain },
      defaults: {
        domain,
        label: labelRaw || domain,
        isActive: true,
        sortOrder: 0,
        lastSeenAt: new Date(),
      },
    });

    if (row) {
      row.isActive = true;
      row.label = labelRaw || row.label || domain;
      row.lastSeenAt = new Date();
      await row.save();
    }

    return res.status(201).json(row);
  } catch (error) {
    console.error("Ошибка при upsert managed domain:", error);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
};

const deleteManagedDomain = async (req, res) => {
  try {
    if (!ensureUsersAdminAccess(req, res)) return;
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Некорректный id" });
    }
    const row = await ManagedDomain.findByPk(id);
    if (!row) return res.status(404).json({ error: "Домен не найден" });
    await row.destroy();
    return res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении managed domain:", error);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
};


module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,
  toggleUserChatPermission,
  toggleUserMaxPermission,
  toggleUserTelegramPermission,
  toggleUserWhatsAppPermission,
  getRemoteRoles,
  getRemotePermissionsBundle,
  updateRemoteRolePermissions,
  updateRemotePermissionLabel,
  updateRemoteProAccess,
  createRemoteUser,
  getRemoteUsers,
  updateRemoteUser,
  deleteRemoteUser,
  toggleRemoteUserActive,
  toggleRemoteUserChatPermission,
  toggleRemoteUserMaxPermission,
  toggleRemoteUserTelegramPermission,
  toggleRemoteUserWhatsAppPermission,
  getManagedDomains,
  upsertManagedDomain,
  deleteManagedDomain,
  getUsersAccessMode,
};

