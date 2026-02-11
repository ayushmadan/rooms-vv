const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const Room = require('../models/Room');
const { outputDir } = require('../config/env');
const { generateBill } = require('../services/billing.service');
const { formatIstDateTime } = require('../utils/date');

const LOGO_PATH = path.resolve('app/frontend/assets/logo.png');
const router = express.Router();

router.post('/generate/:bookingId', async (req, res, next) => {
  try {
    const extras = Array.isArray(req.body.extras) ? req.body.extras : [];
    const bill = await generateBill(req.params.bookingId, extras);
    res.json(bill);
  } catch (e) {
    next(e);
  }
});

router.get('/pdf/:bookingId', async (req, res, next) => {
  try {
    const booking = await findBookingByRef(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const pdfPath = path.join(outputDir, 'bills', `bill-${booking._id}.pdf`);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ message: 'Bill not generated yet' });
    res.sendFile(path.resolve(pdfPath));
  } catch (e) {
    next(e);
  }
});

router.get('/declaration/:bookingId', async (req, res, next) => {
  try {
    const booking = await findBookingByRef(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const [customer, room] = await Promise.all([
      Customer.findById(booking.customerId).lean(),
      Room.findById(booking.roomId).lean()
    ]);

    const declarationPath = path.join(outputDir, 'bills', `declaration-${booking._id}.pdf`);
    await writeDeclarationPdf(declarationPath, customer, room, booking);
    res.sendFile(path.resolve(declarationPath));
  } catch (e) {
    next(e);
  }
});

function writeDeclarationPdf(filePath, customer, room, booking) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    drawBrandHeader(doc, 'Guest Declaration & Liability Undertaking');

    const infoTop = 118;
    doc.rect(36, infoTop, 523, 116).lineWidth(1).strokeColor('#b8c9d5').stroke();
    const rows = [
      ['Guest Name', customer?.fullName || '-'],
      ['Contact', customer?.phone || '-'],
      ['Photo ID', `${customer?.idType || '-'} - ${customer?.idNumber || '-'}`],
      ['Booked Unit', `${room?.code || '-'} (${room?.size || '-'})`],
      ['Check-in (IST)', formatIstDateTime(booking.checkInDate)],
      ['Check-out (IST)', formatIstDateTime(booking.checkOutDate)]
    ];
    rows.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 48 + col * 262;
      const y = infoTop + 10 + row * 34;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#2a4252').text(`${k}:`, x, y);
      doc.font('Helvetica').fontSize(9).fillColor('#1f2f3f').text(String(v), x + 84, y, { width: 170 });
    });

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#163446').text('Guest Declarations', 36, 252, { underline: true });
    doc.font('Helvetica').fontSize(10).fillColor('#1f2f3f');

    const clauses = [
      '1. I have provided accurate identity and contact information and submitted valid government-issued photo ID.',
      '2. I accept full responsibility for the conduct and safety of all occupants and visitors associated with this booking.',
      '3. I agree to comply with local laws and property policies including 12:00 PM check-in and 11:00 AM check-out (IST).',
      '4. I am liable for damages, losses, penalties or service disruptions caused by me or my guests during occupancy.',
      '5. I acknowledge that Vira Villas is not responsible for loss of valuables, personal injury, or legal violations by guests.',
      '6. I indemnify and hold harmless Vira Villas, its owners and staff from claims or legal consequences arising from guest actions.'
    ];

    let y = 275;
    clauses.forEach((line) => {
      doc.text(line, 36, y, { width: 523, lineGap: 3 });
      y += 38;
    });

    // Keep signatures anchored near bottom of page.
    const sigY = 760;
    doc.moveTo(60, sigY).lineTo(255, sigY).strokeColor('#708899').stroke();
    doc.moveTo(340, sigY).lineTo(535, sigY).strokeColor('#708899').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#23313f').text('Guest Signature', 60, sigY + 5, { width: 195, align: 'center' });
    doc.text('Authorized Signatory - Vira Villas', 340, sigY + 5, { width: 195, align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawBrandHeader(doc, subtitle) {
  doc.rect(36, 36, 523, 64).fill('#0b3f5a');
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 46, 45, { width: 46, height: 46 });
  }
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Vira Villas', 102, 48);
  doc.font('Helvetica').fontSize(11).text(subtitle, 102, 74);
}

async function findBookingByRef(ref) {
  if (mongoose.Types.ObjectId.isValid(ref)) {
    const byId = await Booking.findById(ref).lean();
    if (byId) return byId;
  }
  return Booking.findOne({ bookingCode: ref }).lean();
}

module.exports = router;
