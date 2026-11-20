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
- `filespace-desktop` — desktop client packaging project with S3 file synchronization.
- `socdep-api` — social publishing service.
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

## GitHub Actions: AWS demo

The source of product changes is the private CRM workspace. Selecting AWS in
its `deploy-multi.ps1` now synchronizes allowed changes into this repository;
it does not connect to AWS. Review `git diff`, commit, and push to `main`
here. Production still uses the original direct deployment.

The workflow `.github/workflows/aws-demo.yml` checks backend lint and Jest,
frontend lint, TypeScript and a Next.js build. Pull requests never deploy.
Pushes to main and manual runs on main deploy only after all checks pass and
the repository variable `AWS_DEPLOY_ENABLED` equals `true`.

### One-time setup

1. In GitHub Settings → Environments, create `aws-demo`. Restrict deployment
   branches to `main`.
2. Generate a dedicated SSH key for Actions and add its public key to the AWS
   deployment user's `authorized_keys`. The user must own or be able to write
   `/home/nodeapp/crm-system` and operate the existing PM2 processes.
   Keep the private key out of this public repository.
3. Add environment secrets: `AWS_HOST`, `AWS_USER`, `AWS_SSH_KEY` (private
   key), and `AWS_KNOWN_HOSTS` (the verified SSH host-key entry).
   Verify the host fingerprint through your existing trusted SSH connection
   or the AWS console; do not trust a fresh ssh-keyscan result without checking.
   The workflow currently uses SSH port 22. Ensure the AWS firewall allows
   the chosen GitHub runner to connect.
4. On AWS, create `/home/nodeapp/crm-system/.ci-deploy.env`:
   ```sh
   FRONTEND_HEALTH_URL=http://127.0.0.1:3000/
   BACKEND_HEALTH_URL=http://127.0.0.1:5000/
   ```
   Confirm these ports against your running application. Each URL must return
   a successful HTTP status without authentication. The backend root checks
   HTTP liveness only, not database readiness.
5. The server needs Node.js 22 (NVM under the SSH user's home is supported),
   npm, PM2, curl, tar, and flock. Preserve existing backend/frontend .env
   files, PostgreSQL, Redis and Python/FFmpeg transcription dependencies.
   This pipeline deploys the two Node applications, not desktop/mobile
   packages or the separate socdep-api service.
6. Push the workflow with deployment disabled first and check both CI jobs.
   Take a recoverable AWS database backup before enabling migrations.
   In Settings → Secrets and variables → Actions → Variables, add the
   **repository** variable `AWS_DEPLOY_ENABLED=true`. It must be a repository
   variable because it is evaluated before the environment job starts.
7. Run “Demo CI and AWS deploy” on main from the Actions tab. A successful run
   records the commit in `.ci-state/successful-revision` on AWS. Then pushes
   to main automatically run the full pipeline.

CI builds use localhost placeholder public URLs and no deployment secrets.
AWS rebuilds the same source commit with its own environment variables;
the CI-generated frontend is not shipped. npm ci uses committed lockfiles.
Dependencies and build finish before PM2 restarts. Sequelize migrations run
against the AWS database only; no production data is copied.

### Deletions, failures and rollback

Only application files managed by CI are removed when absent in a later commit.
Server environment files, uploads, logs, Python environments and model files
are preserved. The first CI run does not delete unknown legacy files already
on the server; review any old files left by previous incremental deployments.
Do not run the old manual AWS deploy concurrently with Actions. Workflow
concurrency plus a server flock prevent simultaneous CI deployments.

Deployment currently updates the existing installation in place. It is not an
atomic or zero-downtime release: an installation, build or migration failure
may leave changed files, and failed health checks fail the workflow without
automatically restoring the previous release.

For application rollback, revert the offending changes in this repository,
commit and push to main. The resulting commit must pass CI and is deployed
normally. For a broken release requiring immediate intervention, use the
recorded successful revision to restore the application manually. Do not
automatically undo database migrations: use a reviewed corrective migration,
or restore the AWS backup with an explicit recovery plan. A code revert alone
does not roll back the database.

Backend package.json/lock, PM2, migration configuration and this workflow are
demo-owned and protected from CRM synchronization. When CRM dependencies
change, reconcile the demo dependency files explicitly before pushing.
The sync script transfers current unpushed/local CRM changes: synchronize
before pushing the private repo, or those changes may no longer be selected.
Review the demo diff before every public push.

The GitHub Actions implementation is prepared locally; it is operational only
after secrets/server configuration are set and the first AWS run succeeds.

### Temporary SSH access through GitHub OIDC

The deploy job assumes an AWS role using OIDC; no permanent AWS access keys
are stored in GitHub. Configure aws-demo environment variables AWS_ROLE_ARN,
AWS_REGION and AWS_SECURITY_GROUP_ID. The trust policy must restrict the
repository Wantorai/DemoSystem, environment aws-demo and ref refs/heads/main.
The role needs ec2:AuthorizeSecurityGroupIngress and
ec2:RevokeSecurityGroupIngress on the selected security-group ARN only.

The workflow opens TCP 22 for the runner public IPv4 /32, waits for SSH,
deploys, and revokes the exact returned rule ID in an always() cleanup step.
Existing rules are never reused or deleted. Duplicate-rule errors stop the
deployment. Rule IDs are recorded in the run summary for manual cleanup.
A lost runner, force cancellation, expired credentials or AWS outage can
prevent cleanup: check the security group for the rule described as
GitHub Actions demo RUN_ID/RUN_ATTEMPT and remove it manually if necessary.
