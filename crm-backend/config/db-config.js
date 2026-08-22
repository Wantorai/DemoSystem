// db-config.js
const { Pool } = require('pg');

function createPoolFromEnv() {
  const {
    DATABASE_URL,
    DB_HOST,
    DB_PORT,
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
  } = process.env;

  if (DATABASE_URL) {
    return new Pool({
      connectionString: DATABASE_URL,
      // При необходимости включите ssl: { rejectUnauthorized: false } для облачных БД
    });
  }

  // Собираем из отдельных переменных
  return new Pool({
    host: DB_HOST || 'localhost',
    port: DB_PORT ? Number(DB_PORT) : 5432,
    database: DB_NAME || 'postgres',
    user: DB_USER,
    password: DB_PASSWORD,
    // max, idleTimeoutMillis и пр. можно добавить при необходимости
  });
}

module.exports = { createPoolFromEnv };
