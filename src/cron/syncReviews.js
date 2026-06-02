'use strict';
const cron = require('node-cron');
const db   = require('../db');

async function syncAllTenants() {
  console.log('[cron] Starting review sync —', new Date().toISOString());
  const tenants = await db('tenants').whereNotNull('google_refresh_token');
  console.log('[cron] Tenants to sync:', tenants.length);
  for (const tenant of tenants) {
    try {
      // Google API calls implemented in Plan 2
      console.log('[cron] Would sync tenant:', tenant.email);
    } catch (err) {
      console.error('[cron] Error syncing tenant', tenant.email, ':', err.message);
    }
  }
  console.log('[cron] Sync complete.');
}

function startCron() {
  cron.schedule('0 * * * *', syncAllTenants);
  console.log('[cron] Hourly review sync scheduled.');
}

module.exports = { startCron, syncAllTenants };
