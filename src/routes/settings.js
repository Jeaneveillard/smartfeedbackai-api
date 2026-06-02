'use strict';
const router = require('express').Router();
const db     = require('../db');

router.get('/', async (req, res) => {
  const defaultSettings = {
    business:     { name: req.tenant.name, street: '', city: '', stateProvince: '', postalCode: '', country: 'CA', category: 'Restaurant' },
    ai:           { provider: 'mock', apiKey: '', defaultTone: 'professional', language: 'fr' },
    billing:      { currency: 'CAD' },
    integrations: { google: true, tripadvisor: false, yelp: false }
  };
  const stored = req.tenant.settings || {};
  res.json(Object.assign({}, defaultSettings, stored));
});

router.put('/', async (req, res) => {
  try {
    const current  = req.tenant.settings || {};
    const incoming = req.body || {};
    const merged   = Object.assign({}, current, incoming);
    ['business', 'ai', 'billing', 'integrations'].forEach(key => {
      if (incoming[key]) merged[key] = Object.assign({}, current[key] || {}, incoming[key]);
    });
    await db('tenants').where({ id: req.tenant.id }).update({ settings: JSON.stringify(merged) });
    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
