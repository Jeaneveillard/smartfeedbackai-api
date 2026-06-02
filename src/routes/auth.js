'use strict';
const router = require('express').Router();
router.get('/me', (_req, res) => res.status(501).json({ error: 'Not implemented — Task 9' }));
module.exports = router;
