const jwt = require('jsonwebtoken');
const db = require('../models');

const User = db.sequelize.models.User;

const JWT_SECRETS = String(process.env.SUPPORT_JWT_SECRETS || process.env.JWT_SECRET || 'your_secret_key')
  .split(',')
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const verifyWithConfiguredSecret = (token) => {
  let lastError = null;
  for (const secret of JWT_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Invalid token');
};

const supportAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет доступа' });

  try {
    const decoded = verifyWithConfiguredSecret(token);
    const userId = Number(decoded.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(403).json({ error: 'Некорректный токен' });
    }

    const providedName = String(req.headers['x-support-user-name'] || '').trim();
    let localUser = null;
    if (!providedName) {
      localUser = await User.findByPk(userId, { attributes: ['id', 'name', 'roleId'] });
    }

    req.user = {
      id: userId,
      name: providedName || localUser?.name || `Пользователь ${userId}`,
      roleId: Number(decoded.roleId ?? localUser?.roleId ?? 0),
    };
    next();
  } catch (_error) {
    return res.status(403).json({ error: 'Неверный токен поддержки' });
  }
};

module.exports = supportAuthMiddleware;
