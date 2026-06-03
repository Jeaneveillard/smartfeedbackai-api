exports.up = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.text('password_hash').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.boolean('is_admin').notNullable().defaultTo(false);
    t.string('plan', 50).notNullable().defaultTo('beta');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.dropColumn('password_hash');
    t.dropColumn('active');
    t.dropColumn('is_admin');
    t.dropColumn('plan');
  });
};
