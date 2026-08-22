'use strict';

const syncFunctionSql = (includeConflictFields) => `
  CREATE OR REPLACE FUNCTION filespace_file_sync_event()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  DECLARE
    row_data filespace_files%ROWTYPE;
    sync_event_type varchar(30);
  BEGIN
    IF TG_OP = 'DELETE' THEN
      row_data := OLD;
    ELSE
      row_data := NEW;
    END IF;
    IF row_data.status <> 'ready' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    sync_event_type := CASE
      WHEN TG_OP = 'DELETE' THEN 'purge'
      WHEN TG_OP = 'INSERT' THEN 'upsert'
      WHEN OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN 'delete'
      WHEN OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN 'restore'
      WHEN OLD.status <> 'ready' AND NEW.status = 'ready' THEN 'upsert'
      ELSE 'upsert'
    END;

    INSERT INTO filespace_sync_events (
      "eventType", "entityType", "entityId", "rootFolderId", "folderId", "versionId", payload, "createdAt"
    ) VALUES (
      sync_event_type,
      'file',
      row_data.id,
      filespace_root_folder(row_data."folderId"),
      row_data."folderId",
      row_data."currentVersionId",
      jsonb_build_object(
        'id', row_data.id,
        'folderId', row_data."folderId",
        'ownerId', row_data."ownerId",
        'name', row_data.name,
        'contentType', row_data."contentType",
        'size', row_data.size,
        'etag', row_data.etag,
        'currentVersionId', row_data."currentVersionId",
        'versionNumber', row_data."versionNumber",
        ${includeConflictFields ? `'conflictOfFileId', row_data."conflictOfFileId",
        'conflictBaseVersionId', row_data."conflictBaseVersionId",` : ''}
        'status', row_data.status,
        'scanStatus', row_data."scanStatus",
        'deletedAt', row_data."deletedAt",
        'updatedAt', row_data."updatedAt"
      ),
      now()
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END;
  $$;
`;

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('filespace_file_versions', 'versionNumber', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    const columns = await queryInterface.describeTable('filespace_files');
    if (!columns.conflictOfFileId) {
      await queryInterface.addColumn('filespace_files', 'conflictOfFileId', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'filespace_files', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
    if (!columns.conflictBaseVersionId) {
      await queryInterface.addColumn('filespace_files', 'conflictBaseVersionId', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }
    const indexNames = new Set((await queryInterface.showIndex('filespace_files')).map((index) => index.name));
    if (!indexNames.has('filespace_files_conflict_of')) {
      await queryInterface.addIndex('filespace_files', ['conflictOfFileId'], { name: 'filespace_files_conflict_of' });
    }
    await queryInterface.sequelize.query(syncFunctionSql(true));
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(syncFunctionSql(false));
    const indexNames = new Set((await queryInterface.showIndex('filespace_files')).map((index) => index.name));
    if (indexNames.has('filespace_files_conflict_of')) {
      await queryInterface.removeIndex('filespace_files', 'filespace_files_conflict_of');
    }
    const columns = await queryInterface.describeTable('filespace_files');
    if (columns.conflictBaseVersionId) await queryInterface.removeColumn('filespace_files', 'conflictBaseVersionId');
    if (columns.conflictOfFileId) await queryInterface.removeColumn('filespace_files', 'conflictOfFileId');
    await queryInterface.sequelize.query('DELETE FROM filespace_file_versions WHERE "versionNumber" IS NULL AND status = \'uploading\';');
    await queryInterface.changeColumn('filespace_file_versions', 'versionNumber', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
