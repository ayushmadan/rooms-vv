const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    floor: { type: Number, required: true, enum: [0, 1, 2] },
    size: { type: String, required: true, enum: ['BIG', 'SMALL', 'PARTY_HALL', 'DINING_HALL'] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);
