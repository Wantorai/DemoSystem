// Synchronize tracked application source; preserve server configuration and runtime data.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const apps = new Set(['crm-backend', 'crm-fronend']);
const protectedParts = new Set(['.git', 'node_modules', '.next', 'uploads', 'logs',
  'backups', 'tmp', '.venv', 'venv', 'vosk-models', 'replica', 'builds']);
function safe(name) {
  const parts = name.split('/');
  return !name.includes('\\') && parts.length > 1 && apps.has(parts[0])
    && parts.every(p => p && p !== '..' && p !== '.' && !protectedParts.has(p) && !p.startsWith('.env'))
    && !/\.(pem|key|p12|pfx|sql|dump|sqlite|db)$/.test(name);
}
function target(root, name) {
  if (!safe(name)) throw new Error('Unsafe managed path: ' + name);
  const result = path.resolve(root, name);
  const relative = path.relative(fs.realpathSync(root), result);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes root');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('Symlink in managed path: ' + name);
  }
  return result;
}
function list(root, directory, output = []) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = directory + '/' + entry.name;
    if (!safe(name)) continue;
    if (entry.isSymbolicLink()) throw new Error('Source symlink: ' + name);
    if (entry.isDirectory()) list(root, name, output);
    else if (entry.isFile()) output.push(name);
  }
  return output;
}
if (process.argv[2] === '--check') {
  const root = process.argv[3];
  const names = execFileSync('git', ['ls-files', '-z', '--', ...apps], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of names) {
    if (path.basename(name).startsWith('.env') && path.basename(name).includes('.example')) continue;
    target(root, name);
  }
} else {
  const source = path.resolve(process.argv[2]);
  const root = fs.realpathSync(process.argv[3]);
  const names = [...apps].flatMap(app => list(source, app)).sort();
  const manifest = path.join(root, '.ci-state', 'managed-files.json');
  const previous = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : [];
  // Validate all paths before touching the deployment.
  for (const name of new Set([...names, ...previous])) target(root, name);
  for (const name of names) {
    const destination = target(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(target(source, name), destination);
  }
  for (const name of previous) {
    if (!names.includes(name)) fs.rmSync(target(root, name), { force: true });
  }
  // Track failed releases too: a subsequent revert must remove their new files.
  fs.writeFileSync(manifest + '.tmp', JSON.stringify(names));
  fs.renameSync(manifest + '.tmp', manifest);
}

