const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'GLOBAL' },
    defaultSmallRoomRent: { type: Number, required: true },
    defaultBigRoomRent: { type: Number, required: true },
    defaultPartyHallRent: { type: Number, required: true },
    defaultDiningHallRent: { type: Number, required: true },
    mealAddonPerDay: { type: Number, required: true },
    gstPercent: { type: Number, required: true, default: 10 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
