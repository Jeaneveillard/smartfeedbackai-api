exports.up = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.date('subscription_start').nullable();
    t.date('subscription_end').nullable();
    t.boolean('warning_sent').notNullable().defaultTo(false);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.dropColumn('subscription_start');
    t.dropColumn('subscription_end');
    t.dropColumn('warning_sent');
  });
};
