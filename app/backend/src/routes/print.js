const express = require('express');
const v = require('../lib/validate');
const { handle } = require('../lib/http');
const print = require('../services/print');
const { requireAdmin } = require('./guard');

module.exports = function printRoutes({ store }) {
  const router = express.Router();
  // Print pages may be framed by the app itself (live preview in Documents settings), nobody else.
  const send = (res, doc) => res.type('html').set({
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
  }).send(doc);

  router.get('/declaration/:bookingId', handle((req, res) => send(res, print.declaration(store, v.id(req.params.bookingId), {
    showIdPhoto: req.ctx.isAdmin, ticket: String(req.query.ticket || '').replace(/[^a-f0-9]/g, '')
  }))));
  router.get('/confirmation/:bookingId', handle((req, res) => send(res, print.bookingConfirmation(store, v.id(req.params.bookingId)))));
  router.get('/receipt/:paymentId', handle((req, res) => send(res, print.paymentReceipt(store, v.id(req.params.paymentId)))));
  router.get('/folio/:bookingId', handle((req, res) => send(res, print.folioStatement(store, v.id(req.params.bookingId)))));
  router.get('/invoice/:id', handle((req, res) => send(res, print.invoiceDocument(store, v.id(req.params.id), { thermal: req.query.format === 'thermal' }))));
  router.get('/kot/:orderId/:kotNo', handle((req, res) => send(res, print.kot(store, v.id(req.params.orderId), v.id(req.params.kotNo)))));
  router.get('/daily', handle((req, res) => send(res, print.dailyReport(store, v.ymd(req.query.date, 'Date')))));
  router.get('/register', requireAdmin, handle((req, res) => send(res, print.guestRegister(store, v.ymd(req.query.from, 'From'), v.ymd(req.query.to, 'To')))));

  return router;
};
