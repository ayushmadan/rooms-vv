// Indian-system amount in words, as printed on invoices: "Rupees One Lakh Twenty Thousand Only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = [
  { value: 10_000_000, name: 'Crore' },
  { value: 100_000, name: 'Lakh' },
  { value: 1000, name: 'Thousand' },
  { value: 100, name: 'Hundred' }
];

function belowHundred(n) {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ');
}

function integerToWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  let rest = n;
  for (const scale of SCALES) {
    if (rest >= scale.value) {
      parts.push(`${integerToWords(Math.floor(rest / scale.value))} ${scale.name}`);
      rest %= scale.value;
    }
  }
  if (rest) parts.push(belowHundred(rest));
  return parts.join(' ');
}

function amountInWords(paise) {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const words = `Rupees ${integerToWords(rupees)}${remainder ? ` and ${belowHundred(remainder)} Paise` : ''} Only`;
  return negative ? `Minus ${words}` : words;
}

module.exports = { amountInWords, integerToWords };
