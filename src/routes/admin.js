'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db');
const jwt     = require('../auth/jwt');

/* ─── Admin middleware ───────────────────────────────────────────────────── */
function requireAdmin(req, res, next) {
  // Option 1 : header secret pour scripts/CLI
  const secret = req.headers['x-admin-secret'];
  if (secret && secret === process.env.ADMIN_SECRET) return next();

  // Option 2 : JWT d'un tenant admin
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token);
      if (payload.isAdmin) return next();
    } catch {}
  }
  return res.status(403).json({ error: 'Accès administrateur requis.' });
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function generatePassword(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars[crypto.randomInt(chars.length)];
  }
  return pass;
}

/* ─── GET /admin/tenants ─── list all tenants ─────────────────────────────── */
router.get('/tenants', requireAdmin, async (_req, res) => {
  try {
    const tenants = await db('tenants')
      .select('id', 'name', 'email', 'active', 'plan', 'is_admin', 'created_at', 'last_sync_at')
      .orderBy('created_at', 'desc');
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /admin/tenants ─── create a new client account ────────────────── */
router.post('/tenants', requireAdmin, async (req, res) => {
  const { name, email, plan = 'beta' } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name et email requis.' });

  const existing = await db('tenants').where({ email }).first();
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà pour cet email.' });

  const plainPassword = generatePassword(12);
  const passwordHash  = await bcrypt.hash(plainPassword, 10);

  const [tenant] = await db('tenants').insert({
    name,
    email,
    password_hash: passwordHash,
    plan,
    active: true
  }).returning(['id', 'name', 'email', 'plan', 'active', 'created_at']);

  res.status(201).json({
    tenant,
    credentials: {
      email,
      password: plainPassword,
      note: 'Partagez ces identifiants avec le client. Le mot de passe ne sera plus affiché.'
    }
  });
});

/* ─── PUT /admin/tenants/:id ─── activate / deactivate (frontend uses PUT) ─── */
router.put('/tenants/:id', requireAdmin, async (req, res) => {
  const { active, plan } = req.body;
  const updates = {};
  if (typeof active === 'boolean') updates.active = active;
  if (plan) updates.plan = plan;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification.' });
  await db('tenants').where({ id: req.params.id }).update(updates);
  const updated = await db('tenants').where({ id: req.params.id }).select('id','name','email','active','plan').first();
  res.json(updated);
});

/* ─── POST /admin/subscriptions/:id/extend ─── add days to subscription ─── */
router.post('/subscriptions/:id/extend', requireAdmin, async (req, res) => {
  const days = parseInt(req.body.days, 10) || 30;
  const t    = await db('tenants').where({ id: req.params.id }).first();
  if (!t) return res.status(404).json({ error: 'Tenant introuvable' });

  function addDays(dateStr, n) {
    var d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = t.subscription_start || todayStr;
  const currentEnd = t.subscription_end
    ? new Date(t.subscription_end).toISOString().split('T')[0]
    : todayStr;
  const newEnd = addDays(currentEnd < todayStr ? todayStr : currentEnd, days);

  await db('tenants').where({ id: req.params.id }).update({
    subscription_start: startDate,
    subscription_end:   newEnd,
    warning_sent:       false,
    active:             true
  });
  const updated = await db('tenants').where({ id: req.params.id })
    .select('id','name','email','active','subscription_start','subscription_end').first();
  res.json(updated);
});

/* ─── PATCH /admin/tenants/:id ─── activate / deactivate ─────────────────── */
router.patch('/tenants/:id', requireAdmin, async (req, res) => {
  const { active, plan } = req.body;
  const updates = {};
  if (typeof active === 'boolean') updates.active = active;
  if (plan) updates.plan = plan;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucune modification fournie (active, plan).' });
  }

  await db('tenants').where({ id: req.params.id }).update(updates);
  const updated = await db('tenants')
    .where({ id: req.params.id })
    .select('id', 'name', 'email', 'active', 'plan')
    .first();
  res.json(updated);
});

/* ─── DELETE /admin/tenants/:id ─── permanently delete ───────────────────── */
router.delete('/tenants/:id', requireAdmin, async (req, res) => {
  await db('tenants').where({ id: req.params.id }).del();
  res.json({ success: true });
});

/* ─── POST /admin/tenants/:id/reset-password ─── generate new password ────── */
router.post('/tenants/:id/reset-password', requireAdmin, async (req, res) => {
  const plainPassword = generatePassword(12);
  const passwordHash  = await bcrypt.hash(plainPassword, 10);
  await db('tenants').where({ id: req.params.id }).update({ password_hash: passwordHash });
  const tenant = await db('tenants').where({ id: req.params.id }).select('email').first();
  res.json({
    credentials: { email: tenant.email, password: plainPassword }
  });
});

module.exports = { router, requireAdmin };
