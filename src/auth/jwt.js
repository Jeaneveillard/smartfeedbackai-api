'use strict';
const jsonwebtoken = require('jsonwebtoken');
const SECRET       = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const EXPIRES_IN   = '7d';

function sign(payload) {
  return jsonwebtoken.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verify(token) {
  return jsonwebtoken.verify(token, SECRET);
}

module.exports = { sign, verify };
