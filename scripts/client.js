#!/usr/bin/env node
/**
 * SmartFeedback AI — Gestion des clients
 *
 * Usage:
 *   node scripts/client.js create  "Nom du restaurant" "email@client.com"
 *   node scripts/client.js list
 *   node scripts/client.js deactivate <email>
 *   node scripts/client.js activate   <email>
 *   node scripts/client.js reset-password <email>
 *   node scripts/client.js delete <email>
 */

'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db     = require('../src/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
function genPass(len) {
  let p = '';
  for (let i = 0; i < len; i++) p += CHARS[crypto.randomInt(CHARS.length)];
  return p;
}

const [,, cmd, ...args] = process.argv;

async function run() {
  switch (cmd) {

    case 'create': {
      const [name, email] = args;
      if (!name || !email) {
        console.error('Usage: node scripts/client.js create "Nom" "email@client.com"');
        process.exit(1);
      }
      const existing = await db('tenants').where({ email }).first();
      if (existing) {
        console.error(`❌  Un compte existe déjà pour ${email}`);
        process.exit(1);
      }
      const password = genPass(12);
      const hash     = await bcrypt.hash(password, 10);
      const [t] = await db('tenants').insert({ name, email, password_hash: hash, plan: 'beta', active: true }).returning(['id','name','email','plan']);
      console.log('\n✅  Compte créé avec succès !\n');
      console.log('  Établissement :', t.name);
      console.log('  Email         :', t.email);
      console.log('  Mot de passe  :', password);
      console.log('  Plan          :', t.plan);
      console.log('\n  ⚠️  Partagez ces identifiants avec le client. Le mot de passe ne sera plus affiché.\n');
      break;
    }

    case 'list': {
      const tenants = await db('tenants')
        .select('name','email','active','plan','created_at')
        .orderBy('created_at','desc');
      if (!tenants.length) { console.log('Aucun client enregistré.'); break; }
      console.log('\n📋  Clients SmartFeedback AI\n');
      console.log('  ' + 'Nom'.padEnd(25) + 'Email'.padEnd(30) + 'Plan'.padEnd(10) + 'Actif');
      console.log('  ' + '─'.repeat(70));
      tenants.forEach(function(t) {
        const status = t.active ? '✅' : '🔴';
        console.log('  ' + t.name.padEnd(25) + t.email.padEnd(30) + (t.plan||'').padEnd(10) + status);
      });
      console.log();
      break;
    }

    case 'deactivate':
    case 'activate': {
      const email = args[0];
      if (!email) { console.error('Usage: node scripts/client.js ' + cmd + ' email@client.com'); process.exit(1); }
      const t = await db('tenants').where({ email }).first();
      if (!t) { console.error('❌  Client introuvable :', email); process.exit(1); }
      const active = cmd === 'activate';
      await db('tenants').where({ email }).update({ active });
      console.log(active ? `✅  Compte ${email} activé.` : `🔴  Compte ${email} désactivé.`);
      break;
    }

    case 'reset-password': {
      const email = args[0];
      if (!email) { console.error('Usage: node scripts/client.js reset-password email@client.com'); process.exit(1); }
      const t = await db('tenants').where({ email }).first();
      if (!t) { console.error('❌  Client introuvable :', email); process.exit(1); }
      const password = genPass(12);
      const hash     = await bcrypt.hash(password, 10);
      await db('tenants').where({ email }).update({ password_hash: hash });
      console.log(`\n🔑  Nouveau mot de passe pour ${email} :\n`);
      console.log(`  Mot de passe : ${password}\n`);
      break;
    }

    case 'delete': {
      const email = args[0];
      if (!email) { console.error('Usage: node scripts/client.js delete email@client.com'); process.exit(1); }
      const t = await db('tenants').where({ email }).first();
      if (!t) { console.error('❌  Client introuvable :', email); process.exit(1); }
      await db('tenants').where({ email }).del();
      console.log(`🗑️   Compte ${email} supprimé définitivement.`);
      break;
    }

    default:
      console.log('\nUsage: node scripts/client.js <commande> [arguments]\n');
      console.log('  create  "Nom"  "email"   Créer un compte client');
      console.log('  list                      Lister tous les clients');
      console.log('  deactivate  "email"       Désactiver un compte');
      console.log('  activate    "email"       Réactiver un compte');
      console.log('  reset-password "email"    Générer un nouveau mot de passe');
      console.log('  delete      "email"       Supprimer définitivement\n');
  }
}

run().catch(function(e) {
  console.error('Erreur:', e.message);
  process.exit(1);
}).finally(function() {
  db.destroy();
});
