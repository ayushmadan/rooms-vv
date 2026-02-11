const mongoose = require('mongoose');

const mealRateConfigSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    mealAddonPerDay: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MealRateConfig', mealRateConfigSchema);
