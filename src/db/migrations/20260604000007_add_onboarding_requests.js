exports.up = function(knex) {
  return knex.schema.createTable('onboarding_requests', t => {
    t.increments('id').primary();
    t.string('business_name', 200).notNullable();
    t.string('sector', 100).notNullable();
    t.string('contact_name', 200).notNullable();
    t.string('email', 200).notNullable();
    t.string('phone', 50);
    t.string('address', 300).notNullable();
    t.string('city', 100).notNullable();
    t.string('website', 300);
    t.string('status', 20).notNullable().defaultTo('pending');
    t.text('notes');
    t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('onboarding_requests');
};
