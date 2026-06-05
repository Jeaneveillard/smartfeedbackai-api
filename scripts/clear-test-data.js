'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_PROD;

const db = require('../src/db');

async function main() {
  const tenants = await db('tenants').where('is_admin', false).select('id', 'name', 'email');
  console.log('Clients à supprimer :');
  tenants.forEach(t => console.log(' -', t.name, '(' + t.email + ')'));

  if (tenants.length === 0) { console.log('Aucun client à supprimer.'); await db.destroy(); return; }

  const ids = tenants.map(t => t.id);
  const reviews   = await db('reviews').whereIn('tenant_id', ids).count('id as n').first();
  const requests  = await db('onboarding_requests').count('id as n').first();
  console.log('Avis à supprimer :', reviews.n);
  console.log('Demandes à supprimer :', requests.n);

  await db('reviews').whereIn('tenant_id', ids).delete();
  await db('onboarding_requests').delete();
  await db('tenants').where('is_admin', false).delete();

  console.log('\n✅ Nettoyage terminé — base prête pour de vrais clients.');
  await db.destroy();
}

main().catch(err => { console.error('Erreur :', err.message); process.exit(1); });
