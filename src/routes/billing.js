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

    // Localize Stripe invoices/emails to the client's language (FR-CA or EN).
    const tenantLang = (tenant.settings && tenant.settings.ai && tenant.settings.ai.language) === 'en'
      ? 'en' : 'fr-CA';

    // Create Stripe customer if needed
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:             tenant.email,
        name:              tenant.name,
        preferred_locales: [tenantLang],
        metadata:          { tenantId: String(tenant.id) }
      });
      customerId = customer.id;
      await db('tenants').where({ id: tenant.id }).update({ stripe_customer_id: customerId });
    } else {
      // Keep the locale in sync in case the client changed their language.
      try { await stripe.customers.update(customerId, { preferred_locales: [tenantLang] }); }
      catch (e) { console.error('[billing] locale update failed:', e.message); }
    }

    const SUCCESS_URL = 'https://smartfeedbackai.jeaneveillard.workers.dev/?checkout=success';
    const CANCEL_URL  = 'https://smartfeedbackai.jeaneveillard.workers.dev/?checkout=cancel';
    console.log('[billing] creating session, success_url:', SUCCESS_URL);

    // Stripe Tax adds GST/QST/HST automatically — only when enabled in the
    // dashboard AND flagged on, so checkout never breaks if Tax isn't set up.
    const taxEnabled = process.env.STRIPE_TAX_ENABLED === 'true';

    const sessionParams = {
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: PRICE_ID, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url:  CANCEL_URL,
    };

    if (taxEnabled) {
      sessionParams.automatic_tax              = { enabled: true };
      sessionParams.billing_address_collection = 'required';
      sessionParams.customer_update            = { address: 'auto', name: 'auto' };
      sessionParams.tax_id_collection          = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout error type:', err.type, '| param:', err.param, '| msg:', err.message);
    res.status(500).json({ error: 'Impossible de créer la session de paiement. Réessayez plus tard.' });
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
/* Exported separately — mounted WITHOUT requireAuth and BEFORE express.json() */
const webhookRouter = express.Router();
webhookRouter.post('/', async (req, res) => {
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
  } else if (process.env.NODE_ENV === 'production') {
    // Refuse to process unsigned webhooks in production — without the secret
    // anyone could POST a fake "active" subscription event.
    console.error('[billing] STRIPE_WEBHOOK_SECRET missing in production — rejecting webhook');
    return res.status(500).json({ error: 'Webhook non configuré.' });
  } else {
    console.warn('[billing] STRIPE_WEBHOOK_SECRET not set — processing without signature check (dev only)');
    try { event = JSON.parse(req.body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  // Idempotency: skip events we've already processed (Stripe delivers at-least-once).
  try {
    const seen = await db('processed_stripe_events').where({ event_id: event.id }).first();
    if (seen) return res.json({ received: true, duplicate: true });
  } catch (err) {
    console.error('[billing] idempotency check failed:', err.message);
    return res.status(500).json({ error: 'DB error' }); // let Stripe retry
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

    // Record success AFTER the handler so a failed write is retried by Stripe.
    await db('processed_stripe_events')
      .insert({ event_id: event.id, type: event.type })
      .onConflict('event_id').ignore();
  } catch (err) {
    console.error('[billing] webhook handler error:', err.message);
    // Return 500 so Stripe retries — pairs with the idempotency guard above.
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
});

module.exports = { router, webhookRouter };
