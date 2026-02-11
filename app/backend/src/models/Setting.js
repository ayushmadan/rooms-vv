const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'GLOBAL' },
    defaultSmallRoomRent: { type: Number, required: true },
    defaultBigRoomRent: { type: Number, required: true },
    defaultPartyHallRent: { type: Number, required: true },
    defaultDiningHallRent: { type: Number, required: true },
    mealAddonPerDay: { type: Number, required: false }, // Deprecated: kept for backward compatibility
    breakfastRate: { type: Number, required: false, default: 100 },
    lunchRate: { type: Number, required: false, default: 150 },
    dinnerRate: { type: Number, required: false, default: 200 },
    gstPercent: { type: Number, required: true, default: 10 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
