const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { syncSource, target } = require('./sync-source.cjs');
const { snapshotPath, artifactPath } = require('./release-state.cjs');
const helper = path.join(__dirname, 'release-state.cjs');
const oldRevision = 'a'.repeat(40), newRevision = 'b'.repeat(40);
const linux = process.platform === 'linux';
function write(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-rollback-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const code = {
    'crm-backend/server.js': 'old',
    'crm-backend/config/sequelize-cli.js': 'module.exports={production:{dialect:"postgres",host:"localhost",port:5432,username:"test",database:' + JSON.stringify(path.join(root, '.mock-database.json')) + '}};',
    'crm-backend/migrations/001.js': '// applied',
    'crm-fronend/app.js': 'old frontend',
  };
  for (const [name, content] of Object.entries(code)) write(root, name, content);
  write(root, 'crm-backend/node_modules/dotenv/index.js', 'exports.config=()=>({});');
  write(root, 'crm-backend/node_modules/pg/index.js',
    'exports.Client=class{constructor(c){this.c=c;}async connect(){}async end(){}async query(){return {rows:JSON.parse(require("fs").readFileSync(this.c.database)).map(name=>({name}))};}};');
  write(root, 'crm-backend/node_modules/version.txt', 'old backend dependencies');
  write(root, 'crm-fronend/node_modules/version.txt', 'old frontend dependencies');
  write(root, 'crm-fronend/.next/BUILD_ID', 'old-build');
  write(root, 'crm-fronend/.next/cache/test', 'excluded-cache');
  write(root, 'crm-backend/.env', 'KEEP_ENV=untouched');
  write(root, 'crm-backend/uploads/file.txt', 'user upload');
  write(root, '.mock-database.json', JSON.stringify(['001.js']));
  write(root, '.ci-state/managed-files.json', JSON.stringify(Object.keys(code)));
  write(root, '.ci-state/successful-revision', oldRevision);
  write(root, '.ci-deploy.env', 'BACKEND_HEALTH_URL=http://localhost:5000/\nFRONTEND_HEALTH_URL=http://localhost:3000/\n');
  return root;
}
function run(command, root, id) {
  return execFileSync(process.execPath, [helper, command, root, ...(id ? [id] : [])], { encoding: 'utf8' }).trim();
}
function changedSource(root, t) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-rollback-source-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  const names = JSON.parse(fs.readFileSync(path.join(root, '.ci-state/managed-files.json')));
  for (const name of names) write(source, name, fs.readFileSync(path.join(root, name)));
  write(source, 'crm-backend/server.js', 'new');
  write(source, 'crm-backend/new.js', 'newly introduced');
  return source;
}

test('partial source-copy failure journals new files so restore removes them', t => {
  const root = fixture(t);
  const baseline = changedSource(root, t);
  fs.unlinkSync(path.join(baseline, 'crm-backend/new.js'));
  write(baseline, 'crm-backend/server.js', 'old');
  const source = changedSource(root, t);
  write(source, 'crm-backend/aaa.js', 'partial new file');
  const original = fs.copyFileSync;
  let calls = 0;
  try {
    fs.copyFileSync = (...args) => { if (++calls === 2) throw Error('injected copy failure'); return original(...args); };
    assert.throws(() => syncSource(source, root), /injected/);
  } finally { fs.copyFileSync = original; }
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, '.ci-state/managed-files.json'))).includes('crm-backend/aaa.js'));
  syncSource(baseline, root);
  assert.equal(fs.existsSync(path.join(root, 'crm-backend/aaa.js')), false);
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/.env'), 'utf8'), 'KEEP_ENV=untouched');
});

test('snapshot and artifact paths reject traversal, protected files and symlinks', t => {
  const root = fixture(t);
  assert.throws(() => snapshotPath(root, '../elsewhere'));
  assert.throws(() => artifactPath(root, 'crm-backend/uploads'));
  assert.throws(() => target(root, 'crm-backend/.env'));
  if (linux) {
    fs.symlinkSync(os.tmpdir(), path.join(root, 'crm-backend/link'));
    assert.throws(() => target(root, 'crm-backend/link/file'));
  }
});

test('snapshot restores code, dependencies and compiled build without touching environment/uploads', { skip: !linux }, t => {
  const root = fixture(t);
  const id = run('create', root);
  syncSource(changedSource(root, t), root);
  write(root, 'crm-fronend/.next/BUILD_ID', 'bad-build');
  write(root, 'crm-backend/node_modules/version.txt', 'bad dependencies');
  run('prepare', root, id);
  run('restore', root, id);
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/server.js'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(root, 'crm-fronend/.next/BUILD_ID'), 'utf8'), 'old-build');
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/node_modules/version.txt'), 'utf8'), 'old backend dependencies');
  assert.equal(fs.existsSync(path.join(root, 'crm-backend/new.js')), false);
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/.env'), 'utf8'), 'KEEP_ENV=untouched');
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/uploads/file.txt'), 'utf8'), 'user upload');
});

