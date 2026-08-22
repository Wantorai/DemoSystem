'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'canMax', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Доступ к MAX чатам',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'canMax');
  },
};
