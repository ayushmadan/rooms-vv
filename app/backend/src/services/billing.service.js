const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const Room = require('../models/Room');
const Bill = require('../models/Bill');
const { getBookingPricing } = require('./rent.service');
const { getSettings } = require('./settings.service');
const { outputDir } = require('../config/env');
const { formatIstDateTime } = require('../utils/date');

const LOGO_PATH = path.resolve('app/frontend/assets/logo.png');

async function generateBill(bookingId, extras = []) {
  const booking = await findBookingByRef(bookingId);
  if (!booking) throw new Error('Booking not found');

  const [room, customer, settings] = await Promise.all([
    Room.findById(booking.roomId).lean(),
    Customer.findById(booking.customerId).lean(),
    getSettings()
  ]);

  const quote = await getBookingPricing(
    booking.roomId,
    booking.checkInDate,
    booking.checkOutDate,
    booking.mealPlan || {},
    booking.pricingSnapshot?.nightlyBase || null,
    booking.mealSchedule || []
  );

  const lineItems = [{ label: `Base stay charges (${quote.nights} night(s))`, amount: quote.baseTotal, category: 'ROOM' }];

  if (quote.mealTotal > 0) {
    lineItems.push({ label: 'Meals (as selected by date)', amount: quote.mealTotal, category: 'FOOD' });
  }

  lineItems.push(...extras.map((item) => ({ ...item, amount: Number(item.amount || 0) })));

  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const gstPercent = Number(settings.gstPercent || 10);
  const subtotalBeforeGst = gstPercent > 0 ? Number((totalAmount / (1 + gstPercent / 100)).toFixed(2)) : totalAmount;
  const gstAmount = Number((totalAmount - subtotalBeforeGst).toFixed(2));

  const billsDir = path.join(outputDir, 'bills');
  fs.mkdirSync(billsDir, { recursive: true });
  const pdfPath = path.join(billsDir, `bill-${booking._id}.pdf`);

  await writeBillPdf({
    pdfPath,
    bookingId: booking.bookingCode || String(booking._id),
    customer,
    room,
    booking,
    lineItems,
    totalAmount,
    subtotalBeforeGst,
    gstAmount,
    gstPercent
  });

  const bill = await Bill.findOneAndUpdate(
    { bookingId: booking._id },
    {
      bookingId: booking._id,
      lineItems,
      subtotalBeforeGst,
      gstPercent,
      gstAmount,
      totalAmount,
      pdfPath,
      generatedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return bill;
}

async function findBookingByRef(ref) {
  if (mongoose.Types.ObjectId.isValid(ref)) {
    const byId = await Booking.findById(ref).lean();
    if (byId) return byId;
  }
  return Booking.findOne({ bookingCode: ref }).lean();
}

function writeBillPdf({ pdfPath, bookingId, customer, room, booking, lineItems, totalAmount, subtotalBeforeGst, gstAmount, gstPercent }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    drawBrandHeader(doc, 'Tax Invoice');

    const metaTop = 118;
    drawMetaRow(doc, 36, metaTop, 523, [
      ['Booking Ref', bookingId],
      ['Customer', customer?.fullName || '-'],
      ['Unit', `${room?.code || '-'} (${room?.size || '-'})`],
      ['Check-in (IST)', formatIstDateTime(booking.checkInDate)],
      ['Check-out (IST)', formatIstDateTime(booking.checkOutDate)],
      ['Generated', formatIstDateTime(new Date())]
    ]);

    const tableTop = 248;
    const tableBottom = 650;
    drawTable(doc, 36, tableTop, 523, tableBottom - tableTop, ['Description', 'Category', 'Amount (Rs)'], lineItems.map((i) => [i.label, i.category, Number(i.amount).toFixed(2)]));

    doc.font('Helvetica').fontSize(10).fillColor('#1f2f3f');
    let y = 670;
    doc.text(`Amount Before GST: Rs ${subtotalBeforeGst.toFixed(2)}`, 360, y, { width: 199, align: 'right' });
    y += 16;
    doc.text(`GST (${gstPercent}%): Rs ${gstAmount.toFixed(2)}`, 360, y, { width: 199, align: 'right' });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(12).text(`Grand Total (Inclusive): Rs ${totalAmount.toFixed(2)}`, 320, y, { width: 239, align: 'right' });

    doc.font('Helvetica').fontSize(9).fillColor('#4a5967').text('Thank you for choosing Vira Villas.', 36, 804, { width: 523, align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawBrandHeader(doc, subtitle) {
  doc.rect(36, 36, 523, 64).fill('#0b3f5a');
  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, 46, 45, { width: 46, height: 46 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Vira Villas', 102, 48);
  doc.font('Helvetica').fontSize(11).text(subtitle, 102, 74);
}

function drawMetaRow(doc, x, y, width, pairs) {
  doc.rect(x, y, width, 112).lineWidth(1).strokeColor('#b8c9d5').stroke();
  let ty = y + 8;
  pairs.forEach(([k, v], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const tx = x + 12 + col * (width / 2);
    ty = y + 8 + row * 32;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#2a4252').text(`${k}:`, tx, ty);
    doc.font('Helvetica').fontSize(9).fillColor('#1f2f3f').text(String(v), tx + 80, ty, { width: width / 2 - 90 });
  });
}

function drawTable(doc, x, y, width, height, headers, rows) {
  const colWidths = [width * 0.6, width * 0.2, width * 0.2];
  doc.rect(x, y, width, height).lineWidth(1).strokeColor('#b8c9d5').stroke();
  doc.rect(x, y, width, 28).fill('#0f4e6f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);

  let cursorX = x + 8;
  headers.forEach((h, i) => {
    doc.text(h, cursorX, y + 9, { width: colWidths[i] - 12 });
    cursorX += colWidths[i];
  });

  doc.strokeColor('#d6e0e8').lineWidth(0.8);
  let rowY = y + 28;
  const rowH = 24;
  rows.forEach((row, idx) => {
    if (rowY + rowH > y + height) return;
    if (idx % 2 === 0) doc.rect(x, rowY, width, rowH).fill('#f7fafc');

    let cx = x + 8;
    doc.font('Helvetica').fontSize(9).fillColor('#1f2f3f');
    row.forEach((cell, i) => {
      doc.text(String(cell), cx, rowY + 7, { width: colWidths[i] - 12 });
      cx += colWidths[i];
    });

    doc.moveTo(x, rowY + rowH).lineTo(x + width, rowY + rowH).stroke();
    rowY += rowH;
  });
}

module.exports = { generateBill };
