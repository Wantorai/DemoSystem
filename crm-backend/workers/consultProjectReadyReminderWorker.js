const { Op } = require('sequelize');
const db = require('../models');
const { getIO } = require('../socket');
const { sendPushNotification } = require('../services/sendPushNotification');

const Record = db.sequelize.models.Record;
const Technic = db.sequelize.models.Technic;
const User = db.sequelize.models.User;
const Room = db.sequelize.models.Room;
const RoomUsers = db.sequelize.models.RoomUsers;
const RoomMessage = db.sequelize.models.RoomMessage;
const CRMConfig = db.sequelize.models.CRMConfig;
const StatusColorCRM = db.sequelize.models.StatusColorCRM;

let started = false;
let timer = null;

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_SENT_KEY = 'projectReadyReminderLastSentAt';
const REMINDER_SENDER_FIELD = 'consultProjectReminderSenderUserId';

function parseReminderHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 48;
  return n;
}

async function getReminderHours() {
  const cfg = await CRMConfig.findOne({
    where: { field: 'reminderReady' },
    attributes: ['value'],
  });
  return parseReminderHours(cfg?.value);
}

async function getPreferredReminderSenderUserId() {
  const cfg = await CRMConfig.findOne({
    where: { field: REMINDER_SENDER_FIELD },
    attributes: ['value'],
  });
  const fromCfg = Number(cfg?.value || 0);
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  return null;
}

