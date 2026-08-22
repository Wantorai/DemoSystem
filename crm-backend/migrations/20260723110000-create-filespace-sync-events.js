'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    let tableExists = true;
    try {
      await queryInterface.describeTable('filespace_sync_events');
    } catch (_) {
      tableExists = false;
    }
    if (!tableExists) {
      await queryInterface.createTable('filespace_sync_events', {
        sequence: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        eventType: { type: Sequelize.STRING(30), allowNull: false },
        entityType: { type: Sequelize.STRING(20), allowNull: false },
        entityId: { type: Sequelize.UUID, allowNull: false },
        rootFolderId: { type: Sequelize.UUID, allowNull: true },
        folderId: { type: Sequelize.UUID, allowNull: true },
        versionId: { type: Sequelize.UUID, allowNull: true },
        payload: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });
    }

    const indexNames = new Set((await queryInterface.showIndex('filespace_sync_events')).map((index) => index.name));
    if (!indexNames.has('filespace_sync_events_root_sequence')) {
      await queryInterface.addIndex('filespace_sync_events', ['rootFolderId', 'sequence'], {
        name: 'filespace_sync_events_root_sequence',
      });
    }
    if (!indexNames.has('filespace_sync_events_created_at')) {
      await queryInterface.addIndex('filespace_sync_events', ['createdAt'], {
        name: 'filespace_sync_events_created_at',
      });
    }

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION filespace_root_folder(start_folder_id uuid)
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $$
        WITH RECURSIVE ancestors AS (
          SELECT id, "parentId"
          FROM filespace_folders
          WHERE id = start_folder_id
          UNION
          SELECT parent.id, parent."parentId"
          FROM filespace_folders parent
          JOIN ancestors child ON parent.id = child."parentId"
        )
        SELECT id FROM ancestors WHERE "parentId" IS NULL LIMIT 1;
      $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION filespace_folder_sync_event()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        row_data filespace_folders%ROWTYPE;
        sync_event_type varchar(30);
        sync_root_id uuid;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          row_data := OLD;
        ELSE
          row_data := NEW;
        END IF;
        sync_event_type := CASE
          WHEN TG_OP = 'DELETE' THEN 'purge'
          WHEN TG_OP = 'INSERT' THEN 'upsert'
          WHEN OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN 'delete'
          WHEN OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN 'restore'
          ELSE 'upsert'
        END;
        sync_root_id := CASE
          WHEN row_data."parentId" IS NULL THEN row_data.id
          ELSE filespace_root_folder(row_data.id)
        END;
        IF sync_root_id IS NULL AND row_data."parentId" IS NOT NULL THEN
          sync_root_id := filespace_root_folder(row_data."parentId");
        END IF;

        INSERT INTO filespace_sync_events (
          "eventType", "entityType", "entityId", "rootFolderId", "folderId", payload, "createdAt"
        ) VALUES (
          sync_event_type,
          'folder',
          row_data.id,
          sync_root_id,
          row_data."parentId",
          jsonb_build_object(
            'id', row_data.id,
            'name', row_data.name,
            'parentId', row_data."parentId",
            'ownerId', row_data."ownerId",
            'kind', row_data.kind,
            'allRolesAccess', row_data."allRolesAccess",
            'deletedAt', row_data."deletedAt",
            'updatedAt', row_data."updatedAt"
          ),
          now()
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
    `);

    await queryInterface.sequelize.query(`
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
    `);

    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS filespace_folder_sync_event_trigger ON filespace_folders;');
    await queryInterface.sequelize.query(`
      CREATE TRIGGER filespace_folder_sync_event_trigger
      AFTER INSERT OR UPDATE OR DELETE ON filespace_folders
      FOR EACH ROW EXECUTE FUNCTION filespace_folder_sync_event();
    `);
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS filespace_file_sync_event_trigger ON filespace_files;');
    await queryInterface.sequelize.query(`
      CREATE TRIGGER filespace_file_sync_event_trigger
      AFTER INSERT OR UPDATE OR DELETE ON filespace_files
      FOR EACH ROW EXECUTE FUNCTION filespace_file_sync_event();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS filespace_file_sync_event_trigger ON filespace_files;');
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS filespace_folder_sync_event_trigger ON filespace_folders;');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS filespace_file_sync_event();');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS filespace_folder_sync_event();');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS filespace_root_folder(uuid);');
    await queryInterface.dropTable('filespace_sync_events');
  },
};
