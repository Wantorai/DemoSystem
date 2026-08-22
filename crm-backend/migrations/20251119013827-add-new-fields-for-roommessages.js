'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('RoomMessages', 'clientId', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addIndex('RoomMessages', {
      fields: ['clientId'],
      name: 'idx_room_messages_clientId',
      unique: true,
      where: {
        clientId: { [Sequelize.Op.ne]: null }
      }
    });

    await queryInterface.addColumn('RoomMessages', 'deliveryStatus', {
      type: Sequelize.ENUM('pending','sending','sent','failed'),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('RoomMessages', 'idx_room_messages_clientId').catch(()=>{});
    await queryInterface.removeColumn('RoomMessages', 'clientId').catch(()=>{});
    await queryInterface.removeColumn('RoomMessages', 'deliveryStatus').catch(()=>{});
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_room_messages_deliveryStatus";').catch(()=>{});
    }
  }
};
