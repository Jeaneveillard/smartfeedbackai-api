'use strict';
const db         = require('../src/db');
const reviewSync = require('../src/services/reviewSync');
const googleApi  = require('../src/services/googleApi');
const { createTenant, cleanDb } = require('./helpers');

jest.mock('../src/services/googleApi');

let tenant;
beforeEach(async () => {
  jest.clearAllMocks();
  await cleanDb();
  tenant = await createTenant({ email: 'sync@test.com' });
  await db('tenants').where({ id: tenant.id }).update({
    google_access_token:  'access_123',
    google_refresh_token: 'refresh_abc',
    google_account_id:    'accounts/999',
    google_location_id:   'locations/777'
  });
  tenant = await db('tenants').where({ id: tenant.id }).first();
});

describe('syncTenant', () => {
  it('inserts new reviews into the database', async () => {
    googleApi.getReviews.mockResolvedValueOnce({
      reviews: [{ google_review_id:'gr1', author:'Alice', author_initials:'AL', rating:5, text:'Super!', date:new Date(), source:'google', status:'pending', response:null }],
      nextPageToken: null
    });
    await reviewSync.syncTenant(tenant);
    const reviews = await db('reviews').where({ tenant_id: tenant.id });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].author).toBe('Alice');
  });

  it('updates existing reviews (upsert)', async () => {
    await db('reviews').insert({ tenant_id:tenant.id, google_review_id:'gr1', author:'Alice', rating:4, text:'Bien.', date:new Date(), source:'google', status:'pending' });
    googleApi.getReviews.mockResolvedValueOnce({
      reviews: [{ google_review_id:'gr1', author:'Alice', author_initials:'AL', rating:5, text:'Excellent!', date:new Date(), source:'google', status:'responded', response:'Merci !' }],
      nextPageToken: null
    });
    await reviewSync.syncTenant(tenant);
    const reviews = await db('reviews').where({ tenant_id: tenant.id });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].status).toBe('responded');
  });

  it('refreshes token on 401 and retries', async () => {
    const err = new Error('401'); err.status = 401;
    googleApi.getReviews.mockRejectedValueOnce(err).mockResolvedValueOnce({ reviews:[], nextPageToken:null });
    googleApi.refreshAccessToken.mockResolvedValueOnce('new_access_token');
    await reviewSync.syncTenant(tenant);
    expect(googleApi.refreshAccessToken).toHaveBeenCalledWith('refresh_abc');
    expect(googleApi.getReviews).toHaveBeenCalledTimes(2);
  });

  it('updates last_sync_at after successful sync', async () => {
    googleApi.getReviews.mockResolvedValueOnce({ reviews:[], nextPageToken:null });
    await reviewSync.syncTenant(tenant);
    const updated = await db('tenants').where({ id: tenant.id }).first();
    expect(updated.last_sync_at).not.toBeNull();
  });
});
