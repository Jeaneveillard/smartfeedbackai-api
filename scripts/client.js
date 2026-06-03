#!/usr/bin/env node
/**
 * SmartFeedback AI — Gestion des clients
 *
 * Usage:
 *   node scripts/client.js create  "Nom" "email"         Créer un compte
 *   node scripts/client.js list                          Lister les clients
 *   node scripts/client.js start   "email" <durée>       Démarrer abonnement (30, 90, 365)
 *   node scripts/client.js extend  "email" <durée>       Prolonger abonnement
 *   node scripts/client.js info    "email"               Voir les dates d'abonnement
 *   node scripts/client.js deactivate "email"            Désactiver manuellement
 *   node scripts/client.js activate   "email"            Réactiver
 *   node scripts/client.js reset-password "email"        Nouveau mot de passe
 *   node scripts/client.js delete "email"                Supprimer
 *
 * Durées : 30 (30 jours), 90 (3 mois), 180 (6 mois), 365 (1 an)
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

function addDays(dateStr, n) {
  var d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
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
        .select('name','email','active','plan','subscription_start','subscription_end','created_at')
        .orderBy('created_at','desc');
      if (!tenants.length) { console.log('Aucun client enregistré.'); break; }
      const todayStr = new Date().toISOString().split('T')[0];
      console.log('\n📋  Clients SmartFeedback AI\n');
      console.log('  ' + 'Nom'.padEnd(22) + 'Email'.padEnd(28) + 'Expiration'.padEnd(14) + 'Statut');
      console.log('  ' + '─'.repeat(78));
      tenants.forEach(function(t) {
        const subEnd = t.subscription_end ? new Date(t.subscription_end).toISOString().split('T')[0] : '–';
        let statusIcon = t.active ? '✅' : '🔴';
        if (t.active && subEnd !== '–') {
          const dLeft = Math.ceil((new Date(subEnd) - new Date(todayStr)) / 86400000);
          if (dLeft < 0)       statusIcon = '🔴 Expiré';
          else if (dLeft <= 7) statusIcon = '⚠️  J-' + dLeft;
          else                 statusIcon = '✅ ' + dLeft + 'j';
        }
        console.log('  ' + t.name.padEnd(22) + t.email.padEnd(28) + subEnd.padEnd(14) + statusIcon);
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

    case 'start':
    case 'extend': {
      const email = args[0];
      const days  = parseInt(args[1], 10) || 30;
      if (!email) { console.error('Usage: node scripts/client.js ' + cmd + ' "email" <jours>'); process.exit(1); }
      const t = await db('tenants').where({ email }).first();
      if (!t) { console.error('❌  Client introuvable :', email); process.exit(1); }

      let startDate, endDate;
      if (cmd === 'start' || !t.subscription_end) {
        startDate = new Date().toISOString().split('T')[0];
        endDate   = addDays(startDate, days);
      } else {
        // extend: add days after current end date
        startDate = t.subscription_start || new Date().toISOString().split('T')[0];
        endDate   = addDays(t.subscription_end, days);
      }

      await db('tenants').where({ email }).update({
        subscription_start: startDate,
        subscription_end:   endDate,
        warning_sent:       false,
        active:             true
      });

      const label = days >= 365 ? '1 an' : days >= 180 ? '6 mois' : days >= 90 ? '3 mois' : days + ' jours';
      console.log(`\n✅  Abonnement ${cmd === 'start' ? 'démarré' : 'prolongé'} — ${label}\n`);
      console.log(`  Client        : ${t.name} (${email})`);
      console.log(`  Début         : ${startDate}`);
      console.log(`  Expiration    : ${endDate}`);
      console.log(`  Rappel email  : ${addDays(endDate, -7)} (7 jours avant)\n`);
      break;
    }

    case 'info': {
      const email = args[0];
      if (!email) { console.error('Usage: node scripts/client.js info "email"'); process.exit(1); }
      const t = await db('tenants').where({ email }).first();
      if (!t) { console.error('❌  Client introuvable :', email); process.exit(1); }

      // Normalize dates to YYYY-MM-DD strings
      function fmtDate(v) {
        if (!v) return '–';
        return new Date(v).toISOString().split('T')[0];
      }
      const subStart = fmtDate(t.subscription_start);
      const subEnd   = fmtDate(t.subscription_end);

      const todayStr = new Date().toISOString().split('T')[0];
      let status = 'Aucun abonnement configuré';
      if (subEnd !== '–') {
        const daysLeft = Math.ceil((new Date(subEnd) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0)       status = `🔴 Expiré depuis ${Math.abs(daysLeft)} jours`;
        else if (daysLeft <= 7) status = `⚠️  Expire dans ${daysLeft} jours`;
        else                    status = `✅  Actif — ${daysLeft} jours restants`;
      }

      console.log(`\n📋  Abonnement — ${t.name}\n`);
      console.log(`  Email         : ${t.email}`);
      console.log(`  Plan          : ${t.plan}`);
      console.log(`  Compte actif  : ${t.active ? 'Oui ✅' : 'Non 🔴'}`);
      console.log(`  Début         : ${subStart}`);
      console.log(`  Expiration    : ${subEnd}`);
      console.log(`  Statut        : ${status}`);
      if (subEnd !== '–') console.log(`  Rappel (J-7)  : ${addDays(subEnd, -7)}`);
      console.log(`  Rappel envoyé : ${t.warning_sent ? 'Oui' : 'Non'}\n`);
      break;
    }

    default:
      console.log('\nUsage: node scripts/client.js <commande> [arguments]\n');
      console.log('  create  "Nom"  "email"    Créer un compte client');
      console.log('  list                       Lister tous les clients');
      console.log('  start  "email" <jours>    Démarrer abonnement (ex: 30, 90, 365)');
      console.log('  extend "email" <jours>    Prolonger abonnement');
      console.log('  info   "email"            Voir les dates d\'abonnement');
      console.log('  deactivate  "email"        Désactiver manuellement');
      console.log('  activate    "email"        Réactiver');
      console.log('  reset-password "email"     Nouveau mot de passe');
      console.log('  delete  "email"            Supprimer définitivement\n');
  }
}

run().catch(function(e) {
  console.error('Erreur:', e.message);
  process.exit(1);
}).finally(function() {
  db.destroy();
});
