const express = require('express');
const v = require('../lib/validate');
const { handle } = require('../lib/http');
const { requireAdmin } = require('./guard');
const restaurant = require('../services/restaurant');

module.exports = function restaurantRoutes({ store }) {
  const router = express.Router();

  router.get('/menu', handle((req, res) => res.json(restaurant.listMenu(store, { includeInactive: req.query.all === '1', type: req.query.type || undefined }))));
  router.post('/menu', requireAdmin, handle((req, res) => res.status(201).json(restaurant.saveMenuItem(req.ctx, null, req.body))));
  router.put('/menu/:id', requireAdmin, handle((req, res) => res.json(restaurant.saveMenuItem(req.ctx, v.id(req.params.id), req.body))));

  router.get('/tables', handle((_req, res) => res.json(restaurant.listTables(store))));
  router.post('/tables', requireAdmin, handle((req, res) => res.status(201).json({ id: restaurant.saveTable(req.ctx, null, req.body) })));
  router.put('/tables/:id', requireAdmin, handle((req, res) => res.json({ id: restaurant.saveTable(req.ctx, v.id(req.params.id), req.body) })));

  router.get('/orders', handle((req, res) => res.json(restaurant.listOrders(store, req.query))));
  router.post('/orders', handle((req, res) => res.status(201).json(restaurant.openOrder(req.ctx, req.body))));
  router.get('/orders/:id', handle((req, res) => res.json(restaurant.orderDetail(store, v.id(req.params.id)))));
  router.post('/orders/:id/items', handle((req, res) => res.json(restaurant.addItem(req.ctx, v.id(req.params.id), req.body))));
  router.patch('/orders/:id/items/:itemId', handle((req, res) => res.json(restaurant.changeItem(req.ctx, v.id(req.params.id), v.id(req.params.itemId), req.body))));
  router.post('/orders/:id/kot', handle((req, res) => res.json(restaurant.sendKot(req.ctx, v.id(req.params.id)))));
  router.put('/orders/:id/customer', handle((req, res) => res.json(restaurant.setCustomer(req.ctx, v.id(req.params.id), req.body || {}))));
  router.put('/orders/:id/discount', handle((req, res) => res.json(restaurant.setDiscount(req.ctx, v.id(req.params.id), req.body))));
  router.post('/orders/:id/settle', handle((req, res) => res.json(restaurant.settle(req.ctx, v.id(req.params.id), req.body))));
  router.post('/orders/:id/post-to-room', handle((req, res) => res.json(restaurant.postToRoom(req.ctx, v.id(req.params.id), req.body || {}))));
  router.post('/orders/:id/cancel', handle((req, res) => res.json(restaurant.cancelOrder(req.ctx, v.id(req.params.id), req.body || {}))));

  return router;
};
