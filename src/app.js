'use strict';
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const passport = require('passport');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());

app.use('/auth', require('./routes/auth'));
app.use('/api/reviews',   require('./middleware/requireAuth'), require('./routes/reviews'));
app.use('/api/settings',  require('./middleware/requireAuth'), require('./routes/settings'));
app.use('/api/analytics', require('./middleware/requireAuth'), require('./routes/analytics'));

app.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = app;
