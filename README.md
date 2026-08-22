# DemoSystem

DemoSystem is a demonstration build of a CRM and team collaboration platform.
It contains a Next.js frontend, an Express/Socket.IO backend, PostgreSQL data
access through Sequelize, background queues, file sharing, notifications and
voice-message transcription.

The public repository contains source code only. Credentials, environment
files, production data, backups and server access details are intentionally not
included.

## Components

- `crm-fronend` — Next.js web application.
- `crm-backend` — REST API, Socket.IO server and background workers.
- `filespace-desktop` — desktop client packaging project.
- `socdep-api` — a social deploy application.
- `docs` — project documentation.

## Local setup

Prerequisites: Node.js 22, PostgreSQL and Redis.

1. Copy `crm-backend/.env.example` to `crm-backend/.env` and set local values.
2. Copy `crm-fronend/.env.example` to `crm-fronend/.env.local`.
3. Install dependencies with `npm ci` in both application directories.
4. Apply backend migrations with `npx sequelize-cli db:migrate`.
5. Start the backend with `node server.js` and the frontend with `npm run dev`.

For Docker Compose, create a root `.env` containing `DB_PASSWORD`,
`JWT_SECRET` and `INTERNAL_API_SECRET`, then run `docker compose up --build`.

Voice transcription additionally requires Python dependencies from
`crm-backend/requirements.txt`, FFmpeg and a compatible Vosk model installed in
`vosk-models/`. Model binaries are deliberately not stored in Git.

## Deployment

The AWS demo host keeps its real environment files outside Git. After pulling
from the demo repository, run `./deploy.sh`; the script uses its own directory,
so it does not depend on a hard-coded server path.

This repository is a portfolio/demo project. It is not the production release
channel and must not contain production data or credentials.
