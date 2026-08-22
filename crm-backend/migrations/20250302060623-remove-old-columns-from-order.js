'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Получаем описание таблицы 'order'
    const table = await queryInterface.describeTable('order');
    const columnsToRemove = ['reserveInSchedule', 'orderInstalled', 'orderPaid', 'defected'];

    for (const column of columnsToRemove) {
      // Если столбец существует – удаляем
      if (table[column]) {
        await queryInterface.removeColumn('order', column);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Получаем описание таблицы перед изменениями
    const table = await queryInterface.describeTable('order');
    const columns = {
      reserveInSchedule: { type: Sequelize.BOOLEAN, allowNull: true },
      orderInstalled: { type: Sequelize.BOOLEAN, allowNull: true },
      orderPaid: { type: Sequelize.BOOLEAN, allowNull: true },
      defected: { type: Sequelize.BOOLEAN, allowNull: true },
    };

    for (const [colName, colDef] of Object.entries(columns)) {
      // Если столбец отсутствует – добавляем
      if (!table[colName]) {
        await queryInterface.addColumn('order', colName, colDef);
      }
    }
  }
};