'use strict';
const nodemailer = require('nodemailer');
const { Resend }  = require('resend');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

/* ─── Detect provider ──────────────────────────────────────────────────── */
function isResend() {
  return process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_');
}

/* ─── Resend client (lazy) ─────────────────────────────────────────────── */
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  _resend = new Resend(process.env.SMTP_PASS);
  return _resend;
}

/* ─── Nodemailer transporter (lazy) ────────────────────────────────────── */
let _transporter = null;
function getTransporter() {
  if (isResend()) return { _isResend: true };  // signal to callers
  if (_transporter) return _transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return _transporter;
}

/* ─── Unified send ─────────────────────────────────────────────────────── */
async function sendMail({ from, to, subject, html }) {
  if (isResend()) {
    const { error } = await getResend().emails.send({ from, to, subject, html });
    if (error) throw new Error(error.message || JSON.stringify(error));
  } else {
    const t = getTransporter();
    if (!t) throw new Error('SMTP not configured');
    await t.sendMail({ from, to, subject, html });
  }
}

/* ─── HTML escaping (review author/text are user-generated content) ──────── */
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── Star rating as text ──────────────────────────────────────────────── */
function stars(n) {
  return '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
}

/* ─── HTML email template ──────────────────────────────────────────────── */
function buildHtml(bizName, reviews) {
  var reviewRows = reviews.map(function(r) {
    var preview = r.text ? r.text.substring(0, 120) + (r.text.length > 120 ? '…' : '') : '';
    var initials = r.author_initials || (r.author || '').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    var color = /^[#a-zA-Z0-9(),.%\s-]+$/.test(r.color || '') ? (r.color || '#818CF8') : '#818CF8';
    return [
      '<tr style="border-bottom:1px solid #E5E7EB;">',
      '  <td style="padding:12px 8px;vertical-align:top;width:40px;">',
      '    <div style="width:36px;height:36px;border-radius:50%;background:' + color + ';',
      '         display:flex;align-items:center;justify-content:center;',
      '         font-size:12px;font-weight:700;color:#fff;text-align:center;line-height:36px;">',
      '      ' + escHtml(initials),
      '    </div>',
      '  </td>',
      '  <td style="padding:12px 8px;vertical-align:top;">',
      '    <div style="font-weight:600;font-size:14px;color:#111827;">' + escHtml(r.author) + '</div>',
      '    <div style="color:#F59E0B;font-size:13px;margin:2px 0;">' + stars(r.rating) + '</div>',
      '    <div style="font-size:13px;color:#6B7280;line-height:1.5;">' + escHtml(preview) + '</div>',
      '  </td>',
      '  <td style="padding:12px 8px;vertical-align:top;text-align:right;white-space:nowrap;">',
      '    <span style="background:#EEF2FF;color:#4338CA;font-size:11px;font-weight:700;',
      '          padding:2px 8px;border-radius:20px;text-transform:uppercase;">' + escHtml(r.source || 'google') + '</span>',
      '  </td>',
      '</tr>'
    ].join('');
  }).join('');

  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Nouveaux avis — SmartFeedback AI</title></head>',
    '<body style="margin:0;padding:0;background:#F4F5F9;font-family:Inter,-apple-system,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F9;padding:32px 0;">',
    '  <tr><td align="center">',
    '    <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">',

    // Header
    '      <tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;">',
    '        <table><tr>',
    '          <td><div style="width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:10px;',
    '               display:inline-flex;align-items:center;justify-content:center;margin-right:12px;">',
    '            <span style="color:#fff;font-size:18px;">★</span></div></td>',
    '          <td><div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.3px;">SmartFeedback AI</div>',
    '              <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:2px;">Plateforme de gestion d\'avis</div></td>',
    '        </tr></table>',
    '      </td></tr>',

    // Body
    '      <tr><td style="padding:28px 32px;">',
    '        <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-.4px;">',
    '          ' + reviews.length + ' nouvel' + (reviews.length > 1 ? 's' : '') + ' avis',
    '        </h1>',
    '        <p style="margin:0 0 24px;font-size:14px;color:#6B7280;">',
    '          <strong style="color:#374151;">' + escHtml(bizName) + '</strong> a reçu ' +
    (reviews.length > 1 ? reviews.length + ' nouveaux avis' : 'un nouvel avis') + ' sur Google.',
    '        </p>',
    '        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">',
    '          <thead><tr style="background:#F9FAFB;">',
    '            <th colspan="3" style="padding:10px 8px;font-size:11px;font-weight:700;color:#6B7280;',
    '                text-transform:uppercase;letter-spacing:.6px;text-align:left;">Avis reçus</th>',
    '          </tr></thead>',
    '          <tbody>' + reviewRows + '</tbody>',
    '        </table>',
    '      </td></tr>',

    // CTA
    '      <tr><td style="padding:0 32px 28px;">',
    '        <a href="' + (process.env.FRONTEND_URL || 'http://localhost:3000') + '#/reviews"',
    '           style="display:inline-block;background:#4F46E5;color:#fff;font-size:14px;font-weight:600;',
    '                  padding:12px 24px;border-radius:8px;text-decoration:none;letter-spacing:-.2px;">',
    '          Répondre maintenant →',
    '        </a>',
    '        <p style="margin:14px 0 0;font-size:12px;color:#9CA3AF;">',
    '          Répondre rapidement améliore votre référencement local Google.',
    '        </p>',
    '      </td></tr>',

    // Footer
    '      <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 32px;">',
    '        <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">',
    '          SmartFeedback AI · Vous recevez cet email car vous êtes abonné au plan Pro.',
    '        </p>',
    '      </td></tr>',

    '    </table>',
    '  </td></tr>',
    '</table>',
    '</body></html>'
  ].join('\n');
}

/* ─── Send notification for new reviews ───────────────────────────────── */
async function sendNewReviewsNotification(tenant, newReviews) {
  if (!newReviews || newReviews.length === 0) return;
  if (!isResend() && !getTransporter()) {
    console.log('[email] Not configured — skipping notification for', tenant.email);
    return;
  }

  var bizName = (tenant.settings && tenant.settings.business && tenant.settings.business.name)
    ? tenant.settings.business.name
    : tenant.name || 'Votre établissement';

  var subject = newReviews.length === 1
    ? '⭐ Nouvel avis Google pour ' + bizName
    : '⭐ ' + newReviews.length + ' nouveaux avis Google pour ' + bizName;

  try {
    await sendMail({
      from:    process.env.SMTP_FROM || ('"SmartFeedback AI" <' + process.env.SMTP_USER + '>'),
      to:      tenant.email,
      subject: subject,
      html:    buildHtml(bizName, newReviews)
    });
    console.log('[email] Notification sent to', tenant.email, '—', newReviews.length, 'new review(s)');
  } catch (err) {
    console.error('[email] Failed to send to', tenant.email, ':', err.message);
  }
}

/* ─── Test email connection ────────────────────────────────────────────── */
async function testConnection() {
  if (!isResend() && !getTransporter()) return { ok: false, reason: 'Email not configured' };
  try {
    if (isResend()) {
      // Resend: verify by sending to a known address
      await sendMail({
        from:    process.env.SMTP_FROM || 'SmartFeedback AI <onboarding@resend.dev>',
        to:      'delivered@resend.dev',
        subject: 'Test',
        html:    '<p>Test</p>'
      });
    } else {
      await getTransporter().verify();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendNewReviewsNotification, testConnection, getTransporter, sendMail };
