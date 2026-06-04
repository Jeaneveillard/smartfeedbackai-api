'use strict';
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const passport  = require('passport');
const rateLimit = require('express-rate-limit');
require('./auth/googleOAuth');

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

// Global rate limit — 300 req / 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes — réessayez dans quelques minutes.' }
}));

// Stricter limit on auth endpoints — 20 req / 15 min per IP
app.use('/auth/google', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives de connexion.' }
}));

// API write operations — 60 req / 15 min per IP
app.use('/api/reviews/:id/reply', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Trop de publications — réessayez dans quelques minutes.' }
}));

app.use('/auth', require('./routes/auth'));
app.use('/api/reviews',   require('./middleware/requireAuth'), require('./routes/reviews'));
app.use('/api/settings',  require('./middleware/requireAuth'), require('./routes/settings'));
app.use('/api/analytics', require('./middleware/requireAuth'), require('./routes/analytics'));
app.use('/api/email',     require('./middleware/requireAuth'), require('./routes/email'));
app.use('/admin',         require('./routes/admin').router);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Erreur serveur' });
});

module.exports = app;
