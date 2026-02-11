const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const { parseIstCheckIn, parseIstCheckOut, formatIstDateTime } = require('../utils/date');
const { getBookingPricing } = require('../services/rent.service');
const { generateBookingCode } = require('../services/booking-code.service');

const router = express.Router();

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function calculatePaymentStatus(totalPaid, totalDue, advancePaid) {
  if (totalPaid >= totalDue && totalDue > 0) return 'PAID';
  if (advancePaid > 0 && totalPaid < totalDue) return totalPaid > 0 ? 'PARTIALLY_PAID' : 'ADVANCE_COLLECTED';
  if (totalPaid > 0 && totalPaid < totalDue) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

async function hasRoomConflict(roomId, start, end, ignoreBookingId = null) {
  const bookings = await Booking.find({ roomId, status: { $nin: ['CANCELLED'] } }).lean();
  return bookings.some((b) => {
    if (ignoreBookingId && String(b._id) === String(ignoreBookingId)) return false;
    return overlaps(start, end, new Date(b.checkInDate), new Date(b.checkOutDate));
  });
}

async function findBookingByRef(ref) {
  if (mongoose.Types.ObjectId.isValid(ref)) {
    const byId = await Booking.findById(ref);
    if (byId) return byId;
  }
  return Booking.findOne({ bookingCode: ref });
}

router.get('/availability', async (req, res, next) => {
  try {
    const fromDate = req.query.from;
    const toDate = req.query.to;

    if (!fromDate || !toDate) return res.status(400).json({ message: 'from and to query params are required' });

    const from = parseIstCheckIn(fromDate);
    const to = parseIstCheckOut(toDate);

    const [rooms, bookings] = await Promise.all([
      Room.find({ active: true }).lean(),
      Booking.find({ status: { $nin: ['CANCELLED'] } }).lean()
    ]);

    const data = rooms.map((room) => {
      const matching = bookings.filter(
        (b) => String(b.roomId) === String(room._id) && overlaps(from, to, new Date(b.checkInDate), new Date(b.checkOutDate))
      );
      const needsCleaning = bookings.some((b) => String(b.roomId) === String(room._id) && b.status === 'CHECKED_OUT');

      return {
        roomId: room._id,
        code: room.code,
        floor: room.floor,
        size: room.size,
        available: matching.length === 0,
        occupancyCount: matching.length,
        needsCleaning
      };
    });

    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get('/room-bookings', async (req, res, next) => {
  try {
    const { roomId, from, to } = req.query;
    if (!roomId || !from || !to) return res.status(400).json({ message: 'roomId, from and to are required' });

    const start = parseIstCheckIn(from);
    const end = parseIstCheckOut(to);

    const bookings = await Booking.find({ roomId, status: { $nin: ['CANCELLED'] } })
      .populate('customerId')
      .sort({ checkInDate: 1 })
      .lean();

    const filtered = bookings
      .filter((b) => overlaps(start, end, new Date(b.checkInDate), new Date(b.checkOutDate)))
      .map((b) => ({
        bookingId: b.bookingCode || String(b._id),
        customerName: b.customerId?.fullName || '-',
        checkInIst: formatIstDateTime(b.checkInDate),
        checkOutIst: formatIstDateTime(b.checkOutDate),
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalPaid: b.totalPaid,
        totalDue: b.pricingSnapshot?.estimatedTotal || 0
      }));

    res.json(filtered);
  } catch (e) {
    next(e);
  }
});

router.post('/quote', async (req, res, next) => {
  try {
    const { roomId, checkInDate, checkOutDate, mealPlan, mealSchedule, nightlyBaseOverride } = req.body;
    const quote = await getBookingPricing(
      roomId,
      parseIstCheckIn(checkInDate),
      parseIstCheckOut(checkOutDate),
      mealPlan || {},
      nightlyBaseOverride,
      mealSchedule || []
    );
    res.json(quote);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      roomId,
      customerId,
      checkInDate,
      checkOutDate,
      notes,
      mealPlan,
      mealSchedule,
      nightlyBaseOverride,
      paymentMode,
      advancePaid = 0
    } = req.body;

    const newStart = parseIstCheckIn(checkInDate);
    const newEnd = parseIstCheckOut(checkOutDate);
    if (newStart >= newEnd) return res.status(400).json({ message: 'checkOutDate must be after checkInDate' });

    if (await hasRoomConflict(roomId, newStart, newEnd)) {
      return res.status(409).json({ message: 'Room not available for selected dates' });
    }

    const quote = await getBookingPricing(roomId, newStart, newEnd, mealPlan || {}, nightlyBaseOverride, mealSchedule || []);
    const safeAdvance = Math.max(0, Number(advancePaid || 0));

    const booking = await Booking.create({
      bookingCode: await generateBookingCode(newStart),
      roomId,
      customerId,
      checkInDate: newStart,
      checkOutDate: newEnd,
      mealPlan: mealPlan || {},
      mealSchedule: mealSchedule || [],
      pricingSnapshot: {
        nightlyBase: Number(nightlyBaseOverride) > 0 ? Number(nightlyBaseOverride) : quote.nightlyBaseAvg,
        nightlyMealAddon: quote.nightlyMealAddon,
        estimatedTotal: quote.total
      },
      paymentMode: paymentMode || 'CASH',
      advancePaid: safeAdvance,
      totalPaid: safeAdvance,
      paymentStatus: calculatePaymentStatus(safeAdvance, quote.total, safeAdvance),
      paymentHistory: safeAdvance
        ? [{ amount: safeAdvance, mode: paymentMode || 'CASH', type: 'ADVANCE', note: 'Advance collected at booking' }]
        : [],
      notes: notes || '',
      createdBy: req.user.name
    });

    res.status(201).json(booking);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/reschedule', async (req, res, next) => {
  try {
    const booking = await findBookingByRef(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status === 'CANCELLED') return res.status(400).json({ message: 'Cannot move a cancelled booking' });

    const roomId = req.body.roomId || booking.roomId;
    const newStart = req.body.checkInDate ? parseIstCheckIn(req.body.checkInDate) : booking.checkInDate;
    const newEnd = req.body.checkOutDate ? parseIstCheckOut(req.body.checkOutDate) : booking.checkOutDate;
    if (newStart >= newEnd) return res.status(400).json({ message: 'Invalid date range' });

    if (await hasRoomConflict(roomId, newStart, newEnd, booking._id)) {
      return res.status(409).json({ message: 'Target room is not available for selected range' });
    }

    const mealPlan = req.body.mealPlan || booking.mealPlan;
    const mealSchedule = req.body.mealSchedule || booking.mealSchedule || [];
    const nightlyBaseOverride = Number(req.body.nightlyBaseOverride || booking.pricingSnapshot.nightlyBase);
    const quote = await getBookingPricing(roomId, newStart, newEnd, mealPlan, nightlyBaseOverride, mealSchedule);

    booking.roomId = roomId;
    booking.checkInDate = newStart;
    booking.checkOutDate = newEnd;
    booking.mealPlan = mealPlan;
    booking.mealSchedule = mealSchedule;
    booking.pricingSnapshot = {
      nightlyBase: nightlyBaseOverride,
      nightlyMealAddon: quote.nightlyMealAddon,
      estimatedTotal: quote.total
    };
    booking.paymentStatus = calculatePaymentStatus(booking.totalPaid, quote.total, booking.advancePaid);
    booking.billPaid = booking.totalPaid >= quote.total;

    await booking.save();
    res.json(booking);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const booking = await findBookingByRef(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    booking.status = 'CANCELLED';
    await booking.save();
    res.json(booking);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { action } = req.body;
    const booking = await findBookingByRef(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (action === 'CHECK_IN') booking.status = 'CHECKED_IN';
    else if (action === 'CHECK_OUT') booking.status = 'CHECKED_OUT';
    else if (action === 'CLEANED') {
      if (booking.status !== 'CHECKED_OUT') return res.status(400).json({ message: 'Cleaning allowed only after check-out' });
      booking.status = 'CLEANED';
      booking.cleanedAt = new Date();
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    await booking.save();
    res.json(booking);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/payment', async (req, res, next) => {
  try {
    const { amount = 0, mode = 'CASH', type = 'SETTLEMENT', markBillPaid = false, note = '' } = req.body;
    const booking = await findBookingByRef(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const numericAmount = Number(amount || 0);
    if (numericAmount < 0) return res.status(400).json({ message: 'Amount must be positive' });

    if (numericAmount > 0) {
      if (type === 'ADVANCE') booking.advancePaid += numericAmount;
      if (type === 'REFUND') booking.totalPaid -= numericAmount;
      else booking.totalPaid += numericAmount;

      booking.paymentHistory.push({ amount: numericAmount, mode, type, note: note || '' });
      booking.paymentMode = mode;
    }

    const due = booking.pricingSnapshot?.estimatedTotal || 0;
    booking.paymentStatus = calculatePaymentStatus(booking.totalPaid, due, booking.advancePaid);
    if (markBillPaid) booking.billPaid = true;
    else booking.billPaid = booking.totalPaid >= due;

    await booking.save();
    res.json(booking);
  } catch (e) {
    next(e);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const data = await Booking.find({})
      .populate('roomId')
      .populate('customerId')
      .sort({ checkInDate: -1 });
    const mapped = data.map((b) => ({
      ...b.toObject(),
      bookingRef: b.bookingCode || String(b._id)
    }));
    res.json(mapped);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
