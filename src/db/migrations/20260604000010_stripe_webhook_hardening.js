/**
 * Webhook hardening:
 *  - processed_stripe_events: idempotency log so a replayed/duplicate Stripe
 *    event is never processed twice.
 *  - partial unique index on tenants.stripe_customer_id so one Stripe customer
 *    can never map to more than one tenant (a webhook would otherwise mutate
 *    several tenants' billing state at once).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('processed_stripe_events', function (t) {
    t.string('event_id').primary();          // Stripe event id (evt_...)
    t.string('type');                        // event type, for debugging
    t.timestamp('processed_at').defaultTo(knex.fn.now());
  });

  // Multiple NULLs are allowed; only non-null customer ids must be unique.
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_id_unique ' +
    'ON tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL'
  );
};

exports.down = async function (knex) {
  await knex.schema.raw('DROP INDEX IF EXISTS tenants_stripe_customer_id_unique');
  await knex.schema.dropTableIfExists('processed_stripe_events');
};
