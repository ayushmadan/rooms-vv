const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startApp, unitByCode } = require('./helpers');

const GUEST = { fullName: 'Asha Rao', phone: '98450 12345', city: 'Mysuru', idType: 'Aadhaar', idNumber: '1234 5678 9012' };
// 1x1 JPEG header bytes are enough for content sniffing.
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb', 'hex');

async function book(api, unitCode, { checkIn = '2026-11-02', checkOut = '2026-11-04', ...rest } = {}) {
  const unit = await unitByCode(api, unitCode);
  return api.post('/api/bookings', { unitIds: [unit.id], checkIn, checkOut, guest: GUEST, adults: 2, ...rest });
}

test('first run: setup is required once and seeds rooms and tables', async () => {
  const { api, stop } = await startApp({ setup: false });
  try {
    assert.equal((await api.get('/api/bootstrap')).data.setupCompleted, false);
    const bad = await api.post('/api/setup', { property: { name: 'X', invoicePrefix: 'VV' }, taxes: {}, meals: {}, pin: '12' });
    assert.equal(bad.status, 400);
    assert.equal((await api.get('/api/units')).data.length, 0, 'failed setup must not leave partial data');
    const ok = await api.post('/api/setup', {
      property: { name: 'Vira Villas', invoicePrefix: 'VV' },
      taxes: { roomGstPercent: 5, hallGstPercent: 18, foodGstPercent: 5, serviceGstPercent: 18, pricesIncludeTax: true },
      meals: { breakfast: 100, lunch: 150, dinner: 200 },
      pin: '4826'
    });
    assert.equal(ok.status, 200);
    assert.equal((await api.get('/api/units')).data.length, 10);
    assert.equal((await api.get('/api/tables')).data.length, 6);
    assert.equal((await api.post('/api/setup', {})).status, 409);
  } finally {
    await stop();
  }
});

