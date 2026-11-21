#!/usr/bin/env bash
# Called by deploy-aws.sh while holding the server deployment lock.
set -euo pipefail
root="${1:?application root required}"
snapshot="${2:?snapshot ID required}"
scripts=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state="$root/.ci-state"
# Validate schema and fully extract the snapshot BEFORE stopping any process.
node "$scripts/release-state.cjs" prepare "$root" "$snapshot"
printf '%s\n' "$snapshot" > "$state/deploy-in-progress"
for process in crm-fronend crm-backend transcription-worker; do
  if pm2 describe "$process" >/dev/null 2>&1; then pm2 stop "$process"; fi
done
node "$scripts/release-state.cjs" restore "$root" "$snapshot"
cd "$root/crm-backend"
pm2 startOrReload ecosystem.config.js --update-env
pm2 restart crm-fronend --update-env
bash "$scripts/health-check.sh" "$root"
pm2 save
revision=$(node "$scripts/release-state.cjs" revision "$root" "$snapshot")
printf '%s\n' "$revision" > "$state/successful-revision.tmp"
mv -- "$state/successful-revision.tmp" "$state/successful-revision"
rm -f -- "$state/deploy-in-progress"
echo "Rollback completed and HTTP checks passed: $revision"

