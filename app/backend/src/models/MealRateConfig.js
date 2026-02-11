const mongoose = require('mongoose');

const mealRateConfigSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    mealAddonPerDay: { type: Number, required: false }, // Deprecated: kept for backward compatibility
    breakfastRate: { type: Number, required: false },
    lunchRate: { type: Number, required: false },
    dinnerRate: { type: Number, required: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MealRateConfig', mealRateConfigSchema);
