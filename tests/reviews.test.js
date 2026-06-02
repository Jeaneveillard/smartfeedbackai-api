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
    { tenant_id: tenant.id, google_review_id: 'g1', author: 'Alice', rating: 5, text: 'Super!',   status: 'pending',   source: 'google', date: new Date() },
    { tenant_id: tenant.id, google_review_id: 'g2', author: 'Bob',   rating: 3, text: 'Correct.', status: 'responded', source: 'google', date: new Date() },
    { tenant_id: tenant.id, google_review_id: 'g3', author: 'Carol', rating: 1, text: 'Nul.',     status: 'pending',   source: 'yelp',   date: new Date() }
  ]);
});

describe('GET /api/reviews', () => {
  it('returns all reviews for the tenant', async () => {
    const res = await request(app).get('/api/reviews').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });

  it('filters by status=pending', async () => {
    const res = await request(app).get('/api/reviews?status=pending').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(2);
  });

  it('filters by source=yelp', async () => {
    const res = await request(app).get('/api/reviews?source=yelp').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].author).toBe('Carol');
  });

  it('filters by rating=5', async () => {
    const res = await request(app).get('/api/reviews?rating=5').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(1);
  });

  it('searches by q= (author name)', async () => {
    const res = await request(app).get('/api/reviews?q=alice').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(1);
  });

  it('does not return reviews from another tenant', async () => {
    const other = await createTenant({ email: 'other@x.com' });
    await db('reviews').insert({ tenant_id: other.id, google_review_id: 'g99', author: 'X', rating: 5, text: 'X', status: 'pending', source: 'google', date: new Date() });
    const res = await request(app).get('/api/reviews').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(3);
  });

  it('paginates with page and pageSize', async () => {
    const res = await request(app).get('/api/reviews?page=1&pageSize=2').set('Authorization', 'Bearer ' + token);
    expect(res.body.reviews).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });
});

describe('POST /api/reviews/:id/reply', () => {
  it('returns 404 for unknown review', async () => {
    const res = await request(app)
      .post('/api/reviews/00000000-0000-0000-0000-000000000000/reply')
      .set('Authorization', 'Bearer ' + token)
      .send({ text: 'Merci !' });
    expect(res.status).toBe(404);
  });

  it('returns 501 when Google is not yet connected', async () => {
    const [review] = await db('reviews').where({ tenant_id: tenant.id }).limit(1);
    const res = await request(app)
      .post('/api/reviews/' + review.id + '/reply')
      .set('Authorization', 'Bearer ' + token)
      .send({ text: 'Merci !' });
    expect(res.status).toBe(501);
  });
});

describe('GET /api/settings', () => {
  it('returns tenant settings with defaults', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('business');
    expect(res.body).toHaveProperty('ai');
    expect(res.body).toHaveProperty('billing');
  });
});

describe('PUT /api/settings', () => {
  it('merges and persists settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', 'Bearer ' + token)
      .send({ business: { name: 'Updated Name' } });
    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe('Updated Name');
    const res2 = await request(app).get('/api/settings').set('Authorization', 'Bearer ' + token);
    expect(res2.body.business.name).toBe('Updated Name');
  });
});
