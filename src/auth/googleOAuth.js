'use strict';
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const db  = require('../db');
const jwt = require('./jwt');
require('dotenv').config();

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL
  }, async (_accessToken, refreshToken, profile, done) => {
    const email = profile.emails[0].value;
    const name  = profile.displayName;
    try {
      let tenant = await db('tenants').where({ email }).first();
      if (!tenant) {
        [tenant] = await db('tenants').insert({ name, email }).returning('*');
      }
      await db('tenants').where({ id: tenant.id }).update({
        google_access_token:  _accessToken,
        google_refresh_token: refreshToken || tenant.google_refresh_token
      });
      tenant = await db('tenants').where({ id: tenant.id }).first();
      return done(null, tenant);
    } catch (err) {
      return done(err);
    }
  }));
}

module.exports = passport;
