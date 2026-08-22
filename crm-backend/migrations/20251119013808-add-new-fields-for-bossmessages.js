'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('boss_messages', 'clientId', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // уникальный индекс по clientId (если хотите глобальную уникальность)
    await queryInterface.addIndex('boss_messages', {
      fields: ['clientId'],
      name: 'idx_boss_messages_clientId',
      unique: true,
      where: {
        clientId: { [Sequelize.Op.ne]: null }
      }
    });

    // опционально: deliveryStatus (ENUM)
    await queryInterface.addColumn('boss_messages', 'deliveryStatus', {
      type: Sequelize.ENUM('pending','sending','sent','failed'),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('boss_messages', 'idx_boss_messages_clientId').catch(()=>{});
    await queryInterface.removeColumn('boss_messages', 'clientId').catch(()=>{});

    // remove enum column
    await queryInterface.removeColumn('boss_messages', 'deliveryStatus').catch(()=>{});
    // and drop enum type (postgres)
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_boss_messages_deliveryStatus";').catch(()=>{});
    }
  }
};
