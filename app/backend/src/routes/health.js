const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    mongoState: mongoose.connection.readyState
  });
});

module.exports = router;
