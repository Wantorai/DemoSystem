#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${PROJECT_DIR}/crm-fronend"
BACKEND_DIR="${PROJECT_DIR}/crm-backend"

echo "Deploying DemoSystem from ${PROJECT_DIR}"

cd "${FRONTEND_DIR}"
npm ci
npm run build
pm2 restart crm-fronend --update-env

cd "${BACKEND_DIR}"
npm ci
npx sequelize-cli db:migrate
pm2 startOrReload ecosystem.config.js --update-env

pm2 save
echo "DemoSystem deployment completed"
