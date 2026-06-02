exports.up = function(knex) {
  return knex.schema.createTable('tenants', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('email', 255).notNullable().unique();
    t.text('google_access_token');
    t.text('google_refresh_token');
    t.string('google_account_id', 255);
    t.string('google_location_id', 255);
    t.jsonb('settings').defaultTo('{}');
    t.timestamp('last_sync_at');
    t.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('tenants');
};
