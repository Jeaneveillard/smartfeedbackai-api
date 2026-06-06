'use strict';
const router    = require('express').Router();
const db        = require('../db');
const googleApi = require('../services/googleApi');
const { syncTenant } = require('../services/reviewSync');

router.get('/', async (req, res) => {
  try {
    const { status, source, rating, q, page = 1, pageSize = 10 } = req.query;
    const tenantId = req.tenant.id;

    let query = db('reviews').where({ tenant_id: tenantId }).orderBy('date', 'desc');
    if (status)  query = query.where({ status });
    if (source)  query = query.where({ source });
    if (rating)  query = query.where({ rating: parseInt(rating, 10) });
    if (q) {
      const term = '%' + q.toLowerCase() + '%';
      query = query.where(function() {
        this.whereRaw('LOWER(author) LIKE ?', [term])
            .orWhereRaw('LOWER(text) LIKE ?', [term]);
      });
    }

    const countResult = await query.clone().clearOrder().count('id as count').first();
    const count       = countResult ? countResult.count : 0;
    const offset      = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const reviews     = await query.limit(parseInt(pageSize, 10)).offset(offset);

    res.json({ reviews, total: parseInt(count, 10), page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text requis' });
  if (typeof text !== 'string' || text.length > 4096) {
    return res.status(400).json({ error: 'Réponse trop longue (max 4096 caractères).' });
  }

  try {
    const review = await db('reviews').where({ id: req.params.id, tenant_id: req.tenant.id }).first();
    if (!review) return res.status(404).json({ error: 'Avis introuvable' });

    // No Google connected — save locally only
    if (!req.tenant.google_access_token || !req.tenant.google_account_id) {
      await db('reviews').where({ id: review.id }).update({ status:'responded', response:text.trim(), responded_at:new Date() });
      return res.status(200).json({ success:true, googlePosted:false });
    }

    // Post to Google
    try {
      await googleApi.postReply(req.tenant.google_access_token, req.tenant.google_account_id, req.tenant.google_location_id, review.google_review_id, text.trim());
      await db('reviews').where({ id: review.id }).update({ status:'responded', response:text.trim(), responded_at:new Date() });
      return res.json({ success:true, googlePosted:true });
    } catch (err) {
      if (err.status === 401 && req.tenant.google_refresh_token) {
        try {
          const newToken = await googleApi.refreshAccessToken(req.tenant.google_refresh_token);
          await db('tenants').where({ id: req.tenant.id }).update({ google_access_token: newToken });
          await googleApi.postReply(newToken, req.tenant.google_account_id, req.tenant.google_location_id, review.google_review_id, text.trim());
          await db('reviews').where({ id: review.id }).update({ status:'responded', response:text.trim(), responded_at:new Date() });
          return res.json({ success:true, googlePosted:true });
        } catch {
          return res.status(502).json({ error: 'Erreur Google — reconnectez votre compte.' });
        }
      }
      console.error('[reply]', err.message);
      return res.status(502).json({ error: 'Erreur Google API: ' + err.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const tenant = await db('tenants').where({ id: req.tenant.id }).first();
    syncTenant(tenant).catch(function(err) { console.error('[manual sync]', err.message); });
    res.json({ success:true, message:'Sync lancée en arrière-plan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
