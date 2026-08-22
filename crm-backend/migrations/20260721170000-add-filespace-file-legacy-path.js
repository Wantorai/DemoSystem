'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('filespace_files', 'legacyPath', {
      type: Sequelize.STRING(1024),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('filespace_files', 'legacyPath');
  },
};
