'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем уникальный индекс/ограничение на поле `field`
    await queryInterface.addConstraint('crm_configs', {
      fields: ['field'],
      type: 'unique',
      name: 'crm_configs_field_unique_constraint'
    });
  },

  async down(queryInterface, Sequelize) {
    // Откатываем: удаляем это ограничение
    await queryInterface.removeConstraint('crm_configs', 'crm_configs_field_unique_constraint');
  }
};
