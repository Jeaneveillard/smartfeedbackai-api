'use strict';
const db  = require('../src/db');
const jwt = require('../src/auth/jwt');

async function cleanDb() {
  await db('reviews').del();
  await db('tenants').del();
}

async function createTenant(overrides = {}) {
  const [tenant] = await db('tenants').insert({
    name:     overrides.name  || 'Test Restaurant',
    email:    overrides.email || `test+${Date.now()}@example.com`,
    settings: JSON.stringify(overrides.settings || {})
  }).returning('*');
  return tenant;
}

function makeJwt(tenant) {
  return jwt.sign({ tenantId: tenant.id, email: tenant.email });
}

module.exports = { cleanDb, createTenant, makeJwt };
