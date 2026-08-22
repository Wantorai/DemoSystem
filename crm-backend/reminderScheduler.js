// reminderScheduler.js
const schedule = require('node-schedule');
const { format, addHours } = require('date-fns');
const { Record, Technic, Employee } = require('./models');
const { Op } = require('sequelize');


const TELEGRAM_REMINDERS_ENABLED = String(process.env.TELEGRAM_REMINDERS_ENABLED || '').toLowerCase() === 'true';
let botInstance = null;

// 1. Инициализация: сохраняем bot
function setBot(bot) {
  if (!TELEGRAM_REMINDERS_ENABLED) return;
  botInstance = bot;
}


async function scheduleReminderJob(record) {
  if (!TELEGRAM_REMINDERS_ENABLED) {
    return;
  }
  // 1) Ищем у записи имя технолога
  const technic = await Technic.findOne({ where: { name: record.technicName } });
  if (!technic) {
    console.warn(`⚠️ Не найден Technic с name=${record.technicName}`);
    return;
  }

  // 2) По телефону технолога — в Employee
  const phone = technic.phone.replace(/\D/g, '');
  const employee = await Employee.findOne({ where: { fullNumber: phone } });
  if (!employee || !employee.telegramId) {
    console.warn(`⚠️ Не найден сотрудник в Employee для fullNumber=${phone}`);
    return;
  }

  const userId = employee.telegramId;
  const date   = new Date(record.reminderCallDate);
  const jobName = `reminder-${record.id}`;

  // const recId = record.uuid || record.id // ищем по uiid в базе
  // console.log('recId = ', recId)
  // const savedRecord = await Record.findOne({where: {callUuid: recId}})
  // console.log('savedRecord = ', savedRecord)

  // 3) Логируем, чтобы точно знать, кому пошлём
  // console.log(`🚀 Планируем напоминание Record#${record.id} технику ${technic.name} (tg=${userId}) на ${format(date, 'dd.MM.yyyy HH:mm')}`);

  // 4) Удаляем старое задание
  const existing = schedule.scheduledJobs[jobName];
  if (existing) existing.cancel();
  

  schedule.scheduleJob(jobName, date, async () => {
    try {
      await botInstance.sendMessage(
        userId,
        `🔔 НАПОМИНАНИЕ О ЗВОНКЕ\n` +
        `👤 Клиент: ${record.clientName}\n` +
        `📞 Телефон: ${record.clientPhone}\n` +
        `📍 Адрес: ${record.address}\n` +
        `💬 Комментарий: ${record.comment}\n` +
        `🗓 Запланировано на: ${format(addHours(date, 7), 'dd.MM.yyyy HH:mm')}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '📞 Позвонить',
                  callback_data: `call_now:${record.id}`
                }
              ]
            ]
          }
        }
      );
      record.reminderSent = true;
      await record.save();
    } catch (err) {
      console.error(`Ошибка напоминания Record#${record.id}:`, err);
    }
  });
}

// 3. При старте сервера — подгружаем все несентые будущие
async function initScheduledReminders() {
  if (!TELEGRAM_REMINDERS_ENABLED) return;
  if (!botInstance) throw new Error('Bot не установлен в scheduler');
  const now = new Date();
  const pending = await Record.findAll({
    where: {
      reminderSent: false,
      reminderCallDate: { [Op.gt]: now }
    }
  });
  pending.forEach(scheduleReminderJob);
}

module.exports = {
  setBot,
  scheduleReminderJob,
  initScheduledReminders
};

