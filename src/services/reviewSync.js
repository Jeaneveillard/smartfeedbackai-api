'use strict';
const db        = require('../db');
const googleApi = require('./googleApi');

async function syncTenant(tenant) {
  if (!tenant.google_account_id || !tenant.google_location_id) {
    console.log('[sync] Skipping tenant', tenant.email, '— no location configured');
    return;
  }

  var accessToken = tenant.google_access_token;
  var allReviews  = [];
  var pageToken   = null;

  try {
    do {
      var result;
      try {
        result = await googleApi.getReviews(accessToken, tenant.google_account_id, tenant.google_location_id, pageToken);
      } catch (err) {
        if (err.status === 401 && tenant.google_refresh_token) {
          accessToken = await googleApi.refreshAccessToken(tenant.google_refresh_token);
          await db('tenants').where({ id: tenant.id }).update({ google_access_token: accessToken });
          result = await googleApi.getReviews(accessToken, tenant.google_account_id, tenant.google_location_id, pageToken);
        } else {
          throw err;
        }
      }
      allReviews = allReviews.concat(result.reviews);
      pageToken  = result.nextPageToken;
    } while (pageToken);

    for (var i = 0; i < allReviews.length; i++) {
      var review = Object.assign({}, allReviews[i], { tenant_id: tenant.id });
      await db('reviews')
        .insert(review)
        .onConflict('google_review_id')
        .merge(['author', 'author_initials', 'rating', 'text', 'date', 'status', 'response', 'updated_at']);
    }

    await db('tenants').where({ id: tenant.id }).update({ last_sync_at: new Date() });
    console.log('[sync] Tenant', tenant.email, '— upserted', allReviews.length, 'reviews');
  } catch (err) {
    if (err.status === 403) {
      console.error('[sync] Tenant', tenant.email, '— permissions révoquées.');
    } else {
      console.error('[sync] Tenant', tenant.email, '— error:', err.message);
    }
  }
}

module.exports = { syncTenant };
