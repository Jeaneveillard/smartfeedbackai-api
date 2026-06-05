'use strict';
const jwt = require('../auth/jwt');
const db  = require('../db');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    const payload   = jwt.verify(token);
    const isPreview = payload.isPreview === true;
    const tenant    = await db('tenants').where({ id: payload.tenantId }).first();
    if (!tenant) return res.status(401).json({ error: 'Tenant introuvable' });

    // Preview sessions (admin viewing as client) bypass active + subscription checks
    if (!isPreview) {
      if (tenant.active === false) {
        return res.status(403).json({ error: 'Compte désactivé. Contactez votre administrateur.' });
      }
      if (tenant.subscription_end) {
        const today = new Date().toISOString().split('T')[0];
        if (tenant.subscription_end < today) {
          return res.status(402).json({
            error: 'Abonnement expiré le ' + tenant.subscription_end + '. Contactez SmartFeedback AI pour renouveler.',
            expired: true,
            expiredOn: tenant.subscription_end
          });
        }
      }
    }

    req.tenant = tenant;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
