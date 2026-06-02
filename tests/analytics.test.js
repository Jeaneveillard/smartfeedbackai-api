'use strict';
const request = require('supertest');
const app     = require('../src/app');
const db      = require('../src/db');
const { createTenant, makeJwt, cleanDb } = require('./helpers');

let tenant, token;
beforeEach(async () => {
  await cleanDb();
  tenant = await createTenant();
  token  = makeJwt(tenant);
  await db('reviews').insert([
    { tenant_id: tenant.id, google_review_id: 'a1', author: 'A', rating: 5, text: 'excellent service', status: 'responded', source: 'google', date: new Date('2026-05-01') },
    { tenant_id: tenant.id, google_review_id: 'a2', author: 'B', rating: 4, text: 'bon repas',         status: 'responded', source: 'google', date: new Date('2026-05-15') },
    { tenant_id: tenant.id, google_review_id: 'a3', author: 'C', rating: 2, text: 'service lent',      status: 'pending',   source: 'yelp',   date: new Date('2026-06-01') },
  ]);
});

describe('GET /api/analytics', () => {
  it('returns correct totals', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.totalReviews).toBe(3);
  });
  it('calculates response rate', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', 'Bearer ' + token);
    expect(res.body.responseRate).toBe(67);
  });
  it('calculates average rating', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', 'Bearer ' + token);
    expect(res.body.avgRating).toBe(3.7);
  });
  it('returns source breakdown', async () => {
    const res = await request(app).get('/api/analytics').set('Authorization', 'Bearer ' + token);
    expect(res.body.bySource.google).toBe(67);
    expect(res.body.bySource.yelp).toBe(33);
  });
});
