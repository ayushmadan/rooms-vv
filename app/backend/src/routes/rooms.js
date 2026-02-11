const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const rooms = await Room.find({ active: true }).sort({ floor: 1, code: 1 });
    res.json(rooms);
  } catch (e) {
    next(e);
  }
});

router.post('/seed-default', async (_req, res, next) => {
  try {
    const defaults = [
      { code: '101', floor: 1, size: 'BIG' },
      { code: '102', floor: 1, size: 'BIG' },
      { code: '103', floor: 1, size: 'SMALL' },
      { code: '104', floor: 1, size: 'SMALL' },
      { code: '201', floor: 2, size: 'BIG' },
      { code: '202', floor: 2, size: 'BIG' },
      { code: '203', floor: 2, size: 'SMALL' },
      { code: '204', floor: 2, size: 'SMALL' },
      { code: 'PARTY-HALL', floor: 0, size: 'PARTY_HALL' },
      { code: 'DINING-HALL', floor: 0, size: 'DINING_HALL' }
    ];

    // Deactivate any legacy inventory codes so tile labels remain consistent.
    await Room.updateMany({}, { active: false });

    for (const room of defaults) {
      await Room.updateOne({ code: room.code }, { ...room, active: true }, { upsert: true });
    }

    res.json({ message: 'Default rooms seeded', count: defaults.length });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
