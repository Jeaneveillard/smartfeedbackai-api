'use strict';
const jsonwebtoken = require('jsonwebtoken');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}
const SECRET     = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const EXPIRES_IN = '7d';

function sign(payload) {
  return jsonwebtoken.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verify(token) {
  return jsonwebtoken.verify(token, SECRET);
}

module.exports = { sign, verify };
