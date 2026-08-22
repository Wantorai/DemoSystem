const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.sequelize.models.User;
require('dotenv').config();

const secretKey = process.env.JWT_SECRET || 'your_secret_key';

const parseIdSet = (raw, fallback = '') =>
  new Set(
    String(raw || fallback)
      .split(',')
      .map((x) => Number(String(x || '').trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

const ADMIN_ROLE_IDS = parseIdSet(process.env.ADMIN_ROLE_IDS, '2');
const ADMIN_USERS_PROXY_SECRET = String(process.env.ADMIN_USERS_PROXY_SECRET || '').trim();
const ADMIN_USERS_PROXY_SECRET_HEADER = 'x-admin-users-proxy-secret';
const ADMIN_USERS_PROXY_ORIGIN_HOST_HEADER = 'x-admin-users-origin-host';
const ADMIN_USERS_ALLOWED_HOSTS = new Set(
  String(process.env.ADMIN_USERS_ALLOWED_HOSTS || 'orderspace.ru,backup.orderspace.ru,test.orderspace.ru')
    .split(',')
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
);

const extractHostName = (value) =>
  String(value || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');

const isAdminUsersProxyPath = (req) => {
  const path = String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/^\/api(?=\/)/, '')
    .replace(/\/+$/, '');
  return (
    path === '/admin/users' ||
    path.startsWith('/admin/users/') ||
    path === '/admin/roles' ||
    path.startsWith('/admin/roles/') ||
    path === '/admin/permissions' ||
    path.startsWith('/admin/permissions/')
  );
};

const getTrustedAdminUsersProxyOriginHost = (req) => {
  if (!ADMIN_USERS_PROXY_SECRET || !isAdminUsersProxyPath(req)) return '';
  const providedSecret = String(req.headers?.[ADMIN_USERS_PROXY_SECRET_HEADER] || '').trim();
  if (!providedSecret || providedSecret !== ADMIN_USERS_PROXY_SECRET) return '';
  const originHost = extractHostName(req.headers?.[ADMIN_USERS_PROXY_ORIGIN_HOST_HEADER]);
  return ADMIN_USERS_ALLOWED_HOSTS.has(originHost) ? originHost : '';
};

const getProxyAdminRoleId = () => {
  const [roleId] = Array.from(ADMIN_ROLE_IDS);
  return roleId || 2;
};

const authMiddleware = async (req, res, next) => {
  const proxyOriginHost = getTrustedAdminUsersProxyOriginHost(req);
  if (proxyOriginHost) {
    req.adminUsersProxy = true;
    req.adminUsersProxyOriginHost = proxyOriginHost;
    req.user = {
      id: 0,
      name: 'admin-users-proxy',
      roleId: getProxyAdminRoleId(),
      isActive: true,
    };
    return next();
  }

  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Нет доступа' });
  }

  try {
    const decoded = jwt.verify(token, secretKey);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Неверный токен' });
  }
};

module.exports = authMiddleware;