'use strict';

exports.up = knex =>
  knex.schema.table('tenants', t => {
    t.integer('session_version').notNullable().defaultTo(1);
  });

exports.down = knex =>
  knex.schema.table('tenants', t => {
    t.dropColumn('session_version');
  });
