const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { createObjectCsvWriter } = require('csv-writer');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Customer = require('../models/Customer');
const Bill = require('../models/Bill');
const { outputDir } = require('../config/env');
const { formatYmd, formatIstDateTime } = require('../utils/date');
const { uploadToDrive } = require('./drive.service');

function backupsDirPath() {
  const backupsDir = path.join(outputDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  return backupsDir;
}

function istRangeToUtc(fromDate, toDate) {
  return {
    start: new Date(`${fromDate}T00:00:00+05:30`),
    end: new Date(`${toDate}T23:59:59+05:30`)
  };
}

async function buildRows(start, end) {
  const bookings = await Booking.find({ createdAt: { $gte: start, $lte: end } }).lean();

  const roomMap = await Room.find({}).lean();
  const customerMap = await Customer.find({}).lean();
  const roomsById = new Map(roomMap.map((r) => [String(r._id), r]));
  const customersById = new Map(customerMap.map((c) => [String(c._id), c]));

  // Fetch bills for all bookings
  const bookingIds = bookings.map((b) => b._id);
  const bills = await Bill.find({ bookingId: { $in: bookingIds } }).lean();
  const billsByBookingId = new Map(bills.map((bill) => [String(bill.bookingId), bill]));

  return bookings.map((b) => {
    const room = roomsById.get(String(b.roomId));
    const customer = customersById.get(String(b.customerId));
    const bill = billsByBookingId.get(String(b._id));

    // Calculate bill items summary
    const billItems = bill?.lineItems?.map((item) => `${item.label}: Rs${item.amount}`).join('; ') || 'No bill';

    // Calculate outstanding amount
    const totalDue = b.pricingSnapshot?.estimatedTotal || 0;
    const totalPaid = b.totalPaid || 0;
    const outstanding = Math.max(0, totalDue - totalPaid);

    return {
      bookingId: b.bookingCode || String(b._id),
      createdAtIst: formatIstDateTime(b.createdAt),
      customerName: customer?.fullName || '',
      customerPhone: customer?.phone || '',
      customerEmail: customer?.email || '',
      roomCode: room?.code || '',
      checkInIst: formatIstDateTime(b.checkInDate),
      checkOutIst: formatIstDateTime(b.checkOutDate),
      status: b.status,
      paymentStatus: b.paymentStatus || 'UNPAID',
      totalDue: totalDue,
      totalPaid: totalPaid,
      outstanding: outstanding,
      advancePaid: b.advancePaid || 0,
      billAmount: bill?.totalAmount || 0,
      billItems: billItems,
      notes: b.notes || ''
    };
  });
}

async function writeBackupCsv(fileName, rows) {
  const csvPath = path.join(backupsDirPath(), fileName);

  const writer = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'bookingId', title: 'BOOKING_ID' },
      { id: 'createdAtIst', title: 'CREATED_AT_IST' },
      { id: 'customerName', title: 'CUSTOMER_NAME' },
      { id: 'customerPhone', title: 'CUSTOMER_PHONE' },
      { id: 'customerEmail', title: 'CUSTOMER_EMAIL' },
      { id: 'roomCode', title: 'ROOM_CODE' },
      { id: 'checkInIst', title: 'CHECKIN_IST' },
      { id: 'checkOutIst', title: 'CHECKOUT_IST' },
      { id: 'status', title: 'STATUS' },
      { id: 'paymentStatus', title: 'PAYMENT_STATUS' },
      { id: 'totalDue', title: 'TOTAL_DUE' },
      { id: 'totalPaid', title: 'TOTAL_PAID' },
      { id: 'outstanding', title: 'OUTSTANDING' },
      { id: 'advancePaid', title: 'ADVANCE_PAID' },
      { id: 'billAmount', title: 'BILL_AMOUNT' },
      { id: 'billItems', title: 'BILL_ITEMS' },
      { id: 'notes', title: 'NOTES' }
    ]
  });

  await writer.writeRecords(rows);
  return csvPath;
}

async function runDailyBackup(part = 'part1') {
  const now = new Date();
  const ymd = formatYmd(now);
  const { start, end } = istRangeToUtc(ymd, ymd);

  const rows = await buildRows(start, end);
  const fileName = `${ymd}-${part}-backup.csv`;
  const csvPath = await writeBackupCsv(fileName, rows);

  const driveResult = await uploadToDrive(csvPath, fileName).catch((e) => ({ uploaded: false, reason: e.message }));
  return { csvPath, fileName, driveResult, rows: rows.length };
}

async function runRangeBackup(fromDate, toDate, label = 'manual') {
  const { start, end } = istRangeToUtc(fromDate, toDate);
  const rows = await buildRows(start, end);
  const fileName = `${fromDate}_to_${toDate}-${label}-backup.csv`;
  const csvPath = await writeBackupCsv(fileName, rows);
  return { csvPath, fileName, rows: rows.length };
}

function listBackupFiles() {
  return fs
    .readdirSync(backupsDirPath())
    .filter((name) => name.endsWith('.csv'))
    .sort();
}

async function uploadBackupFiles(fileNames = []) {
  const results = [];
  for (const fileName of fileNames) {
    const localPath = path.join(backupsDirPath(), fileName);
    if (!fs.existsSync(localPath)) {
      results.push({ fileName, uploaded: false, reason: 'File not found' });
      continue;
    }

    const result = await uploadToDrive(localPath, fileName).catch((e) => ({ uploaded: false, reason: e.message }));
    results.push({ fileName, ...result });
  }
  return results;
}

function scheduleBackups() {
  cron.schedule('0 11 * * *', () => runDailyBackup('part1'), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 23 * * *', () => runDailyBackup('part2'), { timezone: 'Asia/Kolkata' });
}

if (require.main === module) {
  const part = new Date().getHours() < 12 ? 'part1' : 'part2';
  runDailyBackup(part)
    .then((result) => {
      console.log('Backup complete:', result);
      process.exit(0);
    })
    .catch((e) => {
      console.error('Backup failed:', e.message);
      process.exit(1);
    });
}

module.exports = { runDailyBackup, runRangeBackup, listBackupFiles, uploadBackupFiles, scheduleBackups };
