'use strict';
const cron         = require('node-cron');
const db           = require('../db');
const reviewSync   = require('../services/reviewSync');
const emailService = require('../services/emailService');
const nodemailer   = require('nodemailer');

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(date, n) {
  var d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/* ─── Subscription check — runs daily at 08:00 ─────────────────────────── */
async function checkSubscriptions() {
  console.log('[cron:sub] Checking subscriptions —', today());
  const todayStr   = today();
  const in7days    = addDays(todayStr, 7);

  // 1. Expire accounts past their end date
  const expired = await db('tenants')
    .where('subscription_end', '<', todayStr)
    .where('active', true)
    .whereNotNull('subscription_end');

  for (const t of expired) {
    await db('tenants').where({ id: t.id }).update({ active: false });
    console.log('[cron:sub] Expired & deactivated:', t.email, '(was:', t.subscription_end + ')');
    // Notify tenant
    await sendExpiryEmail(t, 'expired');
  }

  // 2. Send 7-day warning
  const expiringSoon = await db('tenants')
    .where('subscription_end', '<=', in7days)
    .where('subscription_end', '>=', todayStr)
    .where('active', true)
    .where('warning_sent', false)
    .whereNotNull('subscription_end');

  for (const t of expiringSoon) {
    await sendExpiryEmail(t, 'warning');
    await db('tenants').where({ id: t.id }).update({ warning_sent: true });
    console.log('[cron:sub] Warning sent:', t.email, '(expires:', t.subscription_end + ')');
  }

  console.log('[cron:sub] Done. Expired:', expired.length, '| Warnings:', expiringSoon.length);
}

async function sendExpiryEmail(tenant, type) {
  const transporter = emailService.getTransporter ? emailService.getTransporter() : null;
  if (!transporter) return;

  const bizName = (tenant.settings && tenant.settings.business && tenant.settings.business.name)
    ? tenant.settings.business.name : tenant.name;

  const isWarning = type === 'warning';
  const subject = isWarning
    ? '⚠️ Votre abonnement SmartFeedback AI expire dans 7 jours'
    : '🔴 Votre abonnement SmartFeedback AI a expiré';

  const html = `
    <!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F4F5F9;padding:32px 0;margin:0;">
    <table width="560" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
      <tr><td style="background:${isWarning ? '#F59E0B' : '#EF4444'};padding:24px 32px;">
        <div style="color:#fff;font-size:18px;font-weight:800;">SmartFeedback AI</div>
        <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${isWarning ? '⚠️ Avis d\'expiration' : '🔴 Abonnement expiré'}</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
          ${isWarning ? 'Votre abonnement expire bientôt' : 'Votre abonnement a expiré'}
        </h2>
        <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
          ${isWarning
            ? `L'abonnement de <strong>${bizName}</strong> expire le <strong>${tenant.subscription_end}</strong>. Renouvelez pour continuer à accéder à SmartFeedback AI.`
            : `L'abonnement de <strong>${bizName}</strong> a expiré le <strong>${tenant.subscription_end}</strong>. Votre accès a été suspendu.`}
        </p>
        <p style="color:#6B7280;font-size:14px;margin:0;">
          Contactez <a href="mailto:jeaneveillard@gmail.com" style="color:#4F46E5;">jeaneveillard@gmail.com</a> pour renouveler votre abonnement.
        </p>
      </td></tr>
      <tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:14px 32px;font-size:11px;color:#9CA3AF;text-align:center;">
        SmartFeedback AI · Gestion des avis clients
      </td></tr>
    </table></body></html>`;

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || ('"SmartFeedback AI" <' + process.env.SMTP_USER + '>'),
      to:      tenant.email,
      subject: subject,
      html:    html
    });
  } catch (err) {
    console.error('[cron:sub] Email error:', err.message);
  }
}

/* ─── Review sync — hourly ──────────────────────────────────────────────── */
async function syncAllTenants() {
  console.log('[cron] Starting review sync —', new Date().toISOString());
  const tenants = await db('tenants').whereNotNull('google_refresh_token').where('active', true);
  console.log('[cron] Tenants to sync:', tenants.length);
  for (const tenant of tenants) {
    await reviewSync.syncTenant(tenant);
  }
  console.log('[cron] Sync complete.');
}

function startCron() {
  cron.schedule('0 * * * *', syncAllTenants);
  console.log('[cron] Hourly review sync scheduled.');

  cron.schedule('0 8 * * *', checkSubscriptions);
  console.log('[cron] Daily subscription check scheduled (08:00).');
}

module.exports = { startCron, syncAllTenants, checkSubscriptions };
