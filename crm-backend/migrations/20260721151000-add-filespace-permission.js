'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO permissions (resource, label)
      SELECT '/filespace', 'Файловое пространство'
      WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource = '/filespace');
    `);
    await queryInterface.sequelize.query(`
      INSERT INTO role_permissions ("roleId", "permissionId", allowed)
      SELECT r.id, p.id, TRUE
      FROM roles r
      CROSS JOIN permissions p
      WHERE p.resource = '/filespace'
      ON CONFLICT ("roleId", "permissionId") DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM role_permissions
      WHERE "permissionId" IN (SELECT id FROM permissions WHERE resource = '/filespace');
    `);
    await queryInterface.sequelize.query(`DELETE FROM permissions WHERE resource = '/filespace';`);
  },
};
