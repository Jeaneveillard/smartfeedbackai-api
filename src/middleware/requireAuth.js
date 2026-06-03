'use strict';
const jwt = require('../auth/jwt');
const db  = require('../db');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    const payload = jwt.verify(token);
    const tenant  = await db('tenants').where({ id: payload.tenantId }).first();
    if (!tenant) return res.status(401).json({ error: 'Tenant introuvable' });
    if (tenant.active === false) return res.status(403).json({ error: 'Compte désactivé.' });
    req.tenant = tenant;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
