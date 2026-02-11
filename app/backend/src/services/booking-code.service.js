const Counter = require('../models/Counter');
const { formatIstYmd } = require('../utils/date');

async function generateBookingCode(date = new Date()) {
  const compactDate = formatIstYmd(date).replace(/-/g, '').slice(2); // YYMMDD
  const counter = await Counter.findOneAndUpdate(
    { key: `BOOKING_${compactDate}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const serial = String(counter.seq).padStart(4, '0');
  return `VV-${compactDate}-${serial}`;
}

module.exports = { generateBookingCode };
