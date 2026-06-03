'use strict';
const router       = require('express').Router();
const emailService = require('../services/emailService');

// Test SMTP connection (no auth needed — just checks config)
router.get('/test', async (_req, res) => {
  const result = await emailService.testConnection();
  res.json(result);
});

// Send a test email to the authenticated tenant
router.post('/send-test', async (req, res) => {
  const tenant = req.tenant;
  const fakeReview = {
    author:          'Marie Dupont',
    author_initials: 'MD',
    color:           'linear-gradient(135deg,#818CF8,#4F46E5)',
    rating:          5,
    text:            'Excellent service, cuisine raffinée et personnel attentionné. Je reviendrai sans hésiter !',
    source:          'google'
  };
  try {
    await emailService.sendNewReviewsNotification(tenant, [fakeReview]);
    res.json({ success: true, sentTo: tenant.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
