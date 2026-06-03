'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const migrationsDir = path.join(__dirname, 'migrations');

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: { directory: migrationsDir }
  },
  test: {
    client: 'pg',
    connection: process.env.DATABASE_URL_TEST,
    migrations: { directory: migrationsDir }
  },
  production: {
    client: 'pg',
    connection: { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } },
    migrations: { directory: migrationsDir }
  }
};
