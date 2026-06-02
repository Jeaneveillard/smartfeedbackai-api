'use strict';
require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'FRONTEND_URL'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

const app  = require('./app');
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API running on port ${port}`));
