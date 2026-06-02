'use strict';
const cron       = require('node-cron');
const db         = require('../db');
const reviewSync = require('../services/reviewSync');

async function syncAllTenants() {
  console.log('[cron] Starting review sync —', new Date().toISOString());
  const tenants = await db('tenants').whereNotNull('google_refresh_token');
  console.log('[cron] Tenants to sync:', tenants.length);
  for (const tenant of tenants) {
    await reviewSync.syncTenant(tenant);
  }
  console.log('[cron] Sync complete.');
}

function startCron() {
  cron.schedule('0 * * * *', syncAllTenants);
  console.log('[cron] Hourly review sync scheduled.');
}

module.exports = { startCron, syncAllTenants };
