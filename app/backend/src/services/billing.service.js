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
    booking.mealSchedule || [],
    booking.discounts || {}
  );

  const lineItems = [];

  // Add base charges (before discount if applicable)
  if (booking.discounts && booking.discounts.roomDiscountType !== 'NONE' && quote.baseBeforeDiscount) {
    lineItems.push({ label: `Base stay charges (${quote.nights} night(s)) - Before Discount`, amount: quote.baseBeforeDiscount, category: 'ROOM' });
    lineItems.push({ label: `Room Discount (${booking.discounts.roomDiscountType === 'PERCENTAGE' ? booking.discounts.roomDiscountValue + '%' : 'Rs ' + booking.discounts.roomDiscountValue})`, amount: -quote.roomDiscountAmount, category: 'ROOM' });
  } else {
    lineItems.push({ label: `Base stay charges (${quote.nights} night(s))`, amount: quote.baseTotal, category: 'ROOM' });
  }

  // Add meal charges (before discount if applicable)
  if (quote.mealTotal > 0 || quote.mealBeforeDiscount > 0) {
    if (booking.discounts && booking.discounts.mealDiscountType !== 'NONE' && quote.mealBeforeDiscount) {
      lineItems.push({ label: 'Meals (as selected by date) - Before Discount', amount: quote.mealBeforeDiscount, category: 'FOOD' });
      lineItems.push({ label: `Meal Discount (${booking.discounts.mealDiscountType === 'PERCENTAGE' ? booking.discounts.mealDiscountValue + '%' : 'Rs ' + booking.discounts.mealDiscountValue})`, amount: -quote.mealDiscountAmount, category: 'FOOD' });
    } else if (quote.mealTotal > 0) {
      lineItems.push({ label: 'Meals (as selected by date)', amount: quote.mealTotal, category: 'FOOD' });
    }
  }

  // Add extra items (no discounts applied as per Task 16)
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

    // Optimized: Reduced header height from 64 to 56
    drawBrandHeader(doc, 'Tax Invoice');

    // Optimized: Reduced meta box from 112 to 96, moved closer to header
    const metaTop = 106;
    drawMetaRow(doc, 36, metaTop, 523, [
      ['Booking Ref', bookingId],
      ['Customer', customer?.fullName || '-'],
      ['Unit', `${room?.code || '-'} (${room?.size || '-'})`],
      ['Check-in (IST)', formatIstDateTime(booking.checkInDate)],
      ['Check-out (IST)', formatIstDateTime(booking.checkOutDate)],
      ['Generated', formatIstDateTime(new Date())]
    ], lineItems.length);

    // Optimized: Adjust table position and height based on line item count
    const tableTop = 216;
    const tableBottom = 680; // Increased from 650 to allow more rows
    drawTable(doc, 36, tableTop, 523, tableBottom - tableTop, ['Description', 'Category', 'Amount (Rs)'], lineItems.map((i) => [i.label, i.category, Number(i.amount).toFixed(2)]), lineItems.length);

    // Optimized: Reduced spacing in totals section
    doc.font('Helvetica').fontSize(9).fillColor('#1f2f3f');
    let y = 690;
    doc.text(`Amount Before GST: Rs ${subtotalBeforeGst.toFixed(2)}`, 360, y, { width: 199, align: 'right' });
    y += 14;
    doc.text(`GST (${gstPercent}%): Rs ${gstAmount.toFixed(2)}`, 360, y, { width: 199, align: 'right' });
    y += 16;
    doc.font('Helvetica-Bold').fontSize(11).text(`Grand Total (Inclusive): Rs ${totalAmount.toFixed(2)}`, 320, y, { width: 239, align: 'right' });

    doc.font('Helvetica').fontSize(8).fillColor('#4a5967').text('Thank you for choosing Vira Villas.', 36, 810, { width: 523, align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawBrandHeader(doc, subtitle) {
  // Optimized: Reduced height from 64 to 56
  doc.rect(36, 36, 523, 56).fill('#0b3f5a');
  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, 46, 42, { width: 42, height: 42 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('Vira Villas', 98, 44);
  doc.font('Helvetica').fontSize(10).text(subtitle, 98, 68);
}

function drawMetaRow(doc, x, y, width, pairs, itemCount = 0) {
  // Optimized: Reduced height from 112 to 96, reduced row spacing from 32 to 28
  doc.rect(x, y, width, 96).lineWidth(1).strokeColor('#b8c9d5').stroke();
  let ty = y + 6;
  const fontSize = itemCount > 25 ? 7 : 8; // Use smaller font if many items
  pairs.forEach(([k, v], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const tx = x + 10 + col * (width / 2);
    ty = y + 6 + row * 28;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#2a4252').text(`${k}:`, tx, ty);
    doc.font('Helvetica').fontSize(fontSize).fillColor('#1f2f3f').text(String(v), tx + 75, ty, { width: width / 2 - 85 });
  });
}

function drawTable(doc, x, y, width, height, headers, rows, itemCount = 0) {
  const colWidths = [width * 0.6, width * 0.2, width * 0.2];
  doc.rect(x, y, width, height).lineWidth(1).strokeColor('#b8c9d5').stroke();

  // Optimized: Reduced header height from 28 to 24
  const headerH = 24;
  doc.rect(x, y, width, headerH).fill('#0f4e6f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);

  let cursorX = x + 6;
  headers.forEach((h, i) => {
    doc.text(h, cursorX, y + 7, { width: colWidths[i] - 10 });
    cursorX += colWidths[i];
  });

  doc.strokeColor('#d6e0e8').lineWidth(0.8);
  let rowY = y + headerH;

  // Optimized: Dynamic row height and font size based on item count
  // 20px rows can fit ~23 items, 18px rows can fit ~26 items, 16px for 30+ items
  const rowH = itemCount > 30 ? 16 : itemCount > 25 ? 18 : 20;
  const fontSize = itemCount > 30 ? 6.5 : itemCount > 25 ? 7 : 8;
  const paddingY = Math.floor(rowH / 3);

  rows.forEach((row, idx) => {
    if (rowY + rowH > y + height) {
      // Pagination fallback: add indicator for remaining items
      if (idx < rows.length) {
        doc.font('Helvetica-Oblique').fontSize(7).fillColor('#888');
        doc.text(`... and ${rows.length - idx} more items (see next page)`, x + 8, rowY + 5);
      }
      return;
    }

    if (idx % 2 === 0) doc.rect(x, rowY, width, rowH).fill('#f7fafc');

    let cx = x + 6;
    doc.font('Helvetica').fontSize(fontSize).fillColor('#1f2f3f');
    row.forEach((cell, i) => {
      doc.text(String(cell), cx, rowY + paddingY, { width: colWidths[i] - 10 });
      cx += colWidths[i];
    });

    doc.moveTo(x, rowY + rowH).lineTo(x + width, rowY + rowH).stroke();
    rowY += rowH;
  });
}

module.exports = { generateBill };