test('changed migration history blocks restore before touching active code', { skip: !linux }, t => {
  const root = fixture(t);
  const id = run('create', root);
  write(root, 'crm-backend/server.js', 'new');
  write(root, '.mock-database.json', JSON.stringify(['001.js', '002.js']));
  assert.throws(() => run('prepare', root, id));
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/server.js'), 'utf8'), 'new');
});

test('attempted migration blocks restore even if migration history is unchanged', { skip: !linux }, t => {
  const root = fixture(t);
  const id = run('create', root);
  write(root, '.ci-state/snapshots/' + id + '/migration-attempted', '');
  assert.throws(() => run('prepare', root, id));
});

test('incomplete deployment cannot become a new rollback baseline', { skip: !linux }, t => {
  const root = fixture(t);
  write(root, '.ci-state/deploy-in-progress', 'release-unfinished');
  assert.throws(() => run('create', root));
});

function shellFixture(t, scenario) {
  const root = fixture(t);
  const source = changedSource(root, t);
  for (const file of ['deploy-aws.sh', 'restore-aws.sh', 'health-check.sh', 'sync-source.cjs', 'release-state.cjs', 'migration-state.cjs']) {
    write(source, 'scripts/ci/' + file, fs.readFileSync(path.join(__dirname, file)));
  }
  if (scenario === 'migration') write(source, 'crm-backend/migrations/002.js', '// pending');
  const runner = path.join(source, 'run-deploy.sh');
  fs.writeFileSync(runner, fs.readFileSync(path.join(__dirname, 'deploy-aws.sh'), 'utf8')
    .replace('root=/home/nodeapp/crm-system', 'root=' + JSON.stringify(root)));
  const bin = path.join(root, '.mock-bin');
  const mocks = {
    npm: 'if [ "$SCENARIO" = build ] && [ "$1" = run ]; then exit 1; fi\nexit 0',
    npx: 'exit 1',
    pm2: 'printf "%s\\n" "$*" >> "$APP_ROOT/.pm2-events"\nexit 0',
    curl: 'if [ "$SCENARIO" = health ] && grep -q new "$APP_ROOT/crm-backend/server.js"; then exit 1; fi\nexit 0',
    sleep: 'exit 0',
    timeout: 'shift 3\nexec "$@"',
  };
  for (const [name, body] of Object.entries(mocks)) {
    write(bin, name, '#!/bin/sh\n' + body + '\n');
    fs.chmodSync(path.join(bin, name), 0o755);
  }
  const env = { ...process.env, HOME: root, PATH: bin + ':' + process.env.PATH, APP_ROOT: root, SCENARIO: scenario };
  const deploy = operation => {
    const archive = '/tmp/demo-' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '.tar.gz';
    t.after(() => fs.rmSync(archive, { force: true }));
    execFileSync('tar', ['-czf', archive, '-C', source, 'crm-backend', 'crm-fronend', 'scripts']);
    return spawnSync('bash', [runner, archive, newRevision, operation], { encoding: 'utf8', env });
  };
  return { root, deploy, env };
}

for (const scenario of ['build', 'health']) {
  test('automatic rollback after ' + scenario + ' failure retains failed job status', { skip: !linux }, t => {
    const { root, deploy } = shellFixture(t, scenario);
    const result = deploy('deploy');
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Rollback completed/);
    assert.equal(fs.readFileSync(path.join(root, 'crm-backend/server.js'), 'utf8'), 'old');
    assert.equal(fs.readFileSync(path.join(root, '.ci-state/successful-revision'), 'utf8').trim(), oldRevision);
    assert.equal(fs.existsSync(path.join(root, '.ci-state/deploy-in-progress')), false);
  });
}
test('failed migration blocks automatic rollback and leaves recovery marker', { skip: !linux }, t => {
  const { root, deploy } = shellFixture(t, 'migration');
  const result = deploy('deploy');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Rollback blocked/);
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/server.js'), 'utf8'), 'new');
  assert.equal(fs.existsSync(path.join(root, '.ci-state/deploy-in-progress')), true);
});
test('successful deploy then manual rollback restores previous revision without migrations', { skip: !linux }, t => {
  const { root, deploy } = shellFixture(t, 'success');
  const first = deploy('deploy');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(fs.readFileSync(path.join(root, '.ci-state/successful-revision'), 'utf8').trim(), newRevision);
  const rollback = deploy('rollback');
  assert.equal(rollback.status, 0, rollback.stdout + rollback.stderr);
  assert.equal(fs.readFileSync(path.join(root, '.ci-state/successful-revision'), 'utf8').trim(), oldRevision);
  assert.equal(fs.readFileSync(path.join(root, 'crm-backend/server.js'), 'utf8'), 'old');
});

