'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("role_permissions", {
      roleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "roles", key: "id" },
        onDelete: "CASCADE",
        primaryKey: true, // ✅ Устанавливаем первичный ключ
      },
      permissionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "permissions", key: "id" },
        onDelete: "CASCADE",
        primaryKey: true, // ✅ Устанавливаем первичный ключ
      },
      allowed: { 
        type: Sequelize.BOOLEAN, 
        defaultValue: false 
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("role_permissions");
  },
};

