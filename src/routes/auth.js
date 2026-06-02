'use strict';
const router = require('express').Router();
router.get('/me', (_req, res) => res.json({}));
module.exports = router;
