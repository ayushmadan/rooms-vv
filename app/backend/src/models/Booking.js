const mongoose = require('mongoose');

const mealPlanSchema = new mongoose.Schema(
  {
    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: false },
    dinner: { type: Boolean, default: false }
  },
  { _id: false }
);

const mealScheduleEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD IST
    breakfast: { type: Boolean, default: false },
    lunch: { type: Boolean, default: false },
    dinner: { type: Boolean, default: false }
  },
  { _id: false }
);

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    mode: { type: String, enum: ['UPI', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD'], required: true },
    type: { type: String, enum: ['ADVANCE', 'SETTLEMENT', 'REFUND'], default: 'ADVANCE' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingCode: { type: String, required: true, unique: true, index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    mealPlan: { type: mealPlanSchema, default: () => ({}) },
    mealSchedule: { type: [mealScheduleEntrySchema], default: [] },
    pricingSnapshot: {
      nightlyBase: { type: Number, default: 0 },
      nightlyMealAddon: { type: Number, default: 0 },
      estimatedTotal: { type: Number, default: 0 },
      baseBeforeDiscount: { type: Number, default: 0 },
      mealBeforeDiscount: { type: Number, default: 0 },
      totalDiscount: { type: Number, default: 0 }
    },
    discounts: {
      roomDiscountType: { type: String, enum: ['NONE', 'PERCENTAGE', 'AMOUNT'], default: 'NONE' },
      roomDiscountValue: { type: Number, default: 0 },
      roomDiscountAmount: { type: Number, default: 0 },
      mealDiscountType: { type: String, enum: ['NONE', 'PERCENTAGE', 'AMOUNT'], default: 'NONE' },
      mealDiscountValue: { type: Number, default: 0 },
      mealDiscountAmount: { type: Number, default: 0 }
    },
    status: {
      type: String,
      enum: ['BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'CLEANED'],
      default: 'BOOKED'
    },
    cleanedAt: { type: Date, default: null },
    paymentMode: { type: String, enum: ['UPI', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD'], default: 'CASH' },
    advancePaid: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'ADVANCE_COLLECTED', 'PARTIALLY_PAID', 'PAID'],
      default: 'UNPAID'
    },
    billPaid: { type: Boolean, default: false },
    paymentHistory: { type: [paymentEntrySchema], default: [] },
    lockedPast: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    createdBy: { type: String, default: 'STAFF' }
  },
  { timestamps: true }
);

bookingSchema.index({ roomId: 1, checkInDate: 1, checkOutDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
