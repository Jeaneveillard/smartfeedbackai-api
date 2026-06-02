'use strict';
const jwt = require('../src/auth/jwt');

describe('jwt', () => {
  it('signs and verifies a payload', () => {
    const token   = jwt.sign({ tenantId: 'abc', email: 'x@x.com' });
    const payload = jwt.verify(token);
    expect(payload.tenantId).toBe('abc');
    expect(payload.email).toBe('x@x.com');
  });

  it('throws on invalid token', () => {
    expect(() => jwt.verify('bad.token')).toThrow();
  });
});

const request = require('supertest');
const app     = require('../src/app');
const { createTenant, makeJwt, cleanDb } = require('./helpers');

describe('requireAuth middleware', () => {
  beforeEach(cleanDb);

  it('returns 401 when no token', async () => {
    const res = await request(app).get('/api/reviews');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/reviews')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('allows request with valid JWT', async () => {
    const tenant = await createTenant();
    const token  = makeJwt(tenant);
    const res = await request(app)
      .get('/api/reviews')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
  });
});