async function findOrCreatePersonalRoomId(userA, userB) {
  const a = Number(userA);
  const b = Number(userB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  if (a === b) return null;

  const candidateRooms = await Room.findAll({
    where: { type: 'personal' },
    include: [
      {
        model: User,
        attributes: ['id'],
        through: { attributes: [] },
        where: { id: { [Op.in]: [a, b] } },
      },
    ],
  });

  for (const room of candidateRooms) {
    const users = await room.getUsers({ attributes: ['id'], through: { attributes: [] } });
    const ids = users.map((u) => Number(u.id)).sort((x, y) => x - y);
    if (ids.length === 2 && ids[0] === Math.min(a, b) && ids[1] === Math.max(a, b)) {
      return Number(room.id);
    }
  }

  const [userAObj, userBObj] = await Promise.all([User.findByPk(a), User.findByPk(b)]);
  if (!userAObj || !userBObj) return null;

  const room = await Room.create({
    name: `Личный чат: ${userAObj.name} - ${userBObj.name}`,
    type: 'personal',
  });

  await room.addUsers([userAObj, userBObj]);
  return Number(room.id);
}

async function resolveTargetUser(record) {
  if (!record?.technicName) return null;

  const technic = await Technic.findOne({
    where: { name: record.technicName },
    attributes: ['id', 'name', 'userId'],
  });

  if (technic?.userId) {
    const byId = await User.findByPk(Number(technic.userId), { attributes: ['id', 'name'] });
    if (byId) return byId;
  }

  const byName = await User.findOne({
    where: { name: record.technicName },
    attributes: ['id', 'name'],
  });
  return byName || null;
}

function parseAdminRoleIds() {
  const raw = String(process.env.ADMIN_ROLE_IDS || '').trim();
  if (!raw) return [2];
  const ids = raw
    .split(',')
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  return ids.length ? ids : [2];
}
async function resolveSenderUserId(targetUserId, preferredSenderUserId = null) {
  const preferred =
    Number.isFinite(Number(preferredSenderUserId)) && Number(preferredSenderUserId) > 0
      ? Number(preferredSenderUserId)
      : Number(process.env.CONSULT_PROJECT_REMINDER_SENDER_USER_ID || 0);
  if (Number.isFinite(preferred) && preferred > 0 && preferred !== Number(targetUserId)) {
    const preferredUser = await User.findByPk(preferred, { attributes: ['id'] });
    if (preferredUser) return Number(preferredUser.id);
  }

  const admin = await User.findOne({
    where: { roleId: { [Op.in]: parseAdminRoleIds() }, id: { [Op.ne]: Number(targetUserId) } },
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  if (admin) return Number(admin.id);

  const anyUser = await User.findOne({
    where: { id: { [Op.ne]: Number(targetUserId) } },
    attributes: ['id'],
    order: [['id', 'ASC']],
  });
  return anyUser ? Number(anyUser.id) : null;
}

async function sendReminderToTechnic(record, targetUser, preferredSenderUserId) {
  const senderUserId = await resolveSenderUserId(targetUser.id, preferredSenderUserId);
  if (!senderUserId) {
    throw new Error(`Cannot resolve sender user for target=${targetUser.id}`);
  }

  const roomId = await findOrCreatePersonalRoomId(senderUserId, targetUser.id);
  if (!roomId) {
    throw new Error(`Cannot find/create personal room for sender=${senderUserId} target=${targetUser.id}`);
  }

  const text = `Проект по ${record.address || 'адресу не указан'} не готов? Необходимо проверить и дать обратную связь!`;
  const created = await RoomMessage.create({
    roomId,
    userId: senderUserId,
    content: text,
    type: 'text',
    deliveryStatus: 'sent',
  });

  const full = await RoomMessage.findByPk(created.id, {
    include: [{ model: User, attributes: ['id', 'name'] }],
  });

  const io = getIO();
  if (io) {
    io.to(`room-${roomId}`).emit('newRoomMessage', full);
  }

  await sendPushNotification(
    [Number(targetUser.id)],
    'Напоминание по проекту',
    text,
    {
      type: 'messages',
      screen: 'room',
      roomId,
      source: 'consult-project-ready-reminder',
      recordId: Number(record.id),
    }
  );
}

function getLastSentAt(record) {
  const raw = record?.newParams?.[LAST_SENT_KEY];
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function shouldSendNow(record, reminderHours, now) {
  if (!record?.serviceDate) return false;
  if (record?.projectsReadyDate) return false;

  const serviceDate = new Date(record.serviceDate);
  if (Number.isNaN(serviceDate.getTime())) return false;

  const dueAt = new Date(serviceDate.getTime() + reminderHours * 60 * 60 * 1000);
  if (now < dueAt) return false;

  const lastSentAt = getLastSentAt(record);
  if (!lastSentAt) return true;

  return (now.getTime() - lastSentAt.getTime()) >= DAY_MS;
}

async function isRecordInActiveStatus(record) {
  const statusId = Number(record?.statusId || 0);
  if (!Number.isFinite(statusId) || statusId <= 0) return false;
  const status = await StatusColorCRM.findByPk(statusId, { attributes: ['key'] });
  const key = String(status?.key || '').trim().toLowerCase();
  return key === 'active';
}

async function markSent(record, nowIso) {
  const nextParams = { ...(record.newParams || {}), [LAST_SENT_KEY]: nowIso };
  await record.update({ newParams: nextParams });
}

async function processConsultProjectReadyReminders(options = {}) {
  const limit = Number(options.limit || 100);
  const recordId = Number(options.recordId || 0);
  const force = String(options.force || '').toLowerCase() === 'true' || options.force === true;
  const now = new Date();
  const reminderHours = await getReminderHours();
  const preferredSenderUserId = await getPreferredReminderSenderUserId();

  const whereClause = {
    active: true,
    technicName: { [Op.ne]: null },
    projectsReadyDate: { [Op.is]: null },
  };
  if (recordId > 0) whereClause.id = recordId;

  const candidates = await Record.findAll({
    where: whereClause,
    order: [['updatedAt', 'DESC']],
    limit,
  });

  let processed = 0;
  let sent = 0;
  const details = [];
  for (const record of candidates) {
    processed += 1;
    const activeStatus = await isRecordInActiveStatus(record);
    if (!activeStatus) {
      details.push({
        recordId: Number(record.id),
        sent: false,
        reason: 'status_key_not_active',
      });
      continue;
    }

    const shouldSend = force
      ? !record?.projectsReadyDate
      : shouldSendNow(record, reminderHours, now);
    if (!shouldSend) {
      details.push({
        recordId: Number(record.id),
        sent: false,
        reason: force ? 'projects_ready_or_invalid' : 'not_due_or_already_sent',
      });
      continue;
    }

    const targetUser = await resolveTargetUser(record);
    if (!targetUser) {
      console.warn(
        `[consult-project-ready] no target user for record=${record.id} technicName="${record.technicName}"`
      );
      details.push({
        recordId: Number(record.id),
        sent: false,
        reason: 'target_user_not_found',
      });
      continue;
    }

    try {
      await sendReminderToTechnic(record, targetUser, preferredSenderUserId);
      await markSent(record, now.toISOString());
      sent += 1;
      details.push({
        recordId: Number(record.id),
        sent: true,
        targetUserId: Number(targetUser.id),
      });
    } catch (err) {
      console.error(`[consult-project-ready] send failed record=${record.id}:`, err?.message || err);
      details.push({
        recordId: Number(record.id),
        sent: false,
        reason: String(err?.message || err),
      });
    }
  }

  return { processed, sent, details, reminderHours, force, recordId: recordId || null };
}

function startConsultProjectReadyReminderWorker(options = {}) {
  if (started) return;
  started = true;

  const intervalMs = Number(
    options.intervalMs ||
    process.env.CONSULT_PROJECT_READY_WORKER_MS ||
    DEFAULT_INTERVAL_MS
  );
  const limit = Number(options.limit || process.env.CONSULT_PROJECT_READY_WORKER_LIMIT || 100);

  const tick = async () => {
    try {
      const result = await processConsultProjectReadyReminders({ limit });
      if (result.sent > 0) {
        console.log(
          `[consult-project-ready-worker] processed=${result.processed} sent=${result.sent}`
        );
      }
    } catch (err) {
      console.error('[consult-project-ready-worker] tick error:', err);
    }
  };

  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  tick().catch(() => {});
  console.log(`[consult-project-ready-worker] started interval=${intervalMs}ms limit=${limit}`);
}

function stopConsultProjectReadyReminderWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  startConsultProjectReadyReminderWorker,
  stopConsultProjectReadyReminderWorker,
  processConsultProjectReadyReminders,
};
