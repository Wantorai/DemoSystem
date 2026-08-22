'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Оборачиваем в транзакцию для безопасности
    return queryInterface.sequelize.transaction(async (transaction) => {
      // 1) Добавляем колонку series jsonb с дефолтом []
      await queryInterface.addColumn(
        'dashboard_configs',
        'series',
        {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: Sequelize.literal("'[]'::jsonb"),
        },
        { transaction }
      );

      // 2) Заполняем существующие записи, у которых series пустой или NULL,
      //    на основе dateField и valueFields (сохранение обратной совместимости).
      // Важно: используем двойные кавычки для имён колонок с camelCase
      const fillSql = `
        UPDATE dashboard_configs
        SET "series" = jsonb_build_array(
          jsonb_build_object(
            'id', ('s_migr_' || id::text),
            'label', COALESCE("label", 'Серия'),
            'dateField', COALESCE("dateField", ''),
            'valueFields', COALESCE("valueFields", '[]'::jsonb)
          )
        )
        WHERE "series" IS NULL OR "series" = '[]'::jsonb;
      `;

      await queryInterface.sequelize.query(fillSql, { transaction });
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('dashboard_configs', 'series', { transaction });
    });
  }
};
