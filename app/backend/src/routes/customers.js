const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Customer = require('../models/Customer');
const Booking = require('../models/Booking');
const { uploadDir } = require('../config/env');
const { isPastDate } = require('../utils/date');

const router = express.Router();

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

router.get('/search', async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const customer = await Customer.findOne({ phone: phone.trim() }).lean();
    if (!customer) return res.status(404).json({ message: 'Customer not found with this phone number' });

    res.json(customer);
  } catch (e) {
    next(e);
  }
});

router.post('/', upload.single('photoId'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'photoId file is required' });

    const customer = await Customer.create({
      fullName: req.body.fullName,
      phone: req.body.phone,
      email: req.body.email || '',
      address: req.body.address || '',
      idType: req.body.idType,
      idNumber: req.body.idNumber,
      photoIdPath: req.file.path,
      createdBy: req.user.name
    });

    res.status(201).json(customer);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const customerId = req.params.id;
    const activeBookings = await Booking.find({ customerId, status: { $ne: 'CANCELLED' } }).lean();
    const hasPastBooking = activeBookings.some((b) => isPastDate(b.checkInDate));
    const hasCheckedInBooking = activeBookings.some((b) => ['CHECKED_IN', 'CHECKED_OUT', 'CLEANED'].includes(b.status));

    if ((hasPastBooking || hasCheckedInBooking) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Customer data after check-in/past stay can be edited only by admin' });
    }

    const updated = await Customer.findByIdAndUpdate(customerId, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Customer not found' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
