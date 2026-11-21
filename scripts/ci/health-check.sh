#!/usr/bin/env bash
set -euo pipefail
root="${1:?application root required}"
source "$root/.ci-deploy.env"
: "${FRONTEND_HEALTH_URL:?}" "${BACKEND_HEALTH_URL:?}"
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

