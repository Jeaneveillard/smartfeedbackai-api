'use strict';
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const passport  = require('passport');
const rateLimit = require('express-rate-limit');
require('./auth/googleOAuth');

const app = express();

// Render/Cloudflare run behind a proxy — trust the first hop so express-rate-limit
// can read the real client IP from X-Forwarded-For (fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set('trust proxy', 1);

app.use(helmet());
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://smartfeedbackai.com',                       // primary custom domain
  'https://www.smartfeedbackai.com',                   // www custom domain
  'https://smartfeedbackai.jeaneveillard.workers.dev', // Cloudflare Workers (fallback)
  'https://splendid-peony-c3e6ce.netlify.app',         // Netlify (legacy)
  'http://localhost:3000',
  'http://localhost:3001'
].filter(Boolean);
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true
}));
// Stripe webhook — NO auth, raw body — must be BEFORE express.json()
const billing = require('./routes/billing');
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billing.webhookRouter);

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

// Strict limit on login — 10 attempts / 15 min per IP (brute force protection)
app.use('/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' }
}));

// Stricter limit on Google OAuth — 20 req / 15 min per IP
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
app.use('/api/billing',   require('./middleware/requireAuth'), billing.router);
// Public onboarding form — strict limit to prevent spam/abuse
app.use('/api/onboarding-requests', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes. Réessayez dans 15 minutes.' }
}));
app.use('/api/onboarding-requests',  require('./routes/onboarding'));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Erreur serveur' });
});

module.exports = app;
