#!/usr/bin/env bash
set -euo pipefail
archive="${1:?archive required}"
revision="${2:?revision required}"
[[ "$archive" =~ ^/tmp/demo-[0-9]+-[0-9]+\.tar\.gz$ ]]
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
root=/home/nodeapp/crm-system
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 22
fi
for command in node npm pm2 flock curl tar; do command -v "$command" >/dev/null; done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
test -d "$root/crm-backend"
test -f "$root/crm-backend/.env"
test -f "$root/.ci-deploy.env"
# Server-owned, non-secret configuration: FRONTEND_HEALTH_URL and BACKEND_HEALTH_URL.
source "$root/.ci-deploy.env"
: "${FRONTEND_HEALTH_URL:?}" "${BACKEND_HEALTH_URL:?}"
mkdir -p "$root/.ci-state"
exec 9>"$root/.ci-state/deploy.lock"
flock -w 1800 9
stage=$(mktemp -d /tmp/demo-source.XXXXXX)
trap 'rm -rf -- "$stage"; rm -f -- "$archive"' EXIT
tar -xzf "$archive" -C "$stage"
node "$stage/scripts/ci/sync-source.cjs" "$stage" "$root"
export NEXT_TELEMETRY_DISABLED=1
cd "$root/crm-backend"
npm ci
cd "$root/crm-fronend"
npm ci
npm run build
cd "$root/crm-backend"
npx --no-install sequelize-cli db:migrate --env production
pm2 startOrReload ecosystem.config.js --update-env
pm2 restart crm-fronend --update-env
for url in "$BACKEND_HEALTH_URL" "$FRONTEND_HEALTH_URL"; do
  healthy=false
  for attempt in {1..12}; do
    if curl --fail --silent --output /dev/null --connect-timeout 5 --max-time 15 "$url"; then
      healthy=true
      break
    fi
    sleep 5
  done
  if [[ "$healthy" != true ]]; then echo "HTTP health check failed" >&2; exit 1; fi
done
pm2 save
printf '%s\n' "$revision" > "$root/.ci-state/successful-revision"
echo "AWS demo deployed: $revision"

