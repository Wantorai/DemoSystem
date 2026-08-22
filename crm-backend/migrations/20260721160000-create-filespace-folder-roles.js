'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('filespace_folders', 'allRolesAccess', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.createTable('filespace_folder_roles', {
      folderId: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'filespace_folders', key: 'id' },
        onDelete: 'CASCADE',
      },
      roleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('filespace_folder_roles', ['roleId', 'folderId'], {
      name: 'filespace_folder_roles_role_folder',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('filespace_folder_roles');
    await queryInterface.removeColumn('filespace_folders', 'allRolesAccess');
  },
};
