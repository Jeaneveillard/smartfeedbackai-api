exports.up = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.string('invite_token', 64).nullable().unique();
    t.timestamp('invite_expires_at').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.dropColumn('invite_token');
    t.dropColumn('invite_expires_at');
  });
};
