exports.up = function(knex) {
  return knex.schema.alterTable('tenants', t => {
    t.string('sector', 100);
    t.string('phone', 50);
    t.string('address', 300);
    t.string('city', 100);
    t.string('website', 300);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('tenants', t => {
    t.dropColumn('sector');
    t.dropColumn('phone');
    t.dropColumn('address');
    t.dropColumn('city');
    t.dropColumn('website');
  });
};
