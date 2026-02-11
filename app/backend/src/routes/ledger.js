const express = require('express');
const Booking = require('../models/Booking');
const Bill = require('../models/Bill');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/report', requireAdmin, async (req, res, next) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    const filter = {};

    if (from && to) {
      filter.createdAt = {
        $gte: new Date(`${from}T00:00:00+05:30`),
        $lte: new Date(`${to}T23:59:59+05:30`)
      };
    }

    const [bookings, bills] = await Promise.all([
      Booking.find(filter).populate('customerId').populate('roomId').sort({ createdAt: -1 }).lean(),
      Bill.find(filter).sort({ generatedAt: -1 }).lean()
    ]);

    const totalDue = bookings.reduce((sum, b) => sum + Number(b.pricingSnapshot?.estimatedTotal || 0), 0);
    const totalPaid = bookings.reduce((sum, b) => sum + Number(b.totalPaid || 0), 0);
    const totalAdvance = bookings.reduce((sum, b) => sum + Number(b.advancePaid || 0), 0);

    res.json({
      summary: {
        totalBookings: bookings.length,
        totalBills: bills.length,
        totalDue,
        totalPaid,
        outstanding: Math.max(0, totalDue - totalPaid),
        totalAdvance
      },
      rows: bookings.map((b) => ({
        bookingId: b.bookingCode || b._id,
        customer: b.customerId?.fullName || '-',
        unit: b.roomId?.code || '-',
        status: b.status,
        paymentStatus: b.paymentStatus,
        amountDue: b.pricingSnapshot?.estimatedTotal || 0,
        paid: b.totalPaid || 0,
        advance: b.advancePaid || 0,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        createdAt: b.createdAt
      }))
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
