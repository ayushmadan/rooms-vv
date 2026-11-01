// All money is stored and computed as integer paise to avoid floating-point drift.
const PAISE_PER_RUPEE = 100;

function rupeesToPaise(rupees) {
  const value = Number(rupees);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * PAISE_PER_RUPEE);
}

function paiseToRupees(paise) {
  return Number(paise || 0) / PAISE_PER_RUPEE;
}

function formatInr(paise) {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Splits a tax-inclusive amount into taxable value and tax.
 * Returns integers in paise whose sum is exactly the inclusive amount.
 */
function splitInclusiveTax(inclusivePaise, ratePercent) {
  if (!ratePercent) return { taxable: inclusivePaise, tax: 0 };
  const taxable = Math.round(inclusivePaise / (1 + ratePercent / 100));
  return { taxable, tax: inclusivePaise - taxable };
}

function addExclusiveTax(taxablePaise, ratePercent) {
  const tax = Math.round((taxablePaise * (ratePercent || 0)) / 100);
  return { taxable: taxablePaise, tax };
}

/** Discount in paise for a base amount; never exceeds the base. */
function discountAmount(basePaise, type, value) {
  const numericValue = Number(value || 0);
  if (!type || type === 'NONE' || numericValue <= 0 || basePaise <= 0) return 0;
  if (type === 'PERCENT') {
    const percent = Math.min(numericValue, 100);
    return Math.round((basePaise * percent) / 100);
  }
  if (type === 'AMOUNT') return Math.min(Math.round(numericValue), basePaise);
  throw new Error(`Unknown discount type: ${type}`);
}

module.exports = { rupeesToPaise, paiseToRupees, formatInr, splitInclusiveTax, addExclusiveTax, discountAmount };
