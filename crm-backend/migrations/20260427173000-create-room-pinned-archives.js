/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('room_pinned_archives', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      roomId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Rooms',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'RoomMessages',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      pinnedId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      unpinnedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      archivedUntil: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('room_pinned_archives', ['userId', 'archivedUntil'], {
      name: 'idx_room_pinned_archives_user_ttl',
    });

    await queryInterface.addIndex('room_pinned_archives', ['roomId', 'unpinnedAt'], {
      name: 'idx_room_pinned_archives_room_unpinned',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('room_pinned_archives');
  },
};
