#!/usr/bin/env bash
set -euo pipefail
archive="${1:?archive required}"
revision="${2:?revision required}"
operation="${3:-deploy}"
[[ "$archive" =~ ^/tmp/demo-[0-9]+-[0-9]+\.tar\.gz$ ]]
[[ "$revision" =~ ^[a-f0-9]{40}$ ]]
[[ "$operation" == deploy || "$operation" == rollback ]]
root=/home/nodeapp/crm-system
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 22
fi
for command in node npm pm2 flock curl tar du timeout; do command -v "$command" >/dev/null; done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
test -d "$root/crm-backend"
test -f "$root/crm-backend/.env"
test -f "$root/.ci-deploy.env"
state="$root/.ci-state"
mkdir -p "$state"
chmod 700 "$state"
exec 9>"$state/deploy.lock"
flock -w 1800 9
stage=$(mktemp -d /tmp/demo-source.XXXXXX)
snapshot=""
modified=false
finish() {
  status=$?
  trap - EXIT INT TERM HUP
  set +e
  if [[ "$status" -ne 0 && "$modified" == true && "$operation" == deploy ]]; then
    echo "Deployment failed; attempting application rollback."
    if bash "$stage/scripts/ci/restore-aws.sh" "$root" "$snapshot"; then
      echo "::warning::Deployment failed; previous application restored. Database was not rolled back."
    else
      echo "::error::Automatic rollback failed or was blocked. Do not treat the previous revision marker as a healthy live deployment. Inspect .ci-state/deploy-in-progress."
    fi
  fi
  rm -rf -- "$stage"
  rm -f -- "$archive"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
tar -xzf "$archive" -C "$stage"
scripts="$stage/scripts/ci"
if [[ "$operation" == rollback ]]; then
  snapshot=$(node "$scripts/release-state.cjs" previous "$root")
  bash "$scripts/restore-aws.sh" "$root" "$snapshot"
  exit 0
fi
# Never label an unhealthy installation as a rollback baseline.
bash "$scripts/health-check.sh" "$root"
node "$scripts/release-state.cjs" prune "$root"
snapshot=$(node "$scripts/release-state.cjs" create "$root")
printf '%s\n' "$snapshot" > "$state/rollback-ready.tmp"
mv -- "$state/rollback-ready.tmp" "$state/rollback-ready"
printf '%s\n' "$snapshot" > "$state/deploy-in-progress"
modified=true
node "$scripts/sync-source.cjs" "$stage" "$root"
export NEXT_TELEMETRY_DISABLED=1
cd "$root/crm-backend"
timeout --signal=TERM --kill-after=30 600 npm ci
cd "$root/crm-fronend"
timeout --signal=TERM --kill-after=30 600 npm ci
timeout --signal=TERM --kill-after=30 900 npm run build
cd "$root/crm-backend"
# Any attempted migration makes automatic application rollback unsafe, even
# when it fails before Sequelize records the migration in SequelizeMeta.
node "$scripts/migration-state.cjs" "$root" > "$stage/migrations.json"
pending=$(node -e 'console.log(require(process.argv[1]).pending.length)' "$stage/migrations.json")
if [[ "$pending" -gt 0 ]]; then
  touch "$state/snapshots/$snapshot/migration-attempted"
  timeout --signal=TERM --kill-after=30 300 npx --no-install sequelize-cli db:migrate --env production
fi
pm2 startOrReload ecosystem.config.js --update-env
pm2 restart crm-fronend --update-env
bash "$scripts/health-check.sh" "$root"
pm2 save
printf '%s\n' "$revision" > "$state/successful-revision.tmp"
mv -- "$state/successful-revision.tmp" "$state/successful-revision"
rm -f -- "$state/deploy-in-progress"
modified=false
node "$scripts/release-state.cjs" prune "$root"
echo "AWS demo deployed: $revision; rollback snapshot: $snapshot"

