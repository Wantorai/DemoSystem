'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_mobile_diagnostic_events_eventType') THEN
          CREATE TYPE "enum_mobile_diagnostic_events_eventType" AS ENUM ('heartbeat', 'metric', 'error', 'state');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_mobile_diagnostic_events_severity') THEN
          CREATE TYPE "enum_mobile_diagnostic_events_severity" AS ENUM ('info', 'warning', 'critical');
        END IF;
      END$$;

      CREATE TABLE IF NOT EXISTS "mobile_diagnostic_events" (
        "id" BIGSERIAL PRIMARY KEY,
        "userId" INTEGER NULL,
        "appKey" VARCHAR(80) NOT NULL,
        "eventType" "enum_mobile_diagnostic_events_eventType" NOT NULL DEFAULT 'metric',
        "severity" "enum_mobile_diagnostic_events_severity" NOT NULL DEFAULT 'info',
        "deviceId" VARCHAR(160) NOT NULL,
        "platform" VARCHAR(24) NULL,
        "runtimeVersion" VARCHAR(80) NULL,
        "appVersion" VARCHAR(80) NULL,
        "buildNumber" VARCHAR(80) NULL,
        "deviceModel" VARCHAR(160) NULL,
        "osVersion" VARCHAR(80) NULL,
        "networkType" VARCHAR(60) NULL,
        "screen" VARCHAR(160) NULL,
        "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "state" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "message" TEXT NULL,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "mobile_diag_app_occurred_idx"
        ON "mobile_diagnostic_events" ("appKey", "occurredAt");
      CREATE INDEX IF NOT EXISTS "mobile_diag_device_occurred_idx"
        ON "mobile_diagnostic_events" ("deviceId", "occurredAt");
      CREATE INDEX IF NOT EXISTS "mobile_diag_type_severity_idx"
        ON "mobile_diagnostic_events" ("eventType", "severity");
      CREATE INDEX IF NOT EXISTS "mobile_diag_user_idx"
        ON "mobile_diagnostic_events" ("userId");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "mobile_diagnostic_events";
      DROP TYPE IF EXISTS "enum_mobile_diagnostic_events_eventType";
      DROP TYPE IF EXISTS "enum_mobile_diagnostic_events_severity";
    `);
  },
};
