const express = require('express');
const v = require('../lib/validate');
const { handle } = require('../lib/http');
const { requireAdmin, requireIdAccess, receiveBuffer } = require('./guard');
const guests = require('../services/guests');
const files = require('../services/files');
const bookings = require('../services/bookings');
const folio = require('../services/folio');
const invoices = require('../services/invoices');

module.exports = function frontDeskRoutes({ store, phoneCapture }) {
  const router = express.Router();

  // --- Guests
  router.get('/guests', handle((req, res) => res.json(guests.search(store, req.query.q))));
  router.post('/guests', handle((req, res) => res.status(201).json(guests.create(req.ctx, req.body))));
  router.get('/guests/:id', handle((req, res) => {
    const id = v.id(req.params.id);
    res.json({ ...guests.get(store, id), locked: guests.isLocked(store, id), history: guests.history(store, id) });
  }));
  router.put('/guests/:id', handle((req, res) => res.json(guests.update(req.ctx, v.id(req.params.id), req.body))));
  router.put('/guests/:id/photo', handle(async (req, res) => {
    const id = v.id(req.params.id);
    const buffer = await receiveBuffer(req, files.MAX_FILE_BYTES);
    const side = v.oneOf(req.query.side, 'side', ['front', 'back'], 'front');
    res.json(guests.setIdPhoto(req.ctx, id, { name: v.text(req.query.name, 'File name', { max: 120 }), buffer }, side));
  }));
  router.get('/guests/:id/id-number', requireIdAccess, handle((req, res) => res.json({ idNumber: guests.revealIdNumber(store, v.id(req.params.id)) })));
  router.get('/guests/:id/photo', requireIdAccess, handle((req, res) => {
    const file = guests.idPhoto(store, v.id(req.params.id), v.oneOf(req.query.side, 'side', ['front', 'back'], 'front'));
    res.set({ 'Content-Type': file.mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' });
    res.send(Buffer.from(file.data));
  }));

  // --- Phone capture of ID photos (see services/phone-capture.js)
  router.post('/phone-capture', handle(async (req, res) => {
    const guestId = v.id(req.body?.guestId, 'Guest');
    res.status(201).json(await phoneCapture.open(req.ctx, guestId, { label: v.text(req.body?.label, 'Label', { max: 40 }) }));
  }));
  router.get('/phone-capture/:id', handle((req, res) => res.json(phoneCapture.status(String(req.params.id)))));
  router.delete('/phone-capture/:id', (req, res) => {
    phoneCapture.close(String(req.params.id));
    res.json({ ok: true });
  });

  // --- Availability and chart
  router.get('/availability', handle((req, res) => res.json(bookings.availability(store, req.query))));
  router.get('/chart', handle((req, res) => res.json(bookings.chart(store, req.query))));

  // --- Bookings
  router.get('/bookings', handle((req, res) => res.json(bookings.list(store, req.query))));
  router.post('/bookings', handle((req, res) => res.status(201).json(bookings.create(req.ctx, req.body))));
  router.post('/bookings/quote', handle((req, res) => res.json(bookings.quote(req.ctx, req.body))));
  router.get('/bookings/by-code/:code', handle((req, res) => {
    const row = bookings.findByCode(store, req.params.code);
    res.json(row ? { id: row.id } : null);
  }));
  router.get('/bookings/:id', handle((req, res) => res.json(bookings.detail(store, v.id(req.params.id)))));
  router.patch('/bookings/:id', handle((req, res) => res.json(bookings.update(req.ctx, v.id(req.params.id), req.body))));
  router.post('/bookings/:id/check-in', handle((req, res) => res.json(bookings.checkIn(req.ctx, v.id(req.params.id), req.body))));
  router.post('/bookings/:id/check-out', handle((req, res) => res.json(bookings.checkOut(req.ctx, v.id(req.params.id), req.body))));
  router.post('/bookings/:id/cancel', handle((req, res) => res.json(bookings.cancel(req.ctx, v.id(req.params.id), req.body))));
  router.post('/bookings/:id/revert', requireAdmin, handle((req, res) => res.json(bookings.revertStatus(req.ctx, v.id(req.params.id)))));
  router.put('/bookings/:id/declaration', handle((req, res) => {
    const id = v.id(req.params.id);
    bookings.saveDeclaration(req.ctx, id, req.body);
    res.json(bookings.detail(store, id));
  }));

  // --- Folio
  router.post('/bookings/:id/charges', handle((req, res) => {
    const id = v.id(req.params.id);
    folio.postCharge(req.ctx, id, { ...req.body, orderId: undefined });
    res.status(201).json(bookings.detail(store, id));
  }));
  router.post('/charges/:id/void', requireAdmin, handle((req, res) => {
    folio.voidCharge(req.ctx, v.id(req.params.id), req.body?.reason);
    res.json({ ok: true });
  }));
  router.post('/bookings/:id/payments', handle((req, res) => {
    const id = v.id(req.params.id);
    bookings.getRow(store, id);
    if (req.body?.kind === 'REFUND' && !req.ctx.isAdmin) return res.status(403).json({ message: 'Refunds need the admin PIN' });
    folio.recordPayment(req.ctx, { bookingId: id }, req.body || {});
    res.status(201).json(bookings.detail(store, id));
  }));
  router.post('/payments/:id/void', requireAdmin, handle((req, res) => {
    folio.voidPayment(req.ctx, v.id(req.params.id), req.body?.reason);
    res.json({ ok: true });
  }));

  // --- Invoices
  router.post('/bookings/:id/invoice', handle((req, res) => {
    const invoiceId = invoices.issueForBooking(req.ctx, v.id(req.params.id), { reissue: v.bool(req.body?.reissue) });
    res.json({ invoiceId });
  }));
  router.get('/invoices', requireAdmin, handle((req, res) => res.json(invoices.list(store, req.query))));
  router.post('/invoices/:id/void', requireAdmin, handle((req, res) => {
    invoices.voidInvoice(req.ctx, v.id(req.params.id), req.body?.reason);
    res.json({ ok: true });
  }));

  return router;
};
