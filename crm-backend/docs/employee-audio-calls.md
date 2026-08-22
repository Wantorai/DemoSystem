# Employee audio calls

The mobile app uses LiveKit for encrypted WebRTC audio and the CRM backend for
authorization, provider selection, and call signalling. Provider selection is
made once per call so both participants always join the same infrastructure.

## Required backend environment

Create a LiveKit Cloud project and add these values to the production backend
environment:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

# Optional self-hosted primary provider. When all three values are present,
# it becomes the default provider for new calls.
LIVEKIT_SELF_HOSTED_URL=wss://livekit.orderspace.ru
LIVEKIT_SELF_HOSTED_API_KEY=...
LIVEKIT_SELF_HOSTED_API_SECRET=...
LIVEKIT_PRIMARY_PROVIDER=self_hosted
LIVEKIT_PROVIDER_HEALTH_CACHE_MS=15000

CALL_RING_TIMEOUT_MS=45000
CALL_MAX_DURATION_MS=28800000
```

The existing `LIVEKIT_*` values remain the Cloud fallback. If the primary
self-hosted HTTPS endpoint is unreachable when a call starts, the backend
selects Cloud for that entire call. It never allows the two participants to
select providers independently.

LiveKit API secrets must never be placed in the mobile or web frontend.

## Self-hosted VM requirements

Use a dedicated VM with a public IPv4 address. Do not colocate it with the
existing CRM nginx hosts: TCP 443 is already occupied there, while TURN/TLS
must be publicly reachable on TCP 443.

Recommended starting size for employee-only 1:1 audio:

- Ubuntu 24.04 LTS
- 2 vCPU and 4 GB RAM
- 30+ GB SSD
- public IPv4 with no NAT restrictions
- two DNS records pointing to that IPv4:
  `livekit.orderspace.ru` and `turn.orderspace.ru`
- inbound TCP: 80, 443, 7881
- inbound UDP: 3478, 50000-60000

Generate the production configuration with LiveKit's official
`livekit/generate` image. It installs Docker Compose, Caddy, automatic TLS,
LiveKit, Redis, and the `livekit-docker` systemd unit. Do not manually reuse
the Cloud API key/secret; generate a separate keypair for the self-hosted
instance.

After changing the environment, reinstall backend dependencies and restart the
backend process/container. The backend package dependency is
`livekit-server-sdk`.

## API

All endpoints require the existing JWT authentication:

- `POST /api/calls` with `{ "roomId": number }`
- `GET /api/calls/active`
- `GET /api/calls/:callId`
- `POST /api/calls/:callId/accept`
- `POST /api/calls/:callId/reject`
- `POST /api/calls/:callId/end`
- `POST /api/calls/:callId/token`

Calls are allowed only in a personal room containing exactly two active,
non-system employees with chat access. Call state is temporary and is not
stored as history. No media is recorded or uploaded to the CRM backend.

When ringing expires, or the caller hangs up before the callee answers, the
call ends with `status: missed`. Both participants receive the normal terminal
push so older APKs still clear their ringing UI. The callee additionally
receives an `action: missed` data push containing the personal room and caller
details. Newer Android clients use it to show a persistent missed-call
notification with a callback action. An explicit reject by the callee remains
`status: rejected` and does not create a missed-call notification.

The LiveKit grant allows microphone publishing only; camera and screen-share
publishing are not granted.

