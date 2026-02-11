const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    idType: { type: String, required: true },
    idNumber: { type: String, required: true },
    photoIdPath: { type: String, required: true },
    createdBy: { type: String, default: 'SYSTEM' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
