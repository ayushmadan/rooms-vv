const express = require('express');
const RateConfig = require('../models/RateConfig');
const MealRateConfig = require('../models/MealRateConfig');
const { toDateOnly } = require('../utils/date');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, updateSettings } = require('../services/settings.service');

const router = express.Router();

router.get('/defaults', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({
      defaultSmallRoomRent: settings.defaultSmallRoomRent,
      defaultBigRoomRent: settings.defaultBigRoomRent,
      defaultPartyHallRent: settings.defaultPartyHallRent,
      defaultDiningHallRent: settings.defaultDiningHallRent,
      mealAddonPerDay: settings.mealAddonPerDay,
      gstPercent: settings.gstPercent
    });
  } catch (e) {
    next(e);
  }
});

router.put('/defaults', requireAdmin, async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body || {});
    res.json(settings);
  } catch (e) {
    next(e);
  }
});

router.get('/rates', async (_req, res, next) => {
  try {
    const rates = await RateConfig.find({}).populate('roomId').sort({ date: 1 });
    res.json(rates);
  } catch (e) {
    next(e);
  }
});

router.post('/rates', requireAdmin, async (req, res, next) => {
  try {
    const { roomId, date, rent } = req.body;
    const saved = await RateConfig.findOneAndUpdate(
      { roomId, date: toDateOnly(date) },
      { roomId, date: toDateOnly(date), rent: Number(rent) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(saved);
  } catch (e) {
    next(e);
  }
});

router.get('/meal-rates', async (_req, res, next) => {
  try {
    const rates = await MealRateConfig.find({}).sort({ date: 1 });
    res.json(rates);
  } catch (e) {
    next(e);
  }
});

router.post('/meal-rates', requireAdmin, async (req, res, next) => {
  try {
    const { date, mealAddonPerDay } = req.body;
    const saved = await MealRateConfig.findOneAndUpdate(
      { date: toDateOnly(date) },
      { date: toDateOnly(date), mealAddonPerDay: Number(mealAddonPerDay) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(saved);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
