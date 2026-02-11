const RateConfig = require('../models/RateConfig');
const MealRateConfig = require('../models/MealRateConfig');
const Room = require('../models/Room');
const { toDateOnly, formatIstYmd } = require('../utils/date');
const { getSettings } = require('./settings.service');

async function getRentForRoomDate(roomId, date) {
  const dateOnly = toDateOnly(date);
  const configured = await RateConfig.findOne({ roomId, date: dateOnly }).lean();
  if (configured) return configured.rent;

  const [room, settings] = await Promise.all([Room.findById(roomId).lean(), getSettings()]);
  if (!room) throw new Error('Room not found for rent calculation');

  if (room.size === 'PARTY_HALL') return settings.defaultPartyHallRent;
  if (room.size === 'DINING_HALL') return settings.defaultDiningHallRent;
  return room.size === 'BIG' ? settings.defaultBigRoomRent : settings.defaultSmallRoomRent;
}

async function getMealAddonForDate(date) {
  const dateOnly = toDateOnly(date);
  const override = await MealRateConfig.findOne({ date: dateOnly }).lean();
  if (override) return override.mealAddonPerDay;
  const settings = await getSettings();
  // Fallback to mealAddonPerDay for backward compatibility
  return settings.mealAddonPerDay || 250;
}

// Get individual meal rates for a specific date
async function getMealRatesForDate(date) {
  const dateOnly = toDateOnly(date);
  const override = await MealRateConfig.findOne({ date: dateOnly }).lean();
  const settings = await getSettings();

  // If there's an override with individual rates, use those
  if (override && (override.breakfastRate || override.lunchRate || override.dinnerRate)) {
    return {
      breakfast: override.breakfastRate || settings.breakfastRate || 100,
      lunch: override.lunchRate || settings.lunchRate || 150,
      dinner: override.dinnerRate || settings.dinnerRate || 200
    };
  }

  // Use settings individual rates if available
  if (settings.breakfastRate || settings.lunchRate || settings.dinnerRate) {
    return {
      breakfast: settings.breakfastRate || 100,
      lunch: settings.lunchRate || 150,
      dinner: settings.dinnerRate || 200
    };
  }

  // Fallback: split mealAddonPerDay proportionally
  const total = settings.mealAddonPerDay || 250;
  return {
    breakfast: Math.round(total * 0.4),
    lunch: Math.round(total * 0.3),
    dinner: Math.round(total * 0.3)
  };
}

function mealCount(mealPlan = {}) {
  return [mealPlan.breakfast, mealPlan.lunch, mealPlan.dinner].filter(Boolean).length;
}

function mealCountForDate(mealPlan = {}, mealSchedule = [], dateCursor) {
  if (Array.isArray(mealSchedule) && mealSchedule.length) {
    const key = formatIstYmd(dateCursor);
    const day = mealSchedule.find((m) => m.date === key);
    if (day) return [day.breakfast, day.lunch, day.dinner].filter(Boolean).length;
  }
  return mealCount(mealPlan);
}

// Calculate discount amount based on type and value
function calculateDiscountAmount(baseAmount, discountType, discountValue) {
  if (!discountType || discountType === 'NONE' || !discountValue || discountValue <= 0) {
    return 0;
  }

  if (discountType === 'PERCENTAGE') {
    // Percentage: 0-100%
    const percentage = Math.min(Math.max(discountValue, 0), 100);
    return Math.round((baseAmount * percentage) / 100);
  }

  if (discountType === 'AMOUNT') {
    // Amount: Cannot exceed base amount
    return Math.min(discountValue, baseAmount);
  }

  return 0;
}

// Calculate meal cost for a specific date using individual rates
async function getMealCostForDate(mealPlan = {}, mealSchedule = [], dateCursor) {
  const rates = await getMealRatesForDate(dateCursor);

  let selectedMeals = { breakfast: false, lunch: false, dinner: false };

  // Check meal schedule first
  if (Array.isArray(mealSchedule) && mealSchedule.length) {
    const key = formatIstYmd(dateCursor);
    const day = mealSchedule.find((m) => m.date === key);
    if (day) {
      selectedMeals = {
        breakfast: !!day.breakfast,
        lunch: !!day.lunch,
        dinner: !!day.dinner
      };
    } else {
      // Fallback to mealPlan
      selectedMeals = {
        breakfast: !!mealPlan.breakfast,
        lunch: !!mealPlan.lunch,
        dinner: !!mealPlan.dinner
      };
    }
  } else {
    // Use mealPlan
    selectedMeals = {
      breakfast: !!mealPlan.breakfast,
      lunch: !!mealPlan.lunch,
      dinner: !!mealPlan.dinner
    };
  }

  let cost = 0;
  if (selectedMeals.breakfast) cost += rates.breakfast;
  if (selectedMeals.lunch) cost += rates.lunch;
  if (selectedMeals.dinner) cost += rates.dinner;

  return cost;
}

async function getBookingPricing(roomId, checkInDate, checkOutDate, mealPlan = {}, nightlyBaseOverride = null, mealSchedule = [], discounts = {}) {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  if (start >= end) throw new Error('Invalid booking dates');

  let dateCursor = new Date(start);
  let nights = 0;
  let baseTotal = 0;
  let mealTotal = 0;

  while (dateCursor < end) {
    const dailyBase = Number(nightlyBaseOverride) > 0 ? Number(nightlyBaseOverride) : await getRentForRoomDate(roomId, dateCursor);
    const dailyMealCost = await getMealCostForDate(mealPlan, mealSchedule, dateCursor);
    baseTotal += dailyBase;
    mealTotal += dailyMealCost;
    nights += 1;

    dateCursor = new Date(dateCursor.getTime() + 24 * 60 * 60 * 1000);
  }

  // Calculate discounts
  const roomDiscountAmount = calculateDiscountAmount(
    baseTotal,
    discounts.roomDiscountType,
    discounts.roomDiscountValue
  );

  const mealDiscountAmount = calculateDiscountAmount(
    mealTotal,
    discounts.mealDiscountType,
    discounts.mealDiscountValue
  );

  const totalDiscount = roomDiscountAmount + mealDiscountAmount;
  const baseAfterDiscount = baseTotal - roomDiscountAmount;
  const mealAfterDiscount = mealTotal - mealDiscountAmount;
  const total = baseAfterDiscount + mealAfterDiscount;

  return {
    nights,
    nightlyBaseAvg: nights ? Math.round(baseTotal / nights) : 0,
    nightlyMealAddon: nights ? Math.round(mealTotal / nights) : 0,
    baseTotal: baseAfterDiscount, // After discount
    mealTotal: mealAfterDiscount, // After discount
    total,
    baseBeforeDiscount: baseTotal,
    mealBeforeDiscount: mealTotal,
    totalDiscount,
    roomDiscountAmount,
    mealDiscountAmount,
    mealPlan,
    mealSchedule
  };
}

module.exports = { getRentForRoomDate, getBookingPricing, mealCount, getMealAddonForDate, getMealRatesForDate, getMealCostForDate, calculateDiscountAmount };
