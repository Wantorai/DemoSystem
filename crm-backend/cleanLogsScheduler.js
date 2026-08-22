// cleanLogsScheduler.js
const cron = require("node-cron");
const { OrderLog } = require("./models");
const { Op } = require("sequelize");

cron.schedule("0 2 * * 0", async () => {
  // Каждое воскресенье в 2:00 ночи
  const thresholdDate = new Date();
  thresholdDate.setMonth(thresholdDate.getMonth() - 36); // 3 года назад

  try {
    await OrderLog.destroy({
      where: {
        timestamp: {
          [Op.lt]: thresholdDate,
        },
      },
    });

    // console.log(`🧹 Очистка логов: удалено ${deletedLogsCount} записей старше 6 месяцев.`);
  } catch (error) {
    console.error("❌ Ошибка при удалении старых логов:", error);
  }
});
