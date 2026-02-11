const { adminPin } = require('../config/env');

function injectUser(req, _res, next) {
  const role = (req.header('x-role') || 'STAFF').toUpperCase();
  const pin = req.header('x-admin-pin') || '';
  const isAdmin = pin === adminPin;

  req.user = {
    name: req.header('x-user-name') || 'local-user',
    role,
    isAdmin
  };

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { injectUser, requireAdmin };
