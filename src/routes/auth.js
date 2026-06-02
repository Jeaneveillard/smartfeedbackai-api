'use strict';
const router      = require('express').Router();
const passport    = require('../auth/googleOAuth');
const jwt         = require('../auth/jwt');
const db          = require('../db');
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
    const token = jwt.sign({ tenantId: req.user.id, email: req.user.email });
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:3000') + '/?token=' + token);
  }
);

router.get('/me', requireAuth, (req, res) => {
  const { id, name, email, google_location_id, last_sync_at } = req.tenant;
  res.json({ id, name, email, googleConnected: !!req.tenant.google_access_token, google_location_id, last_sync_at });
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

module.exports = router;
