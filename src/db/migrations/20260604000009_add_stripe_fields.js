exports.up = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.string('stripe_customer_id').nullable();
    t.string('stripe_subscription_id').nullable();
    t.string('stripe_subscription_status').nullable(); // active, past_due, canceled, trialing
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.dropColumn('stripe_customer_id');
    t.dropColumn('stripe_subscription_id');
    t.dropColumn('stripe_subscription_status');
  });
};
