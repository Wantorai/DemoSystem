'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('push_tokens');
    const additions = [
      ['provider', { type: Sequelize.STRING(32), allowNull: true }],
      ['platform', { type: Sequelize.STRING(32), allowNull: true }],
      ['manufacturer', { type: Sequelize.STRING(100), allowNull: true }],
      ['modelName', { type: Sequelize.STRING(150), allowNull: true }],
      ['osVersion', { type: Sequelize.STRING(50), allowNull: true }],
    ];

    for (const [name, definition] of additions) {
      if (!columns[name]) {
        await queryInterface.addColumn('push_tokens', name, definition);
      }
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('push_tokens');
    for (const name of [
      'osVersion',
      'modelName',
      'manufacturer',
      'platform',
      'provider',
    ]) {
      if (columns[name]) {
        await queryInterface.removeColumn('push_tokens', name);
      }
    }
  },
};
