'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('filespace_audit_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      actorId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      action: { type: Sequelize.STRING(50), allowNull: false },
      entityType: { type: Sequelize.STRING(20), allowNull: false },
      entityId: { type: Sequelize.UUID, allowNull: true },
      entityName: { type: Sequelize.STRING(255), allowNull: true },
      folderId: { type: Sequelize.UUID, allowNull: true },
      details: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('filespace_audit_logs', ['createdAt'], { name: 'filespace_audit_created_at' });
    await queryInterface.addIndex('filespace_audit_logs', ['actorId', 'createdAt'], { name: 'filespace_audit_actor_created' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('filespace_audit_logs');
  },
};
