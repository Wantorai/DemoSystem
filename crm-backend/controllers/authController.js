const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('../models');
const User = db.sequelize.models.User;
const { recordSecurityEventSafe } = require('../services/securityEventService');
// const Employee = db.sequelize.models.Employee;
require('dotenv').config();

const secretKey = process.env.JWT_SECRET;

const isMaxEnabled = () => Boolean((process.env.MAX_TOKEN || '').trim());
const isTelegramEnabled = () => Boolean((process.env.TELEGRAM_TOKEN || '').trim());
const isWhatsAppEnabled = () => Boolean((process.env.WHATSAPP_TOKEN || '').trim());
const AVATAR_DEBUG = false;
const avatarDebug = (event, payload) => {
  if (!AVATAR_DEBUG) return;
  try {
    console.log(`[AvatarDebug][backend][auth] ${event}`, payload);
  } catch {}
};
const normalizeAvatarPath = (value) => {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const uploadsIndex = raw.indexOf('/uploads/');
  if (uploadsIndex >= 0) return raw.slice(uploadsIndex);
  if (raw.startsWith('uploads/')) return `/${raw}`;
  if (raw.startsWith('/')) return raw;
  return `/uploads/avatars/${path.basename(raw)}`;
};

const serializeAuthUser = (user) => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  avatar: normalizeAvatarPath(user.avatar),
  roleId: user.roleId,
  isActive: user.isActive,
  canMax: isMaxEnabled() && user.canMax !== false,
  canTelegram: isTelegramEnabled() && user.canTelegram !== false,
  canWhatsApp: isWhatsAppEnabled() && user.canWhatsApp !== false,
});

// Авторизация (логин)
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // console.log("req.body = ", req.body)

    // Проверяем, существует ли пользователь
    const user = await User.findOne({ where: { name: username } });
    if (!user) {
      recordSecurityEventSafe({
        req,
        eventType: 'login_failed',
        statusCode: 401,
        username,
        details: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    }

    // Проверяем пароль
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      recordSecurityEventSafe({
        req,
        eventType: 'login_failed',
        statusCode: 401,
        username,
        details: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    }

    // Генерируем JWT
    const token = jwt.sign({ id: user.id, roleId: user.roleId }, secretKey, { expiresIn: "30d" });

    // Сохраняем токен в базе
    user.token = token;
    await user.save();

    // console.log("Сохраняем токен в базе = ", token)

    res.json({ token, user: serializeAuthUser(user) });
  } catch (error) {
    console.error("Ошибка авторизации:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
};

// Выход (разлогинивание)
const logout = async (req, res) => {
  try {
    const { id } = req.user; // Получаем id из токена (см. middleware)
    
    await User.update({ token: null }, { where: { id } });

    res.json({ message: "Вы вышли из системы" });
  } catch (error) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
};


const me = async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: ["id", "name", "roleId", "phone", "avatar", "isActive", "canMax", "canTelegram", "canWhatsApp"],
      });
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // console.log("user = ", user)


      res.json({ user: serializeAuthUser(user) });
    } catch (error) {
      res.status(500).json({ error: "Ошибка сервера" });
    }
  };

  const uploadAvatar = async (req, res) => {
    try {
      avatarDebug('uploadAvatar:request', {
        userId: req.user?.id ?? null,
        hasFile: Boolean(req.file),
        file: req.file ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
        } : null,
      });
      if (!req.file) {
        return res.status(400).json({ message: 'Файл аватара обязателен' });
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      const avatar = normalizeAvatarPath(req.file.filename || req.file.path);
      user.avatar = avatar;
      await user.save();
      avatarDebug('uploadAvatar:saved', {
        userId: user.id,
        avatar,
        persistedAvatar: user.avatar,
      });

      return res.json({ avatar, user: serializeAuthUser(user) });
    } catch (error) {
      console.error('Ошибка загрузки аватара:', error);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
  };

  const deleteAvatar = async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      user.avatar = null;
      await user.save();
      avatarDebug('deleteAvatar:saved', { userId: user.id, avatar: user.avatar });

      return res.json({ avatar: null, user: serializeAuthUser(user) });
    } catch (error) {
      console.error('Ошибка удаления аватара:', error);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
  };


  const loginMobApp = async (req, res) => {
    //console.log('Стучится клиент')
    const { phone, password } = req.body;
    //console.log('phone = ', phone, ' password = ', password)
    if (!phone || !password) {
      return res.status(400).json({ message: 'Телефон и пароль обязательны' });
    }

    try {
      const user = await User.findOne({ where: { phone: phone } });
      

      if (!user) {
        return res.status(401).json({ message: 'Сотрудник не найден' });
      }


      // 🔒 Проверяем активность
      if (!user.isActive) {
        return res.status(403).json({ error: 'Аккаунт деактивирован' });
      }


      // ✅ instead of `user.password !== password`:
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ message: 'Неверный пароль' });
      }

      const payload = {
        id: user.id,
      };

      const token = jwt.sign(payload, secretKey, { expiresIn: '30d' });

      res.json({ 
        token, 
        isActive: user.isActive,
        user: serializeAuthUser(user)
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  };


  const checkStatus = async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id); // через JWT
      if (!user) return res.status(404).json({ active: false });

      res.json({ isActive: user.isActive === true });
    } catch (err) {
      console.error('Ошибка проверки статуса:', err);
      res.status(500).json({ active: false });
    }
  };






  // ----------------Делал изначально с сотрудниками из телефонии------------------

  // const loginMobApp = async (req, res) => {
  //   const { phone, password } = req.body;

  //   if (!phone || !password) {
  //     return res.status(400).json({ message: 'Телефон и пароль обязательны' });
  //   }

  //   try {
  //     const employee = await Employee.findOne({ where: { fullNumber: phone } });
      

  //     if (!employee) {
  //       return res.status(401).json({ message: 'Сотрудник не найден' });
  //     }

  //     if (employee.employeeId.toString() !== password.toString()) {
  //       return res.status(401).json({ message: 'Неверный пароль' });
  //     }

  //     const payload = {
  //       id: employee.id,
  //     };

  //     const token = jwt.sign(payload, secretKey, { expiresIn: '1d' });

  //     res.json({ token, phone: employee.fullNumber });
  //   } catch (err) {
  //     console.error('Login error:', err);
  //     res.status(500).json({ message: 'Ошибка сервера' });
  //   }
  // };




    


module.exports = { login, logout, me, loginMobApp, checkStatus, uploadAvatar, deleteAvatar };
