// Read migration history without exposing connection settings or credentials.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

async function migrationState(root, modulesRoot = root) {
  const backend = path.join(modulesRoot, 'crm-backend');
  require(path.join(backend, 'node_modules/dotenv')).config({
    path: path.join(root, 'crm-backend/.env'), quiet: true,
  });
  const config = require(path.join(backend, 'config/sequelize-cli.js')).production;
  if (config.dialect !== 'postgres') throw new Error('Rollback requires PostgreSQL migration history');
  const { Client } = require(path.join(backend, 'node_modules/pg'));
  const client = new Client({
    host: config.host, port: config.port, user: config.username,
    password: config.password, database: config.database,
    ssl: config.dialectOptions?.ssl, connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
  const schema = config.migrationStorageTableSchema || 'public';
  const table = config.migrationStorageTableName || 'SequelizeMeta';
  try {
    await client.connect();
    const { rows } = await client.query('SELECT name FROM ' + quote(schema) + '.' + quote(table) + ' ORDER BY name');
    const applied = rows.map(row => row.name).sort();
    const migrations = fs.readdirSync(path.join(root, 'crm-backend/migrations')).filter(name => /\.(js|cjs)$/.test(name));
    return {
      signature: crypto.createHash('sha256').update(JSON.stringify({
        host: config.host, port: config.port, database: config.database,
        schema, table, applied,
      })).digest('hex'),
      pending: migrations.filter(name => !applied.includes(name)),
    };
  } finally {
    await client.end();
  }
}
module.exports = { migrationState };
if (require.main === module) {
  migrationState(path.resolve(process.argv[2]), process.argv[3] && path.resolve(process.argv[3]))
    .then(value => console.log(JSON.stringify(value)))
    .catch(() => { console.error('Could not read migration history; rollback safety cannot be established.'); process.exitCode = 1; });
}

