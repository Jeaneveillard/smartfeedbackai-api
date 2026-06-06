'use strict';
require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'FRONTEND_URL'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

const knexConfig = require('./db/knexfile');
const knex       = require('knex')(knexConfig[process.env.NODE_ENV] || knexConfig.development);

knex.migrate.latest()
  .then(([, ran]) => {
    if (ran.length) console.log('[migrate] applied:', ran.join(', '));
    return knex.destroy();
  })
  .then(() => {
    const app  = require('./app');
    const { startCron } = require('./cron/syncReviews');
    const port = process.env.PORT || 3001;
    app.listen(port, () => console.log(`API running on port ${port}`));
    if (process.env.NODE_ENV === 'production') startCron();
  })
  .catch(err => {
    console.error('[migrate] FAILED:', err.message);
    process.exit(1);
  });
