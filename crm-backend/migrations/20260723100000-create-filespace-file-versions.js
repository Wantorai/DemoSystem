'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const fileColumns = await queryInterface.describeTable('filespace_files');
    if (!fileColumns.currentVersionId) {
      await queryInterface.addColumn('filespace_files', 'currentVersionId', { type: Sequelize.UUID, allowNull: true });
    }
    if (!fileColumns.versionNumber) {
      await queryInterface.addColumn('filespace_files', 'versionNumber', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    }

    let versionTableExists = true;
    try {
      await queryInterface.describeTable('filespace_file_versions');
    } catch (_) {
      versionTableExists = false;
    }
    if (!versionTableExists) {
      await queryInterface.createTable('filespace_file_versions', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        fileId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'filespace_files', key: 'id' },
          onDelete: 'CASCADE',
        },
        baseVersionId: { type: Sequelize.UUID, allowNull: true },
        versionNumber: { type: Sequelize.INTEGER, allowNull: false },
        objectKey: { type: Sequelize.STRING(1024), allowNull: false, unique: true },
        authorId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        name: { type: Sequelize.STRING(255), allowNull: false },
        contentType: { type: Sequelize.STRING(255), allowNull: false, defaultValue: 'application/octet-stream' },
        size: { type: Sequelize.BIGINT, allowNull: false },
        etag: { type: Sequelize.STRING(255), allowNull: true },
        source: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'web' },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ready' },
        scanStatus: {
          type: Sequelize.ENUM('pending', 'scanning', 'clean', 'infected', 'failed', 'skipped'),
          allowNull: false,
          defaultValue: 'pending',
        },
        scanResult: { type: Sequelize.STRING(1000), allowNull: true },
        scanAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        scannedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    const indexNames = new Set((await queryInterface.showIndex('filespace_file_versions')).map((index) => index.name));
    if (!indexNames.has('filespace_file_versions_file_number')) {
      await queryInterface.addIndex('filespace_file_versions', ['fileId', 'versionNumber'], {
        unique: true,
        name: 'filespace_file_versions_file_number',
      });
    }
    if (!indexNames.has('filespace_file_versions_file_created')) {
      await queryInterface.addIndex('filespace_file_versions', ['fileId', 'createdAt'], {
        name: 'filespace_file_versions_file_created',
      });
    }

    await queryInterface.sequelize.query(`
      INSERT INTO filespace_file_versions (
        id, "fileId", "baseVersionId", "versionNumber", "objectKey", "authorId", name,
        "contentType", size, etag, source, status, "scanStatus",
        "scanResult", "scanAttempts", "scannedAt", "createdAt", "updatedAt"
      )
      SELECT
        (
          substr(md5(f.id::text || ':v1'), 1, 8) || '-' ||
          substr(md5(f.id::text || ':v1'), 9, 4) || '-' ||
          substr(md5(f.id::text || ':v1'), 13, 4) || '-' ||
          substr(md5(f.id::text || ':v1'), 17, 4) || '-' ||
          substr(md5(f.id::text || ':v1'), 21, 12)
        )::uuid,
        f.id, NULL, 1, f."objectKey", f."ownerId", f.name, f."contentType",
        f.size, f.etag, 'migration', f.status::text,
        f."scanStatus"::text::"enum_filespace_file_versions_scanStatus",
        f."scanResult", f."scanAttempts", f."scannedAt", f."createdAt", f."updatedAt"
      FROM filespace_files f
      WHERE f.status = 'ready'
      ON CONFLICT DO NOTHING;
    `);
    await queryInterface.sequelize.query(`
      UPDATE filespace_files f
      SET "currentVersionId" = v.id, "versionNumber" = v."versionNumber"
      FROM filespace_file_versions v
      WHERE v."fileId" = f.id AND v."versionNumber" = 1;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('filespace_file_versions');
    await queryInterface.removeColumn('filespace_files', 'versionNumber');
    await queryInterface.removeColumn('filespace_files', 'currentVersionId');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_filespace_file_versions_scanStatus";');
  },
};
