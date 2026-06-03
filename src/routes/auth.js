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

  // Accept email OR username
  const input = email.toLowerCase().trim();
  let tenant = await db('tenants').where({ email: input }).first();
  if (!tenant) tenant = await db('tenants').where({ username: email.trim() }).first();

  if (!tenant || !tenant.password_hash) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }
  if (!tenant.active) {
    return res.status(403).json({ error: 'Compte désactivé. Contactez votre administrateur.' });
  }

  const valid = await bcrypt.compare(password, tenant.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = jwt.sign({
    tenantId: tenant.id,
    email:    tenant.email,
    isAdmin:  tenant.is_admin || false
  });
  // Return username, not email — email stays server-side only
  res.json({ token, name: tenant.name, username: tenant.username || tenant.name });
});

module.exports = router;
