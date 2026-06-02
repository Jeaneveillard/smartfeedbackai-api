'use strict';
const router = require('express').Router();
router.get('/', (_req, res) => res.json({ reviews: [], total: 0 }));
module.exports = router;
