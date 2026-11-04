// Pure stay pricing: no database access, so it can be tested in isolation.
const { stayNights } = require('../lib/dates');
const { discountAmount } = require('../lib/money');

const MEALS = ['breakfast', 'lunch', 'dinner'];

/** Meals chosen for a night: a per-date schedule entry wins over the default plan. */
function mealsForNight(date, mealPlan = {}, mealSchedule = []) {
  const day = mealSchedule.find((entry) => entry.date === date) || mealPlan;
  return Object.fromEntries(MEALS.map((meal) => [meal, Boolean(day[meal])]));
}

/**
 * @param {object} input
 * @param {string} input.checkIn  YYYY-MM-DD
 * @param {string} input.checkOut YYYY-MM-DD (exclusive)
 * @param {(date: string) => number} input.rentForNight paise
 * @param {(date: string) => {breakfast:number,lunch:number,dinner:number}} input.mealRatesFor paise
 * @param {object} [input.mealPlan] default meals per night
 * @param {Array} [input.mealSchedule] per-date meal overrides
 * @param {object} [input.discounts] { roomType, roomValue, mealType, mealValue }
 */
function computeStay({ checkIn, checkOut, rentForNight, mealRatesFor, mealPlan = {}, mealSchedule = [], discounts = {} }) {
  const nights = stayNights(checkIn, checkOut).map((date) => {
    const meals = mealsForNight(date, mealPlan, mealSchedule);
    const rates = mealRatesFor(date);
    const mealAmounts = Object.fromEntries(MEALS.map((meal) => [meal, meals[meal] ? rates[meal] : 0]));
    return {
      date,
      rent: rentForNight(date),
      meals,
      mealRates: rates,
      mealAmount: MEALS.reduce((sum, meal) => sum + mealAmounts[meal], 0)
    };
  });

  const roomGross = nights.reduce((sum, n) => sum + n.rent, 0);
  const mealGross = nights.reduce((sum, n) => sum + n.mealAmount, 0);
  const roomDiscount = discountAmount(roomGross, discounts.roomType, discounts.roomValue);
  const mealDiscount = discountAmount(mealGross, discounts.mealType, discounts.mealValue);

  return {
    nights,
    nightCount: nights.length,
    roomGross,
    mealGross,
    roomDiscount,
    mealDiscount,
    roomNet: roomGross - roomDiscount,
    mealNet: mealGross - mealDiscount,
    total: roomGross - roomDiscount + mealGross - mealDiscount
  };
}

/** Collapses consecutive nights at the same rent into "n nights @ rate" groups. */
function groupNightsByRent(nights) {
  const groups = [];
  for (const night of nights) {
    const last = groups[groups.length - 1];
    if (last && last.rate === night.rent) last.count += 1;
    else groups.push({ from: night.date, rate: night.rent, count: 1 });
  }
  return groups;
}

/** Totals meals by type and rate, e.g. 3 x breakfast @ 100. */
function groupMeals(nights) {
  const byKey = new Map();
  for (const night of nights) {
    for (const meal of MEALS) {
      if (!night.meals[meal]) continue;
      const key = `${meal}:${night.mealRates[meal]}`;
      const entry = byKey.get(key) || { meal, rate: night.mealRates[meal], count: 0 };
      entry.count += 1;
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

module.exports = { computeStay, mealsForNight, groupNightsByRent, groupMeals, MEALS };
