'use strict';
const router       = require('express').Router();
const bcrypt       = require('bcryptjs');
const crypto       = require('crypto');
const db           = require('../db');
const jwt          = require('../auth/jwt');
const emailService = require('../services/emailService');

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
async function sendInviteEmail(email, name, username, inviteUrl, expires) {
  const transporter = emailService.getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const expiresStr = new Date(expires).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Invitation SmartFeedback AI</title></head>',
    '<body style="margin:0;padding:0;background:#F4F5F9;font-family:Inter,-apple-system,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F9;padding:32px 0;">',
    '  <tr><td align="center">',
    '    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">',
    // Header
    '      <tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;text-align:center;">',
    '        <div style="width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">',
    '          <span style="color:#fff;font-size:22px;">★</span>',
    '        </div>',
    '        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.4px;">SmartFeedback AI</div>',
    '        <div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:4px;">Plateforme de gestion d\'avis clients</div>',
    '      </td></tr>',
    // Body
    '      <tr><td style="padding:32px;">',
    '        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111827;">Bienvenue, ' + name + ' !</h1>',
    '        <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.6;">',
    '          Votre compte SmartFeedback AI a été créé. Cliquez le bouton ci-dessous pour choisir votre mot de passe et accéder à votre tableau de bord.',
    '        </p>',
    '        <div style="background:#F9FAFB;border-radius:8px;padding:14px 16px;margin-bottom:24px;">',
    '          <div style="font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">Votre identifiant</div>',
    '          <div style="font-size:16px;font-weight:700;color:#4F46E5;">@' + username + '</div>',
    '        </div>',
    '        <a href="' + inviteUrl + '"',
    '           style="display:block;text-align:center;background:#4F46E5;color:#fff;font-size:15px;font-weight:700;',
    '                  padding:14px 24px;border-radius:9px;text-decoration:none;letter-spacing:-.2px;margin-bottom:20px;">',
    '          Créer mon mot de passe →',
    '        </a>',
    '        <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;text-align:center;">',
    '          Ou copiez ce lien dans votre navigateur :',
    '        </p>',
    '        <p style="margin:0 0 20px;font-size:11px;color:#6B7280;text-align:center;word-break:break-all;">',
    '          ' + inviteUrl,
    '        </p>',
    '        <div style="background:#FEF3C7;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#92400E;">',
    '          ⏰ Ce lien expire le <strong>' + expiresStr + '</strong> et ne peut être utilisé qu\'une seule fois.',
    '        </div>',
    '      </td></tr>',
    // Footer
    '      <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 32px;text-align:center;">',
    '        <p style="margin:0;font-size:11px;color:#9CA3AF;">',
    '          Si vous n\'attendiez pas cet email, ignorez-le simplement.<br>',
    '          SmartFeedback AI · Gestion des avis clients',
    '        </p>',
    '      </td></tr>',
    '    </table>',
    '  </td></tr>',
    '</table></body></html>'
  ].join('\n');

  await transporter.sendMail({
    from:    '"SmartFeedback AI" <' + (process.env.SMTP_FROM || process.env.SMTP_USER) + '>',
    to:      email,
    subject: '🎉 Votre accès SmartFeedback AI — ' + name,
    html:    html
  });
}

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
      .where('is_admin', false)
      .select('id', 'name', 'username', 'email', 'active', 'plan', 'subscription_start', 'subscription_end', 'warning_sent', 'created_at', 'last_sync_at')
      .orderBy('created_at', 'desc');
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /admin/tenants ─── create a new client account ────────────────── */
router.post('/tenants', requireAdmin, async (req, res) => {
  const { name, email, username, plan = 'beta' } = req.body;
  if (!name || !email || !username) return res.status(400).json({ error: 'name, email et username requis.' });

  const existing = await db('tenants').where({ email }).first();
  if (existing) return res.status(409).json({ error: 'Un compte existe déjà pour cet email.' });

  const existingUser = await db('tenants').where({ username }).first();
  if (existingUser) return res.status(409).json({ error: 'Ce username est déjà pris.' });

  // Generate a secure invite token (valid 7 days)
  const inviteToken   = crypto.randomBytes(32).toString('hex');
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [tenant] = await db('tenants').insert({
    name,
    email,
    username,
    plan,
    active: false, // inactive until client sets their password
    invite_token:      inviteToken,
    invite_expires_at: inviteExpires
  }).returning(['id', 'name', 'username', 'email', 'plan', 'active', 'created_at']);

  const inviteUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '?invite=' + inviteToken;

  // Send invitation email automatically
  var emailSent = false;
  var emailError = null;
  try {
    await sendInviteEmail(email, name, username, inviteUrl, inviteExpires);
    emailSent = true;
  } catch (err) {
    emailError = err.message;
    console.error('[admin] Failed to send invite email to', email, ':', err.message);
  }

  res.status(201).json({
    tenant,
    invite: {
      url:       inviteUrl,
      token:     inviteToken,
      expires:   inviteExpires,
      emailSent: emailSent,
      emailError: emailError || undefined,
      note:      emailSent
        ? 'Email d\'invitation envoyé à ' + email + '. Le lien expire dans 7 jours.'
        : 'Email non envoyé (SMTP non configuré). Partagez ce lien manuellement.'
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

/* ─── POST /admin/tenants/:id/preview ─── get a short-lived JWT to view as client ─── */
router.post('/tenants/:id/preview', requireAdmin, async (req, res) => {
  const tenant = await db('tenants').where({ id: req.params.id, is_admin: false }).first();
  if (!tenant) return res.status(404).json({ error: 'Client introuvable' });
  // Sign a 2-hour JWT for this tenant — flagged as a preview session
  const token = jwt.sign({
    tenantId:  tenant.id,
    email:     tenant.email,
    isAdmin:   false,
    isPreview: true
  });
  res.json({ token, name: tenant.name, username: tenant.username });
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
  const tenant = await db('tenants').where({ id: req.params.id }).select('email', 'username', 'name').first();

  // Try to send the new password by email
  var emailSent = false;
  try {
    const transporter = emailService.getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from:    '"SmartFeedback AI" <' + (process.env.SMTP_FROM || process.env.SMTP_USER) + '>',
        to:      tenant.email,
        subject: '🔑 Votre nouveau mot de passe SmartFeedback AI',
        html:    '<p>Bonjour ' + tenant.name + ',</p>' +
                 '<p>Votre mot de passe a été réinitialisé.</p>' +
                 '<p><strong>Nouveau mot de passe :</strong> <code>' + plainPassword + '</code></p>' +
                 '<p>Connectez-vous sur <a href="' + (process.env.FRONTEND_URL || 'http://localhost:3000') + '">' +
                 (process.env.FRONTEND_URL || 'http://localhost:3000') + '</a> et changez votre mot de passe.</p>'
      });
      emailSent = true;
    }
  } catch (err) {
    console.error('[reset-password] email error:', err.message);
  }

  res.json({
    success: true,
    emailSent,
    username: tenant.username,
    // Only return plaintext if email failed — admin needs it as fallback
    ...(emailSent ? {} : { tempPassword: plainPassword })
  });
});

module.exports = { router, requireAdmin };
