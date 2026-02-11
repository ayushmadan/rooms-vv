const Setting = require('../models/Setting');
const {
  defaultSmallRoomRent,
  defaultBigRoomRent,
  defaultPartyHallRent,
  defaultDiningHallRent,
  mealAddonPerDay,
  defaultGstPercent
} = require('../config/env');

async function getSettings() {
  let settings = await Setting.findOne({ key: 'GLOBAL' });
  if (!settings) {
    settings = await Setting.create({
      key: 'GLOBAL',
      defaultSmallRoomRent,
      defaultBigRoomRent,
      defaultPartyHallRent,
      defaultDiningHallRent,
      mealAddonPerDay,
      gstPercent: defaultGstPercent
    });
  }
  return settings;
}

async function updateSettings(payload) {
  const settings = await getSettings();

  settings.defaultSmallRoomRent = Number(payload.defaultSmallRoomRent ?? settings.defaultSmallRoomRent);
  settings.defaultBigRoomRent = Number(payload.defaultBigRoomRent ?? settings.defaultBigRoomRent);
  settings.defaultPartyHallRent = Number(payload.defaultPartyHallRent ?? settings.defaultPartyHallRent);
  settings.defaultDiningHallRent = Number(payload.defaultDiningHallRent ?? settings.defaultDiningHallRent);
  settings.mealAddonPerDay = Number(payload.mealAddonPerDay ?? settings.mealAddonPerDay);
  settings.gstPercent = Number(payload.gstPercent ?? settings.gstPercent);

  await settings.save();
  return settings;
}

module.exports = { getSettings, updateSettings };
