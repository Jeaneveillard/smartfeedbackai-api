exports.up = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.string('username', 50).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', function(t) {
    t.dropColumn('username');
  });
};
