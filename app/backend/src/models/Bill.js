const mongoose = require('mongoose');

const billLineItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, enum: ['ROOM', 'FOOD', 'SERVICE'], default: 'SERVICE' }
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    lineItems: { type: [billLineItemSchema], default: [] },
    subtotalBeforeGst: { type: Number, required: true, default: 0 },
    gstPercent: { type: Number, required: true, default: 10 },
    gstAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    generatedAt: { type: Date, default: Date.now },
    pdfPath: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Bill', billSchema);
