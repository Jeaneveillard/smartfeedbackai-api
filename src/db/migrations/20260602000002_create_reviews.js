exports.up = function(knex) {
  return knex.schema.createTable('reviews', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('google_review_id', 255).notNullable().unique();
    t.string('author', 255);
    t.string('author_initials', 10);
    t.integer('rating').checkBetween([1, 5]);
    t.text('text');
    t.timestamp('date');
    t.string('source', 50).defaultTo('google');
    t.string('status', 20).defaultTo('pending').checkIn(['pending', 'responded']);
    t.text('response');
    t.timestamp('responded_at');
    t.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('reviews');
};
