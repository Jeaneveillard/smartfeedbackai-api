'use strict';
const router       = require('express').Router();
const db           = require('../db');
const emailService = require('../services/emailService');

const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || 'jeaneveillard@gmail.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/* POST /api/onboarding-requests — public, no auth */
router.post('/', async (req, res) => {
  const { business_name, sector, contact_name, email, phone, address, city, website } = req.body;

  if (!business_name || !sector || !contact_name || !email || !address || !city) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format email invalide.' });
  }

  const existing = await db('onboarding_requests')
    .where({ email, status: 'pending' })
    .first();
  if (existing) {
    return res.status(409).json({ error: 'Une demande avec cet email est déjà en cours de traitement.' });
  }

  await db('onboarding_requests').insert({
    business_name,
    sector,
    contact_name,
    email,
    phone:   phone   || null,
    address,
    city,
    website: website || null,
    status:  'pending'
  });

  // Notify admin by email (non-blocking)
  const transporter = emailService.getTransporter();
  if (transporter) {
    const html = [
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>',
      '<body style="font-family:Inter,-apple-system,sans-serif;background:#F4F5F9;margin:0;padding:32px;">',
      '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">',
      '<div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:24px 32px;">',
      '<div style="color:#fff;font-size:18px;font-weight:800;">SmartFeedback AI</div>',
      '<div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:4px;">Nouvelle demande d\'accès</div>',
      '</div>',
      '<div style="padding:28px 32px;">',
      '<h2 style="margin:0 0 20px;font-size:18px;font-weight:800;color:#111827;">📋 ' + business_name + '</h2>',
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">',
      '<tr><td style="padding:8px 0;color:#6B7280;width:140px;">Secteur</td><td style="padding:8px 0;color:#111827;font-weight:600;">' + sector + '</td></tr>',
      '<tr><td style="padding:8px 0;color:#6B7280;">Adresse</td><td style="padding:8px 0;color:#111827;">' + address + ', ' + city + '</td></tr>',
      '<tr><td style="padding:8px 0;color:#6B7280;">Site web</td><td style="padding:8px 0;color:#111827;">' + (website || '—') + '</td></tr>',
      '<tr><td style="padding:8px 0;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:14px;">Contact</td><td style="padding:8px 0;color:#111827;font-weight:600;border-top:1px solid #E5E7EB;padding-top:14px;">' + contact_name + '</td></tr>',
      '<tr><td style="padding:8px 0;color:#6B7280;">Email</td><td style="padding:8px 0;color:#4F46E5;">' + email + '</td></tr>',
      '<tr><td style="padding:8px 0;color:#6B7280;">Téléphone</td><td style="padding:8px 0;color:#111827;">' + (phone || '—') + '</td></tr>',
      '</table>',
      '<a href="' + FRONTEND_URL + '" style="display:inline-block;margin-top:24px;background:#4F46E5;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">',
      'Traiter la demande dans le panel admin →',
      '</a>',
      '</div>',
      '</div></body></html>'
    ].join('');

    transporter.sendMail({
      from:    '"SmartFeedback AI" <' + (process.env.SMTP_FROM || process.env.SMTP_USER) + '>',
      to:      ADMIN_EMAIL,
      subject: '[SmartFeedback AI] Nouvelle demande — ' + business_name,
      html:    html
    }).catch(err => console.error('[onboarding] Email admin failed:', err.message));
  }

  res.status(201).json({ message: 'Demande reçue.' });
});

module.exports = router;
