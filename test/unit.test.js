const test = require('node:test');
const assert = require('node:assert/strict');
const { splitInclusiveTax, addExclusiveTax, discountAmount, rupeesToPaise } = require('../app/backend/src/lib/money');
const { stayNights, financialYear, isYmd, ymdInZone, addDays } = require('../app/backend/src/lib/dates');
const { amountInWords } = require('../app/backend/src/lib/words');
const { html, raw } = require('../app/backend/src/lib/html');
const { computeStay, groupNightsByRent, mealsForNight } = require('../app/backend/src/services/pricing');
const { computeTax } = require('../app/backend/src/services/folio');
const { toCsv } = require('../app/backend/src/services/reports');

test('money: rupees convert to integer paise without float drift', () => {
  assert.equal(rupeesToPaise(0.1 + 0.2), 30);
  assert.equal(rupeesToPaise('1800.50'), 180050);
  assert.equal(rupeesToPaise('abc'), 0);
});

test('money: inclusive GST split always sums back to the gross amount', () => {
  for (const amount of [1, 99, 180000, 333333]) {
    const { taxable, tax } = splitInclusiveTax(amount, 18);
    assert.equal(taxable + tax, amount);
  }
  assert.deepEqual(splitInclusiveTax(105000, 5), { taxable: 100000, tax: 5000 });
  assert.deepEqual(addExclusiveTax(100000, 18), { taxable: 100000, tax: 18000 });
});

test('money: discounts are capped at the base amount', () => {
  assert.equal(discountAmount(10000, 'PERCENT', 10), 1000);
  assert.equal(discountAmount(10000, 'PERCENT', 150), 10000);
  assert.equal(discountAmount(10000, 'AMOUNT', 50000), 10000);
  assert.equal(discountAmount(10000, 'NONE', 50), 0);
  assert.throws(() => discountAmount(10000, 'BOGUS', 5));
});

test('dates: nights, validation, financial year and time zones', () => {
  assert.deepEqual(stayNights('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.equal(isYmd('2026-02-30'), false);
  assert.equal(isYmd('2026-02-28'), true);
  assert.equal(financialYear('2026-03-31'), '25-26');
  assert.equal(financialYear('2026-04-01'), '26-27');
  assert.equal(ymdInZone('2026-11-01T20:00:00Z', 'Asia/Kolkata'), '2026-11-02');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
});

test('words: Indian numbering for invoice amounts', () => {
  assert.equal(amountInWords(12000000), 'Rupees One Lakh Twenty Thousand Only');
  assert.equal(amountInWords(250050), 'Rupees Two Thousand Five Hundred and Fifty Paise Only');
  assert.equal(amountInWords(1234567800), 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only');
});

test('html: interpolated values are escaped, raw() is not', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(html`<p>${name}</p>`.toString(), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(html`<p>${raw('<b>ok</b>')}</p>`.toString(), '<p><b>ok</b></p>');
});

test('pricing: per-night rents, scheduled meals and discounts', () => {
  const stay = computeStay({
    checkIn: '2026-11-01',
    checkOut: '2026-11-04',
    rentForNight: (d) => (d === '2026-11-02' ? 300000 : 200000),
    mealRatesFor: () => ({ breakfast: 10000, lunch: 15000, dinner: 20000 }),
    mealPlan: { breakfast: true },
    mealSchedule: [{ date: '2026-11-03', breakfast: false, lunch: false, dinner: true }],
    discounts: { roomType: 'PERCENT', roomValue: 10, mealType: 'AMOUNT', mealValue: 5000 }
  });
  assert.equal(stay.nightCount, 3);
  assert.equal(stay.roomGross, 700000);
  assert.equal(stay.mealGross, 10000 + 10000 + 20000);
  assert.equal(stay.roomDiscount, 70000);
  assert.equal(stay.mealDiscount, 5000);
  assert.equal(stay.total, 700000 - 70000 + 40000 - 5000);
  assert.deepEqual(groupNightsByRent(stay.nights).map((g) => [g.count, g.rate]), [[1, 200000], [1, 300000], [1, 200000]]);
  assert.deepEqual(mealsForNight('2026-11-03', { breakfast: true }, stay.nights.map((n) => ({ date: n.date, ...n.meals }))), { breakfast: false, lunch: false, dinner: true });
});

test('tax: each category taxed at its own rate, inclusive and exclusive', () => {
  const taxes = { roomGstPercent: 5, hallGstPercent: 18, foodGstPercent: 5, serviceGstPercent: 18, pricesIncludeTax: true };
  const lines = [{ category: 'ROOM', amount: 210000 }, { category: 'SERVICE', amount: 11800 }];
  const inclusive = computeTax(lines, taxes);
  assert.equal(inclusive.total, 221800);
  assert.equal(inclusive.tax, 10000 + 1800);
  const exclusive = computeTax(lines, { ...taxes, pricesIncludeTax: false });
  assert.equal(exclusive.total, 221800 + 10500 + 2124);
});


test('csv: quotes fields and neutralises spreadsheet formulas', () => {
  const out = toCsv([{ title: 'Name', value: (r) => r.name }], [{ name: '=HYPERLINK("x")' }, { name: 'Rao, K' }]);
  assert.equal(out, '﻿Name\r\n"\'=HYPERLINK(""x"")"\r\n"Rao, K"\r\n');
});
