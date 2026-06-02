'use strict';
const router = require('express').Router();
const db     = require('../db');

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

    const countResult = await query.clone().count('id as count').first();
    const count       = countResult ? countResult.count : 0;
    const offset      = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const reviews     = await query.limit(parseInt(pageSize, 10)).offset(offset);

    res.json({ reviews, total: parseInt(count, 10), page: parseInt(page, 10), pageSize: parseInt(pageSize, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Reply stub — Google posting implemented in Plan 2
router.post('/:id/reply', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text requis' });

  const review = await db('reviews').where({ id: req.params.id, tenant_id: req.tenant.id }).first();
  if (!review) return res.status(404).json({ error: 'Avis introuvable' });

  if (!req.tenant.google_access_token) {
    await db('reviews').where({ id: review.id }).update({
      status: 'responded', response: text.trim(), responded_at: new Date()
    });
    return res.status(200).json({ success: true, googlePosted: false });
  }

  return res.status(501).json({ error: 'Intégration Google non encore configurée' });
});

// Sync stub — Google sync implemented in Plan 2
router.post('/sync', (_req, res) => {
  res.status(501).json({ error: 'Sync Google non encore configurée' });
});

module.exports = router;
