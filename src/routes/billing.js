'use strict';
const express      = require('express');
const router       = express.Router();
const Stripe       = require('stripe');
const db           = require('../db');
const requireAuth  = require('../middleware/requireAuth');

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

const PRICE_ID       = process.env.STRIPE_PRICE_ID;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FRONTEND_URL   = process.env.FRONTEND_URL || 'https://smartfeedbackai.jeaneveillard.workers.dev';

/* ─── GET /api/billing/status ────────────────────────────────────────────── */
router.get('/status', requireAuth, async (req, res) => {
  const t = req.tenant;
  res.json({
    subscriptionId:     t.stripe_subscription_id     || null,
    subscriptionStatus: t.stripe_subscription_status || null,
    plan:               t.plan                        || null,
  });
});

/* ─── POST /api/billing/checkout ─────────────────────────────────────────── */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const tenant = req.tenant;

    if (!PRICE_ID) return res.status(500).json({ error: 'STRIPE_PRICE_ID non configuré.' });

    // Create Stripe customer if needed
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.email,
        name:  tenant.name,
        metadata: { tenantId: String(tenant.id) }
      });
      customerId = customer.id;
      await db('tenants').where({ id: tenant.id }).update({ stripe_customer_id: customerId });
    }

    const SUCCESS_URL = 'https://smartfeedbackai.jeaneveillard.workers.dev/?checkout=success';
    const CANCEL_URL  = 'https://smartfeedbackai.jeaneveillard.workers.dev/?checkout=cancel';
    console.log('[billing] creating session, success_url:', SUCCESS_URL);

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: PRICE_ID, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url:  CANCEL_URL,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout error type:', err.type, '| param:', err.param, '| msg:', err.message);
    res.status(500).json({ error: err.message, type: err.type, param: err.param });
  }
});

/* ─── GET /api/billing/portal ────────────────────────────────────────────── */
router.get('/portal', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    const tenant = req.tenant;
    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif.' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer:   tenant.stripe_customer_id,
      return_url: FRONTEND_URL + '/#/settings',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─── POST /api/billing/webhook ──────────────────────────────────────────── */
/* Note: this route must receive raw body — mounted before express.json() in app.js */
router.post('/webhook', async (req, res) => {
  const stripe = getStripe();
  const sig    = req.headers['stripe-signature'];

  let event;
  if (WEBHOOK_SECRET) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('[billing] webhook signature error:', err.message);
      return res.status(400).json({ error: 'Webhook signature invalide.' });
    }
  } else {
    // No webhook secret configured — parse body directly (dev/test only)
    console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — processing without signature check');
    try { event = JSON.parse(req.body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.customer) {
          await db('tenants')
            .where({ stripe_customer_id: session.customer })
            .update({
              stripe_subscription_id:     session.subscription,
              stripe_subscription_status: 'active',
            });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await db('tenants')
          .where({ stripe_customer_id: sub.customer })
          .update({ stripe_subscription_status: sub.status });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await db('tenants')
          .where({ stripe_customer_id: sub.customer })
          .update({
            stripe_subscription_status: 'canceled',
            stripe_subscription_id:     null,
          });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await db('tenants')
          .where({ stripe_customer_id: invoice.customer })
          .update({ stripe_subscription_status: 'past_due' });
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        await db('tenants')
          .where({ stripe_customer_id: invoice.customer })
          .update({ stripe_subscription_status: 'active' });
        break;
      }
    }
  } catch (err) {
    console.error('[billing] webhook handler error:', err.message);
  }

  res.json({ received: true });
});

module.exports = router;
