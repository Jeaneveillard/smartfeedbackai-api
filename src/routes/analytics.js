'use strict';
const router = require('express').Router();
const db     = require('../db');

router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const reviews  = await db('reviews').where({ tenant_id: tenantId });
    const total    = reviews.length;
    if (total === 0) return res.json({ totalReviews: 0, avgRating: 0, responseRate: 0, npsScore: 0, positiveSentiment: 0, bySource: {} });

    const responded  = reviews.filter(r => r.status === 'responded').length;
    const ratingSum  = reviews.reduce((s, r) => s + (r.rating || 0), 0);
    const promoters  = reviews.filter(r => r.rating >= 5).length;
    const detractors = reviews.filter(r => r.rating <= 2).length;

    const bySource = {};
    ['google', 'tripadvisor', 'yelp'].forEach(src => {
      const count = reviews.filter(r => r.source === src).length;
      if (count > 0) bySource[src] = Math.round((count / total) * 100);
    });

    res.json({
      totalReviews:      total,
      avgRating:         Math.round((ratingSum / total) * 10) / 10,
      responseRate:      Math.round((responded / total) * 100),
      npsScore:          Math.round(((promoters - detractors) / total) * 100),
      positiveSentiment: Math.round((reviews.filter(r => r.rating >= 4).length / total) * 100),
      bySource
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