test('security: CSRF header, host check, admin-only routes and PIN lockout', async () => {
  const { api, url, stop } = await startApp();
  try {
    const noHeader = await fetch(`${url}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(noHeader.status, 403);
    // fetch() refuses to override Host, so simulate a DNS-rebinding request with http.request.
    const badHostStatus = await new Promise((resolve, reject) => {
      const req = http.request(`${url}/api/health`, { headers: { host: 'evil.example' } }, (res) => resolve(res.statusCode));
      req.on('error', reject);
      req.end();
    });
    assert.equal(badHostStatus, 421);
    assert.equal((await api.get('/api/settings')).status, 403);
    assert.equal((await api.get('/api/reports/ledger?from=2026-11-01&to=2026-11-30')).status, 403);
    for (let i = 0; i < 5; i += 1) assert.equal((await api.post('/api/auth/unlock', { pin: '0000' })).status, 401);
    assert.equal((await api.post('/api/auth/unlock', { pin: '4826' })).status, 429, 'locked out after 5 failures');
    const health = await fetch(`${url}/api/health`);
    assert.match(health.headers.get('content-security-policy'), /script-src 'self'/);
  } finally {
    await stop();
  }
});

test('bookings: multi-room booking, overlap conflicts, same-day turnover', async () => {
  const { api, stop } = await startApp();
  try {
    const [r101, r102] = [await unitByCode(api, '101'), await unitByCode(api, '102')];
    const created = await api.post('/api/bookings', {
      unitIds: [r101.id, r102.id], checkIn: '2026-11-02', checkOut: '2026-11-04', guest: GUEST,
      advance: { amount: 1000, mode: 'UPI', reference: 'UTR1' }
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.bookings.map((b) => b.code), ['VV-261102-0001', 'VV-261102-0002']);

    const clash = await book(api, '101', { checkIn: '2026-11-03', checkOut: '2026-11-05' });
    assert.equal(clash.status, 409);
    assert.match(clash.data.message, /already booked/);
    const turnover = await book(api, '101', { checkIn: '2026-11-04', checkOut: '2026-11-05' });
    assert.equal(turnover.status, 201, 'departure day can be the next arrival day');

    const detail = (await api.get(`/api/bookings/${created.data.bookings[0].id}`)).data;
    assert.equal(detail.group.length, 1);
    assert.equal(detail.folio.total, 2 * 220000);
    assert.equal(detail.folio.paid, 100000);
    assert.equal(detail.folio.balance, 340000);

    const avail = (await api.get('/api/availability?from=2026-11-02&to=2026-11-03')).data;
    assert.equal(avail.find((u) => u.code === '101').available, false);
    assert.equal(avail.find((u) => u.code === '103').available, true);
  } finally {
    await stop();
  }
});

test('rates are frozen at booking time', async () => {
  const { api, stop } = await startApp();
  try {
    await api.unlock();
    const created = await book(api, '103');
    const id = created.data.bookings[0].id;
    const unit = await unitByCode(api, '103');
    await api.put(`/api/units/${unit.id}`, { code: '103', name: 'Room 103', kind: 'ROOM', baseRate: 9999, maxGuests: 2 }, { admin: true });
    assert.equal((await api.get(`/api/bookings/${id}`)).data.folio.total, 2 * 180000, 'existing booking keeps its rate');
    const extended = await api.patch(`/api/bookings/${id}`, { checkOut: '2026-11-05' });
    assert.equal(extended.data.folio.total, 2 * 180000 + 999900, 'only the added night uses the new rate');
  } finally {
    await stop();
  }
});

test('stay lifecycle: check-in with declaration, charges, payments, check-out, invoice', async () => {
  const { api, stop } = await startApp();
  try {
    const id = (await book(api, '201', { guest: { fullName: 'Ravi K', phone: '9000000001' }, mealPlan: { breakfast: true } })).data.bookings[0].id;
    const detail = (await api.get(`/api/bookings/${id}`)).data;

    const noId = await api.post(`/api/bookings/${id}/check-in`, { declaration: {} });
    assert.equal(noId.status, 400, 'photo ID is required before check-in');

    const photo = await api.raw('PUT', `/api/guests/${detail.guest.id}/photo?name=id.jpg`, { raw: JPEG });
    assert.equal(photo.status, 200);
    assert.equal(photo.data.hasIdPhoto, true);
    const notImage = await api.raw('PUT', `/api/guests/${detail.guest.id}/photo?name=x.jpg`, { raw: Buffer.from('<script>alert(1)</script>') });
    assert.equal(notImage.status, 400);

    const checkedIn = await api.post(`/api/bookings/${id}/check-in`, {
      guest: { ...detail.guest, idType: 'Driving Licence', idNumber: 'KA01 2020' },
      declaration: { arrivingFrom: 'Bengaluru', goingTo: 'Ooty', purpose: 'Leisure', coGuests: [{ name: 'Meera K', age: 31, relation: 'Spouse' }] },
      at: '2026-11-02T06:00:00.000Z'
    });
    assert.equal(checkedIn.status, 200, JSON.stringify(checkedIn.data));
    assert.equal(checkedIn.data.status, 'CHECKED_IN');
    assert.equal(checkedIn.data.declaration.coGuests[0].name, 'Meera K');

    const editLocked = await api.put(`/api/guests/${detail.guest.id}`, { ...detail.guest, fullName: 'Changed' });
    assert.equal(editLocked.status, 403, 'guest identity is locked after check-in');

    await api.post(`/api/bookings/${id}/charges`, { description: 'Laundry', category: 'SERVICE', amount: 300 });
    const afterCharge = (await api.get(`/api/bookings/${id}`)).data;
    const expected = 2 * 220000 + 2 * 10000 + 30000;
    assert.equal(afterCharge.folio.total, expected);

    const blocked = await api.post(`/api/bookings/${id}/check-out`, {});
    assert.equal(blocked.status, 409, 'unpaid balance blocks check-out');
    await api.post(`/api/bookings/${id}/payments`, { amount: expected / 100, mode: 'CASH' });
    const out = await api.post(`/api/bookings/${id}/check-out`, {});
    assert.equal(out.data.status, 'CHECKED_OUT');
    assert.equal((await unitByCode(api, '201')).hk_status, 'DIRTY');

    const inv1 = await api.post(`/api/bookings/${id}/invoice`, {});
    const inv2 = await api.post(`/api/bookings/${id}/invoice`, {});
    assert.equal(inv1.data.invoiceId, inv2.data.invoiceId, 'unchanged folio returns the same invoice');

    const printed = await api.get(`/print/invoice/${inv1.data.invoiceId}`);
    assert.equal(printed.status, 200);
    assert.match(printed.data, /VV\/26-27\/0001/);
    assert.match(printed.data, /Rupees Four Thousand Nine Hundred Only/);
    const declaration = await api.get(`/print/declaration/${id}`);
    assert.match(declaration.data, /Registration card/);
    assert.match(declaration.data, /Meera K/);
  } finally {
    await stop();
  }
});

test('early check-out on the arrival day bills one night, not the whole booking', async () => {
  const { api, stop } = await startApp();
  try {
    const id = (await book(api, '203', { checkOut: '2026-11-05' })).data.bookings[0].id;
    await api.post(`/api/bookings/${id}/check-in`, { declaration: {} });
    const out = await api.post(`/api/bookings/${id}/check-out`, { shortenStay: true, allowBalance: true });
    assert.equal(out.status, 200, JSON.stringify(out.data));
    assert.equal(out.data.checkOut, '2026-11-03');
    assert.equal(out.data.folio.total, 180000);
  } finally {
    await stop();
  }
});

test('privacy: staff see masked IDs; photos and numbers are sealed in the data file', async () => {
  const { api, server, stop } = await startApp();
  try {
    const id = (await book(api, '102', { guest: { ...GUEST, idNumber: '4521 8890 1123' } })).data.bookings[0].id;
    const guestId = (await api.get(`/api/bookings/${id}`)).data.guest.id;
    await api.raw('PUT', `/api/guests/${guestId}/photo`, { raw: JPEG });
    const staffView = (await api.get(`/api/guests/${guestId}`)).data;
    assert.equal(staffView.idNumber, 'XXXX XXXX 1123');
    assert.equal((await api.get(`/api/guests/${guestId}/photo`)).status, 403);
    assert.equal((await api.get(`/api/guests/${guestId}/id-number`)).status, 403);
    assert.equal((await api.get('/print/register?from=2026-11-01&to=2026-11-30')).status, 403);
    assert.doesNotMatch((await api.get(`/print/declaration/${id}`)).data, /452188901123|4521 8890 1123|\/photo/);

    // Saving the guest form with the masked number must not overwrite the real one.
    await api.put(`/api/guests/${guestId}`, { ...staffView, city: 'Kodagu' });
    await api.unlock();
    assert.equal((await api.get(`/api/guests/${guestId}/id-number`, { admin: true })).data.idNumber, '4521 8890 1123');

    const raw = server.store.all('SELECT id_number, id_number_enc FROM guests')[0];
    assert.equal(raw.id_number, 'XXXX XXXX 1123');
    assert.ok(!Buffer.from(raw.id_number_enc).toString('latin1').includes('8890'));
    const file = server.store.get('SELECT data, encrypted FROM files');
    assert.equal(file.encrypted, 1);
    assert.ok(!Buffer.from(file.data).includes(JPEG.subarray(0, 8)), 'photo bytes are not stored in the clear');

    const { ticket } = (await api.post('/api/auth/print-ticket', {}, { admin: true })).data;
    const card = (await api.get(`/print/declaration/${id}?ticket=${ticket}`)).data;
    assert.match(card, /\/photo\?side=front&ticket=/);
    assert.equal((await api.get(`/api/guests/${guestId}/photo?ticket=${ticket}`)).status, 200);
    assert.equal((await api.get(`/api/guests/${guestId}/photo?ticket=bogus`)).status, 403);
  } finally {
    await stop();
  }
});

test('privacy: IDs from before encryption are masked for staff and sealed at first admin unlock', async () => {
  const { api, server, stop } = await startApp();
  try {
    // Simulate an upgraded install: plain ID, no keys yet.
    server.store.run("DELETE FROM settings WHERE key = 'vault'");
    const g = server.store.insert('guests', { full_name: 'Old Guest', phone: '9000000009', id_type: 'Aadhaar', id_number: '1111 2222 3333', created_at: 'x', updated_at: 'x' });
    assert.equal((await api.get(`/api/guests/${g}`)).data.idNumber, 'XXXX XXXX 3333');
    await api.unlock();
    const row = server.store.get('SELECT id_number, id_number_enc FROM guests WHERE id = ?', g);
    assert.equal(row.id_number, 'XXXX XXXX 3333');
    assert.ok(row.id_number_enc, 'sealed on first unlock');
    assert.equal((await api.get(`/api/guests/${g}/id-number`, { admin: true })).data.idNumber, '1111 2222 3333');
  } finally {
    await stop();
  }
});

test('print pages escape guest-entered text', async () => {
  const { api, stop } = await startApp();
  try {
    const id = (await book(api, '104', { guest: { fullName: '<script>alert(1)</script>', phone: '9000000002' } })).data.bookings[0].id;
    const page = await api.get(`/print/folio/${id}`);
    assert.doesNotMatch(page.data, /<script>alert/);
    assert.match(page.data, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    await stop();
  }
});

test('restaurant: KOT, settle with change, post room service to folio', async () => {
  const { api, stop } = await startApp();
  try {
    await api.unlock();
    const dosa = (await api.post('/api/menu', { name: 'Masala Dosa', category: 'South Indian', price: 120, isVeg: true }, { admin: true })).data;
    const tea = (await api.post('/api/menu', { name: 'Filter Coffee', category: 'Beverages', price: 40, isVeg: true }, { admin: true })).data;
    const table = (await api.get('/api/tables')).data[0];

    const order = (await api.post('/api/orders', { kind: 'DINE_IN', tableId: table.id, covers: 2 })).data;
    await api.post(`/api/orders/${order.id}/items`, { menuItemId: dosa.id, qty: 2 });
    await api.post(`/api/orders/${order.id}/items`, { menuItemId: tea.id, qty: 1 });
    assert.equal((await api.post(`/api/orders/${order.id}/settle`, { payments: [{ amount: 300, mode: 'CASH' }] })).status, 409, 'must send KOT first');
    const kot = (await api.post(`/api/orders/${order.id}/kot`)).data;
    assert.equal(kot.kotNo, 1);
    const kotPage = await api.get(`/print/kot/${order.id}/${kot.kotNo}`);
    assert.match(kotPage.data, /Masala Dosa/);

    const staffVoid = await api.patch(`/api/orders/${order.id}/items/${kot.order.items[0].id}`, { qty: 0 });
    assert.equal(staffVoid.status, 403, 'items already in the kitchen need admin to void');

    const settled = await api.post(`/api/orders/${order.id}/settle`, { payments: [{ amount: 300, mode: 'CASH' }] });
    assert.equal(settled.status, 200, JSON.stringify(settled.data));
    assert.equal(settled.data.status, 'SETTLED');
    assert.equal(settled.data.paid, 28000, 'change of Rs 20 is not recorded as income');
    assert.ok(settled.data.invoice.number.startsWith('VV/26-27/'));

    const stay = (await book(api, '202')).data.bookings[0].id;
    await api.raw('PUT', `/api/guests/${(await api.get(`/api/bookings/${stay}`)).data.guest.id}/photo`, { raw: JPEG });
    await api.post(`/api/bookings/${stay}/check-in`, { declaration: {} });
    const rs = (await api.post('/api/orders', { kind: 'ROOM_SERVICE', bookingId: stay })).data;
    await api.post(`/api/orders/${rs.id}/items`, { menuItemId: tea.id, qty: 3 });
    await api.post(`/api/orders/${rs.id}/kot`);
    const posted = await api.post(`/api/orders/${rs.id}/post-to-room`, {});
    assert.equal(posted.data.status, 'POSTED');
    const folio = (await api.get(`/api/bookings/${stay}`)).data.folio;
    assert.ok(folio.lines.some((l) => l.description.startsWith(`Restaurant ${rs.code}`) && l.amount === 12000));
  } finally {
    await stop();
  }
});

test('billing: counter bill mixing catalogue, custom lines and price overrides', async () => {
  const { api, stop } = await startApp();
  try {
    await api.unlock();
    const services = (await api.get('/api/menu?type=SERVICE')).data;
    const laundry = services.find((s) => s.name.startsWith('Laundry - shirt'));
    assert.ok(laundry, 'default service catalogue is seeded');
    const bill = (await api.post('/api/orders', { kind: 'TAKEAWAY', customerName: 'Walk-in laundry', customerPhone: '9000011111' })).data;
    await api.post(`/api/orders/${bill.id}/items`, { menuItemId: laundry.id, qty: 5, unitPrice: 35 });
    const withCustom = await api.post(`/api/orders/${bill.id}/items`, { name: 'Dry cleaning - blazer', unitPrice: 250, category: 'SERVICE' });
    assert.equal(withCustom.data.pendingKot, false, 'services do not go to the kitchen');
    assert.equal(withCustom.data.totals.total, 5 * 3500 + 25000);
    const line = withCustom.data.items[0];
    const repriced = await api.patch(`/api/orders/${bill.id}/items/${line.id}`, { qty: 5, unitPrice: 40 });
    assert.equal(repriced.data.totals.total, 5 * 4000 + 25000);
    const settled = await api.post(`/api/orders/${bill.id}/settle`, { payments: [{ amount: 450, mode: 'UPI' }] });
    assert.equal(settled.status, 200, JSON.stringify(settled.data));
    const invoice = await api.get(`/print/invoice/${settled.data.invoice.id}`);
    assert.match(invoice.data, /Dry cleaning - blazer/);
    assert.match(invoice.data, /Services @ 18%/);

    const stay = (await book(api, '101')).data.bookings[0].id;
    const extraBed = services.find((s) => s.name.startsWith('Extra bed'));
    const folio = await api.post(`/api/bookings/${stay}/charges`, { catalogItemId: extraBed.id, qty: 2, unitPrice: 450 });
    const posted = folio.data.folio.lines.find((l) => l.description.startsWith('Extra bed'));
    assert.deepEqual([posted.qty, posted.rate, posted.amount, posted.category], [2, 45000, 90000, 'SERVICE']);
    const receiptId = (await api.post(`/api/bookings/${stay}/payments`, { amount: 500, mode: 'UPI' })).data.folio.payments[0].id;
    assert.match((await api.get(`/print/receipt/${receiptId}`)).data, /Rupees Five Hundred Only/);
    assert.match((await api.get(`/print/confirmation/${stay}`)).data, /Booking confirmation/);
  } finally {
    await stop();
  }
});

test('reports: daily summary, expenses and CSV export', async () => {
  const { api, stop } = await startApp();
  try {
    await api.unlock();
    const id = (await book(api, '101', { advance: { amount: 500, mode: 'UPI' } })).data.bookings[0].id;
    await api.post('/api/expenses', { category: 'Groceries', description: 'Milk', amount: 120, mode: 'CASH' });
    const daily = (await api.get('/api/reports/daily?date=2026-11-02')).data;
    assert.equal(daily.arrivals.length, 1);
    assert.equal(daily.collections.UPI, 50000);
    assert.equal(daily.expenseTotal, 12000);
    assert.equal(daily.cash.net, -12000);
    const csv = await api.get('/api/reports/csv/bookings?from=2026-11-01&to=2026-11-30', { admin: true });
    assert.equal(csv.status, 200);
    assert.match(csv.data, /VV-261102-0001/);
    const report = await api.get('/print/daily?date=2026-11-02');
    assert.match(report.data, /Day sheet/);
    assert.ok(id);
  } finally {
    await stop();
  }
});

test('data: export file imports on another computer with photos intact', async () => {
  const source = await startApp();
  const target = await startApp({ setup: false });
  try {
    await source.api.unlock();
    const id = (await book(source.api, '102')).data.bookings[0].id;
    const guestId = (await source.api.get(`/api/bookings/${id}`)).data.guest.id;
    await source.api.raw('PUT', `/api/guests/${guestId}/photo`, { raw: JPEG });
    const exported = await source.api.get('/api/data/export', { admin: true });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition'), /\.vvdata/);

    const garbage = await target.api.raw('POST', '/api/data/import/upload', { raw: Buffer.from('not a database') });
    assert.equal(garbage.status, 400);

    const upload = await target.api.raw('POST', '/api/data/import/upload', { raw: exported.data });
    assert.equal(upload.status, 200, JSON.stringify(upload.data));
    assert.equal(upload.data.summary.counts.bookings, 1);
    const confirmed = await target.api.post('/api/data/import/confirm', { uploadId: upload.data.uploadId });
    assert.equal(confirmed.status, 200);

    const boot = (await target.api.get('/api/bootstrap')).data;
    assert.equal(boot.setupCompleted, true);
    const moved = (await target.api.get(`/api/bookings/${id}`)).data;
    assert.equal(moved.code, 'VV-261102-0001');
    assert.equal((await target.api.get(`/api/guests/${guestId}/photo`)).status, 403, 'ID photos need the admin PIN');
    assert.equal((await target.api.unlock()).status, 200, 'PIN travels with the data');
    const photo = await target.api.get(`/api/guests/${guestId}/photo`, { admin: true });
    assert.equal(photo.status, 200);
    assert.ok(Buffer.compare(photo.data, JPEG) === 0, 'photo decrypts with the PIN on the new computer');
  } finally {
    await source.stop();
    await target.stop();
  }
});

test('data: import from the old MongoDB version', async () => {
  const { api, stop } = await startApp({ setup: false });
  try {
    const roomId = { $oid: '65c9f0000000000000000001' };
    const customerId = { $oid: '65c9f0000000000000000002' };
    const files = [
      { name: 'roomsvv.rooms.json', text: JSON.stringify([{ _id: roomId, code: '101', floor: 1, size: 'BIG', active: true }]) },
      { name: 'settings.json', text: JSON.stringify([{ key: 'GLOBAL', defaultBigRoomRent: 2500, breakfastRate: 120, gstPercent: 12 }]) },
      { name: 'customers.json', text: JSON.stringify([{ _id: customerId, fullName: 'Old Guest', phone: '9999999999', idType: 'AADHAAR', idNumber: 'x1', photoIdPath: '/nowhere.png' }]) },
      {
        name: 'bookings.json',
        text: JSON.stringify([{
          _id: { $oid: '65c9f0000000000000000003' }, bookingCode: 'VV-260211-0007', roomId, customerId,
          checkInDate: { $date: '2026-02-11T06:30:00.000Z' }, checkOutDate: { $date: '2026-02-13T05:30:00.000Z' },
          status: 'CLEANED', pricingSnapshot: { nightlyBase: 2500 }, totalPaid: 5000,
          paymentHistory: [{ amount: 1000, mode: 'UPI', type: 'ADVANCE', at: { $date: '2026-02-10T10:00:00Z' } }]
        }])
      }
    ];
    const res = await api.post('/api/data/legacy', { files });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data, { rooms: 1, guests: 1, photos: 0, bookings: 1, skippedBookings: 0 });
    const list = (await api.get('/api/bookings?q=VV-260211-0007')).data;
    assert.equal(list[0].status, 'CHECKED_OUT');
    assert.equal(list[0].checkIn, '2026-02-11');
    assert.equal(list[0].checkOut, '2026-02-13');
    assert.equal(list[0].total, 500000);
    assert.equal(list[0].paid, 500000, 'missing payment history is carried over as a balance payment');
    assert.equal((await api.post('/api/data/legacy', { files })).status, 409, 'refuses to import twice');
  } finally {
    await stop();
  }
});

test('phone capture: QR session uploads both sides, encrypted, then the link dies', async () => {
  const { api, server, clock, stop } = await startApp();
  try {
    const id = (await book(api, '203')).data.bookings[0].id;
    const guestId = (await api.get(`/api/bookings/${id}`)).data.guest.id;
    const session = (await api.post('/api/phone-capture', { guestId, label: 'Room 203' })).data;
    assert.match(session.url, /^http:\/\/127\.0\.0\.1:\d+\/c\/[A-Za-z0-9_-]{32}$/);
    assert.ok(session.qr.length >= 21 && /^[01]+$/.test(session.qr[0]), 'QR matrix for the desk to draw');

    const page = await fetch(session.url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(await page.text(), /Front of ID/);
    for (const side of ['front', 'back']) {
      const up = await fetch(`${session.url}/${side}`, { method: 'POST', body: JPEG, headers: { 'content-type': 'application/octet-stream' } });
      assert.equal(up.status, 201, side);
    }
    const bad = await fetch(`${session.url}/front`, { method: 'POST', body: Buffer.from('<html>not a photo</html>') });
    assert.equal(bad.status, 400, 'non-image rejected');

    const status = (await api.get(`/api/phone-capture/${session.id}`)).data;
    assert.ok(status.received.front && status.received.back);
    const guest = (await api.get(`/api/guests/${guestId}`)).data;
    assert.deepEqual([guest.hasIdPhoto, guest.hasIdPhotoBack], [true, true]);
    assert.equal(server.store.get('SELECT COUNT(*) AS n FROM files WHERE encrypted = 0').n, 0, 'phone photos are encrypted');

    const origin = new URL(session.url).origin;
    assert.equal((await fetch(`${origin}/api/guests`)).status, 404, 'the network listener exposes nothing else');
    assert.equal((await fetch(`${origin}/c/${'x'.repeat(32)}`)).status, 404, 'wrong code');

    clock.set('2026-11-02T06:45:00.000Z');
    assert.equal((await api.get(`/api/phone-capture/${session.id}`)).status, 404, 'session expires after 10 minutes');
    await assert.rejects(fetch(session.url), 'listener stops when no session is open');
  } finally {
    await stop();
  }
});
