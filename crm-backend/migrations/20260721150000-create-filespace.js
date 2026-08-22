'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('filespace_folders', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      parentId: { type: Sequelize.UUID, allowNull: true, references: { model: 'filespace_folders', key: 'id' }, onDelete: 'CASCADE' },
      ownerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      kind: { type: Sequelize.ENUM('personal', 'shared'), allowNull: false, defaultValue: 'personal' },
      deletedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('filespace_folders', ['ownerId', 'parentId'], { name: 'filespace_folders_owner_parent' });
    await queryInterface.addIndex('filespace_folders', ['ownerId'], {
      unique: true,
      where: { parentId: null, kind: 'personal', deletedAt: null },
      name: 'filespace_personal_root_per_owner',
    });

    await queryInterface.createTable('filespace_files', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      folderId: { type: Sequelize.UUID, allowNull: false, references: { model: 'filespace_folders', key: 'id' }, onDelete: 'CASCADE' },
      ownerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(255), allowNull: false },
      objectKey: { type: Sequelize.STRING(1024), allowNull: false, unique: true },
      contentType: { type: Sequelize.STRING(255), allowNull: false, defaultValue: 'application/octet-stream' },
      size: { type: Sequelize.BIGINT, allowNull: false },
      etag: { type: Sequelize.STRING(255), allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'ready', 'failed'), allowNull: false, defaultValue: 'pending' },
      deletedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('filespace_files', ['folderId', 'status', 'deletedAt'], { name: 'filespace_files_folder_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('filespace_files');
    await queryInterface.dropTable('filespace_folders');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_filespace_files_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_filespace_folders_kind";');
  },
};
