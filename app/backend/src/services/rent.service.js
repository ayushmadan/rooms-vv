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
  return settings.mealAddonPerDay;
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

async function getBookingPricing(roomId, checkInDate, checkOutDate, mealPlan = {}, nightlyBaseOverride = null, mealSchedule = []) {
  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  if (start >= end) throw new Error('Invalid booking dates');

  let dateCursor = new Date(start);
  let total = 0;
  let nights = 0;
  let baseTotal = 0;
  let mealTotal = 0;

  while (dateCursor < end) {
    const dailyBase = Number(nightlyBaseOverride) > 0 ? Number(nightlyBaseOverride) : await getRentForRoomDate(roomId, dateCursor);
    const dailyMealAddon = mealCountForDate(mealPlan, mealSchedule, dateCursor) * (await getMealAddonForDate(dateCursor));
    total += dailyBase + dailyMealAddon;
    baseTotal += dailyBase;
    mealTotal += dailyMealAddon;
    nights += 1;

    dateCursor = new Date(dateCursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    nights,
    nightlyBaseAvg: nights ? Math.round(baseTotal / nights) : 0,
    nightlyMealAddon: nights ? Math.round(mealTotal / nights) : 0,
    baseTotal,
    mealTotal,
    total,
    mealPlan,
    mealSchedule
  };
}

module.exports = { getRentForRoomDate, getBookingPricing, mealCount, getMealAddonForDate };
