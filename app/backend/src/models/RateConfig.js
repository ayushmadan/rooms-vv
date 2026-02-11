const mongoose = require('mongoose');

const rateConfigSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    date: { type: Date, required: true },
    rent: { type: Number, required: true }
  },
  { timestamps: true }
);

rateConfigSchema.index({ roomId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('RateConfig', rateConfigSchema);
