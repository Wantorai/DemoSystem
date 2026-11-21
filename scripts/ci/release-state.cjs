// Server-local snapshots: application source + installed dependencies + compiled frontend.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { target, syncSource } = require('./sync-source.cjs');
const { migrationState } = require('./migration-state.cjs');
const artifacts = ['crm-backend/node_modules', 'crm-fronend/node_modules', 'crm-fronend/.next'];
const revisionPattern = /^[a-f0-9]{40}$/;
const idPattern = /^release-[a-zA-Z0-9-]+$/;

function atomic(file, value) {
  fs.writeFileSync(file + '.tmp', value, { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function statePath(root, ...parts) {
  const state = path.join(root, '.ci-state');
  if (fs.lstatSync(state).isSymbolicLink()) throw new Error('Symlinked state directory');
  return path.join(state, ...parts);
}
function snapshotPath(root, id) {
  if (!idPattern.test(id)) throw new Error('Invalid snapshot ID');
  const base = statePath(root, 'snapshots');
  const result = path.join(base, id);
  if (fs.existsSync(base) && fs.lstatSync(base).isSymbolicLink()) throw new Error('Symlinked snapshot directory');
  if (fs.existsSync(result) && fs.lstatSync(result).isSymbolicLink()) throw new Error('Symlinked snapshot');
  return result;
}
function artifactPath(root, name) {
  if (!artifacts.includes(name)) throw new Error('Unmanaged artifact');
  const result = path.join(root, name);
  const parent = path.dirname(result);
  if (fs.lstatSync(parent).isSymbolicLink() || (fs.existsSync(result) && fs.lstatSync(result).isSymbolicLink())) {
    throw new Error('Symlinked application artifact');
  }
  if (!path.resolve(result).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Artifact escapes application root');
  return result;
}
function metadata(root, id) {
  const dir = snapshotPath(root, id);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json')));
  if (!revisionPattern.test(meta.revision) || !/^[a-f0-9]{64}$/.test(meta.schema)) throw new Error('Invalid snapshot metadata');
  return meta;
}
async function create(root) {
  if (fs.existsSync(statePath(root, 'deploy-in-progress'))) throw new Error('Previous deployment needs recovery; use rollback or resolve it manually first');
  const revision = fs.readFileSync(statePath(root, 'successful-revision'), 'utf8').trim();
  if (!revisionPattern.test(revision)) throw new Error('No successful baseline revision');
  const manifest = JSON.parse(fs.readFileSync(statePath(root, 'managed-files.json')));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('No managed baseline files');
  let bytes = 0;
  for (const name of manifest) {
    const file = target(root, name);
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('Missing baseline source file');
    bytes += stat.size;
  }
  for (const name of artifacts) {
    const file = artifactPath(root, name);
    if (!fs.statSync(file).isDirectory()) throw new Error('Missing baseline artifact');
    bytes += Number(execFileSync('du', ['-sk', file], { encoding: 'utf8' }).split(/\s/)[0]) * 1024;
  }
  const space = fs.statfsSync(root);
  if (space.bavail * space.bsize < bytes * 2 + 256 * 1024 * 1024) throw new Error('Insufficient space for snapshot and restore');
  const schema = await migrationState(root);
  const id = 'release-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  const dir = snapshotPath(root, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    // The NUL list prevents filenames from becoming tar options. No environment/runtime files.
    fs.writeFileSync(path.join(dir, 'files.list'), [...manifest, ...artifacts].join('\0') + '\0');
    execFileSync('tar', ['--exclude=crm-fronend/.next/cache', '-cf', path.join(dir, 'application.tar'),
      '-C', root, '--null', '-T', path.join(dir, 'files.list')], { stdio: 'inherit' });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    atomic(path.join(dir, 'metadata.json'), JSON.stringify({
      revision, schema: schema.signature, createdAt: new Date().toISOString(), node: process.versions.node,
    }));
    console.log(id);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
function resolvePrevious(root) {
  const pointer = fs.existsSync(statePath(root, 'deploy-in-progress')) ? 'deploy-in-progress' : 'rollback-ready';
  const id = fs.readFileSync(statePath(root, pointer), 'utf8').trim();
  metadata(root, id);
  return id;
}
function assertRestorable(root, id) {
  const dir = snapshotPath(root, id);
  const meta = metadata(root, id);
  if (fs.existsSync(path.join(dir, 'migration-attempted'))) {
    throw new Error('Rollback blocked: this deployment attempted database migrations. Review database compatibility/recovery manually.');
  }
  if (meta.node.split('.')[0] !== process.versions.node.split('.')[0]) throw new Error('Node major changed since snapshot');
  return meta;
}
async function prepareRestore(root, id) {
  const meta = assertRestorable(root, id);
  const dir = snapshotPath(root, id);
  const restore = path.join(dir, 'restore');
  if (fs.existsSync(restore)) fs.rmSync(restore, { recursive: true, force: true });
  fs.mkdirSync(restore, { mode: 0o700 });
  execFileSync('tar', ['-xf', path.join(dir, 'application.tar'), '-C', restore], { stdio: 'inherit' });
  // Use snapshot dependencies even if npm ci removed/broke the installed dependencies.
  const schema = await migrationState(root, restore);
  if (schema.signature !== meta.schema) throw new Error('Database migration history or target changed; refusing application rollback');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  for (const name of manifest) {
    if (!fs.statSync(target(restore, name)).isFile()) throw new Error('Incomplete snapshot');
    target(root, name);
  }
  for (const name of artifacts) {
    artifactPath(root, name);
    if (!fs.statSync(artifactPath(restore, name)).isDirectory()) throw new Error('Incomplete snapshot artifacts');
  }
}
function restoreFiles(root, id) {
  assertRestorable(root, id);
  const restore = path.join(snapshotPath(root, id), 'restore');
  syncSource(restore, root);
  for (const name of artifacts) {
    const destination = artifactPath(root, name);
    const source = artifactPath(restore, name);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(source, destination);
  }
}
function prune(root) {
  const keep = new Set();
  for (const pointer of ['rollback-ready', 'deploy-in-progress']) {
    if (fs.existsSync(statePath(root, pointer))) keep.add(fs.readFileSync(statePath(root, pointer), 'utf8').trim());
  }
  const base = statePath(root, 'snapshots');
  if (!fs.existsSync(base)) return;
  for (const id of fs.readdirSync(base)) {
    if (!idPattern.test(id) || keep.has(id)) continue;
    fs.rmSync(snapshotPath(root, id), { recursive: true, force: true });
  }
}
module.exports = { atomic, snapshotPath, artifactPath, metadata, assertRestorable, restoreFiles, prune };
if (require.main === module) {
  (async () => {
    const [command, rootArg, id] = process.argv.slice(2);
    const root = fs.realpathSync(rootArg);
    if (command === 'create') await create(root);
    else if (command === 'previous') console.log(resolvePrevious(root));
    else if (command === 'prepare') await prepareRestore(root, id);
    else if (command === 'restore') restoreFiles(root, id);
    else if (command === 'revision') console.log(metadata(root, id).revision);
    else if (command === 'prune') prune(root);
    else throw new Error('Unknown snapshot command');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

