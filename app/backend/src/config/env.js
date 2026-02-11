const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/roomsvv',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'app/backend/uploads'),
  outputDir: path.resolve(process.env.OUTPUT_DIR || 'app/backend/output'),
  defaultSmallRoomRent: Number(process.env.DEFAULT_SMALL_ROOM_RENT || 1800),
  defaultBigRoomRent: Number(process.env.DEFAULT_BIG_ROOM_RENT || 2200),
  defaultPartyHallRent: Number(process.env.DEFAULT_PARTY_HALL_RENT || 5000),
  defaultDiningHallRent: Number(process.env.DEFAULT_DINING_HALL_RENT || 20000),
  mealAddonPerDay: Number(process.env.MEAL_ADDON_PER_DAY || 250),
  defaultGstPercent: Number(process.env.DEFAULT_GST_PERCENT || 10),
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  adminPin: process.env.ADMIN_PIN || '1234'
};
