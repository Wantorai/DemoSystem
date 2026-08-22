'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    let tableExists = true;
    try {
      await queryInterface.describeTable('user_chat_pins');
    } catch (error) {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable('user_chat_pins', {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        pinKey: {
          type: Sequelize.STRING(191),
          allowNull: false,
        },
        orderIndex: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });
    }

    const indexes = await queryInterface.showIndex('user_chat_pins');
    const hasUserOrderIndex = indexes.some((idx) => idx.name === 'idx_user_chat_pins_user_order');
    const hasUserPinUnique = indexes.some((idx) => idx.name === 'user_chat_pins_user_pin_unique');

    if (!hasUserOrderIndex) {
      await queryInterface.addIndex('user_chat_pins', ['userId', 'orderIndex'], {
        name: 'idx_user_chat_pins_user_order',
      });
    }

    if (!hasUserPinUnique) {
      await queryInterface.addIndex('user_chat_pins', ['userId', 'pinKey'], {
        name: 'user_chat_pins_user_pin_unique',
        unique: true,
      });
    }
  },

  down: async (queryInterface) => {
    try {
      await queryInterface.removeIndex('user_chat_pins', 'user_chat_pins_user_pin_unique');
    } catch (error) {}

    try {
      await queryInterface.removeIndex('user_chat_pins', 'idx_user_chat_pins_user_order');
    } catch (error) {}

    try {
      await queryInterface.dropTable('user_chat_pins');
    } catch (error) {}
  },
};
