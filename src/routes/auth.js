'use strict';
const router      = require('express').Router();
const passport    = require('../auth/googleOAuth');
const jwt         = require('../auth/jwt');
const db          = require('../db');
const bcrypt      = require('bcryptjs');
const requireAuth = require('../middleware/requireAuth');
require('dotenv').config();

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/business.manage'];

router.get('/google', passport.authenticate('google', {
  scope: SCOPES,
  accessType: 'offline',
  prompt: 'consent'
}));

router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/?error=auth_failed'
  }),
  (req, res) => {
    const token = jwt.sign({ tenantId: req.user.id, email: req.user.email, isAdmin: !!req.user.is_admin });
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/?token=' + token);
  }
);

router.get('/me', requireAuth, (req, res) => {
  const { id, name, username, google_location_id, last_sync_at, is_admin } = req.tenant;
  // NOTE: email is intentionally NOT returned to the frontend
  res.json({ id, name, username: username || name, isAdmin: !!is_admin, googleConnected: !!req.tenant.google_access_token, google_location_id, last_sync_at });
});

router.delete('/logout', (_req, res) => res.json({ success: true }));

router.delete('/google/disconnect', requireAuth, async (req, res) => {
  try {
    await db('tenants').where({ id: req.tenant.id }).update({
      google_access_token:  null,
      google_refresh_token: null,
      google_account_id:    null,
      google_location_id:   null
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Location setup endpoints
const googleApiSvc = require('../services/googleApi');
const { syncTenant } = require('../services/reviewSync');

router.get('/setup/locations', requireAuth, async (req, res) => {
  if (!req.tenant.google_access_token) return res.status(400).json({ error: 'Google non connecté' });
  try {
    const accounts = await googleApiSvc.getAccounts(req.tenant.google_access_token);
    if (!accounts.length) return res.json({ locations: [] });
    const accountId = accounts[0].name;
    const locations = await googleApiSvc.getLocations(req.tenant.google_access_token, accountId);
    await db('tenants').where({ id: req.tenant.id }).update({ google_account_id: accountId });
    res.json({ locations: locations.map(function(l) { return { id: l.name, title: l.title || l.name }; }) });
  } catch (err) {
    res.status(502).json({ error: 'Erreur Google: ' + err.message });
  }
});

router.post('/setup/location', requireAuth, async (req, res) => {
  const { locationId } = req.body;
  if (!locationId) return res.status(400).json({ error: 'locationId requis' });
  try {
    await db('tenants').where({ id: req.tenant.id }).update({ google_location_id: locationId });
    const tenant = await db('tenants').where({ id: req.tenant.id }).first();
    syncTenant(tenant).catch(function(err) { console.error('[setup] sync error:', err.message); });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /auth/login — email + password ─────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }
  if (typeof email !== 'string' || email.length > 254) {
    return res.status(400).json({ error: 'Identifiants incorrects.' });
  }
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Identifiants incorrects.' });
  }

  // Accept email OR username (case-insensitive)
  const input = email.toLowerCase().trim();
  let tenant = await db('tenants').where({ email: input }).first();
  if (!tenant) tenant = await db('tenants').whereRaw('LOWER(username) = ?', [input]).first();

  // Always run bcrypt to prevent timing attacks that reveal whether an email exists
  const hashToCheck = (tenant && tenant.password_hash) || '$2a$10$invalidhashpaddingtopreventimenumerrtiming00000000000000';
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!tenant || !tenant.password_hash || !valid) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  if (!tenant.active) {
    return res.status(403).json({ error: 'Compte désactivé. Contactez votre administrateur.' });
  }

  const token = jwt.sign({
    tenantId: tenant.id,
    email:    tenant.email,
    isAdmin:  tenant.is_admin || false
  });
  // Return username, not email — email stays server-side only
  res.json({ token, name: tenant.name, username: tenant.username || tenant.name });
});

/* ─── GET /auth/invite/:token — validate invite link ────────────────────── */
router.get('/invite/:token', async (req, res) => {
  const tenant = await db('tenants').where({ invite_token: req.params.token }).first();
  if (!tenant) return res.status(404).json({ error: 'Lien d\'invitation invalide ou déjà utilisé.' });
  if (new Date(tenant.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Ce lien d\'invitation a expiré. Contactez l\'administrateur.' });
  }
  res.json({ valid: true, name: tenant.name, username: tenant.username });
});

/* ─── POST /auth/invite/:token — set password + activate account ─────────── */
router.post('/invite/:token', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }
  // Require at least: 1 uppercase, 1 lowercase, 1 digit
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 1 majuscule, 1 minuscule et 1 chiffre.' });
  }

  const tenant = await db('tenants').where({ invite_token: req.params.token }).first();
  if (!tenant) return res.status(404).json({ error: 'Lien d\'invitation invalide ou déjà utilisé.' });
  if (new Date(tenant.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Ce lien d\'invitation a expiré. Contactez l\'administrateur.' });
  }

  const hash = await bcrypt.hash(password, 10);
  await db('tenants').where({ id: tenant.id }).update({
    password_hash:      hash,
    active:             true,
    invite_token:       null,  // invalidate — one-time use
    invite_expires_at:  null
  });

  // Auto-login: sign a JWT
  const token = jwt.sign({
    tenantId: tenant.id,
    email:    tenant.email,
    isAdmin:  tenant.is_admin || false
  });
  res.json({ token, name: tenant.name, username: tenant.username || tenant.name });
});

module.exports = router;
