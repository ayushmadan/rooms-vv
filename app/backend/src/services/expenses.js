const v = require('../lib/validate');
const { notFound } = require('../lib/http');
const { PAYMENT_MODES } = require('./folio');
const audit = require('./audit');

const CATEGORIES = ['Groceries', 'Vegetables & dairy', 'Gas & fuel', 'Electricity & water', 'Laundry', 'Repairs', 'Salaries & wages', 'Supplies', 'Commission', 'Other'];

function dto(row) {
  return {
    id: row.id, date: row.date, category: row.category, description: row.description, amount: row.amount,
    mode: row.mode, paidTo: row.paid_to, voided: Boolean(row.voided_at), createdBy: row.created_by
  };
}

function list(store, { from, to }) {
  return store
    .all('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC', v.ymd(from, 'From'), v.ymd(to, 'To'))
    .map(dto);
}

function create(ctx, body) {
  const id = ctx.store.insert('expenses', {
    date: body.date ? v.ymd(body.date, 'Date') : ctx.today(),
    category: v.oneOf(body.category, 'Category', CATEGORIES, 'Other'),
    description: v.text(body.description, 'Description', { max: 200 }),
    amount: v.rupees(body.amount, 'Amount', { min: 0.01 }),
    mode: v.oneOf(body.mode, 'Paid by', PAYMENT_MODES, 'CASH'),
    paid_to: v.text(body.paidTo, 'Paid to', { max: 80 }),
    created_by: ctx.actor,
    created_at: ctx.now()
  });
  audit.record(ctx, 'expense.create', 'expense', id);
  return dto(ctx.store.get('SELECT * FROM expenses WHERE id = ?', id));
}

function voidExpense(ctx, id) {
  const row = ctx.store.get('SELECT * FROM expenses WHERE id = ?', id);
  if (!row || row.voided_at) throw notFound('Expense not found');
  ctx.store.update('expenses', id, { voided_at: ctx.now() });
  audit.record(ctx, 'expense.void', 'expense', id);
}

module.exports = { CATEGORIES, list, create, voidExpense };
