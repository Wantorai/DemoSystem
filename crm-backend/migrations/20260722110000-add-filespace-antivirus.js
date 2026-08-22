'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('filespace_files', 'scanStatus', {
      type: Sequelize.ENUM('pending', 'scanning', 'clean', 'infected', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'skipped',
    });
    await queryInterface.addColumn('filespace_files', 'scanResult', { type: Sequelize.STRING(1000), allowNull: true });
    await queryInterface.addColumn('filespace_files', 'scanAttempts', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('filespace_files', 'scannedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.sequelize.query(`ALTER TABLE "filespace_files" ALTER COLUMN "scanStatus" SET DEFAULT 'pending';`);
    await queryInterface.addIndex('filespace_files', ['scanStatus', 'status', 'deletedAt'], { name: 'filespace_files_scan_queue' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('filespace_files', 'filespace_files_scan_queue');
    await queryInterface.removeColumn('filespace_files', 'scannedAt');
    await queryInterface.removeColumn('filespace_files', 'scanAttempts');
    await queryInterface.removeColumn('filespace_files', 'scanResult');
    await queryInterface.removeColumn('filespace_files', 'scanStatus');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_filespace_files_scanStatus";');
  },
};
