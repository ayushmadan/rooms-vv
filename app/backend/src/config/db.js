const mongoose = require('mongoose');
const { mongoUri } = require('./env');

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
}

module.exports = { connectDb };
