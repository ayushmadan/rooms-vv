const express = require('express');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    role: req.user.role,
    isAdmin: req.user.isAdmin
  });
});

module.exports = router;
