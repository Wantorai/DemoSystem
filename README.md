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

Deployment updates the existing installation in place and is not zero-downtime.
Before changing it, the server checks HTTP liveness, migration history and disk
space, then stores a server-local snapshot under `.ci-state/snapshots`. It
contains managed application source, installed node_modules and the compiled
Next.js build (excluding its cache), not .env, uploads or the database.
A valid managed-files manifest and successful-revision from the original CI
deployment are required. Allow roughly twice the application/dependency size
as free space for snapshot creation and restore. Snapshots are private on the
server and never uploaded as GitHub artifacts.

If installation, build, restart or HTTP checks fail, the deployment attempts
to restore the previous snapshot, restart PM2 and recheck HTTP. A recovered
deployment still reports failure in Actions, so the broken release is visible.
Restoration does not reinstall dependencies or rebuild the frontend.
The previous successful snapshot is retained; older unused snapshots are
removed after successful deployments. Restore work temporarily stops PM2
frontend, backend and transcription worker.

For manual rollback: Actions → Demo CI and AWS deploy → Run workflow →
branch main → operation rollback. It restores the snapshot saved before the
last deployment (or before the failed deployment needing recovery). It uses
the same OIDC, temporary SSH rule, workflow concurrency and server lock.
Frontend/backend CI jobs are intentionally skipped for rollback; no build or
migration command runs. Manual rollback remains available even when the
repository variable AWS_DEPLOY_ENABLED is false. There is no forward toggle
or arbitrary commit selection: repeated rollback restores the same baseline.

Migration safety is deliberately conservative. Pending migrations are detected
using PostgreSQL SequelizeMeta and the configured migrations directory. A
snapshot is marked non-restorable BEFORE any migration command is attempted,
even if that command subsequently fails and leaves no migration-history entry.
Both manual and automatic rollback refuse such a snapshot. They also refuse
if the current migration-history/DB-target signature differs from the saved
one. This does not detect out-of-band schema changes; do not run independent
migrations concurrently. A code snapshot never replaces a database backup.

If restore is blocked or fails, .ci-state/deploy-in-progress remains. Further
deploys refuse to make a new baseline from that potentially broken state.
Inspect the logs, review schema compatibility and choose a corrective migration
or database recovery plan. Do not delete the marker simply to bypass the check.
The successful-revision file alone does not assert health while that marker
exists. An interrupted SSH session or terminated runner may also require this
manual recovery; automatic rollback is not a guarantee against host failure.

After rollback, the GitHub main branch still contains the reverted-on-server
code. Revert/fix the offending commit before the next push; otherwise the next
deployment will install it again. The first deployment of this feature creates
a baseline of the currently running version, so it can itself be rolled back.

Tests: `node --test scripts/ci/rollback.test.cjs`. The complete suite requires
Linux with Node.js 22, tar, du and flock. It uses isolated temporary folders,
fake npm/PM2/HTTP commands and a fake database; it does not alter live services.
Windows runs the portable source-journal/path-safety tests only.

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
