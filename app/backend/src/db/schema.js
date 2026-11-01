// Ordered, append-only migrations. Never edit a shipped migration; add a new one.
// PRAGMA user_version records how many have been applied.
const MIGRATIONS = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE counters (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE units (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('ROOM', 'HALL')),
    room_type TEXT NOT NULL DEFAULT '',
    floor TEXT NOT NULL DEFAULT '',
    base_rate INTEGER NOT NULL CHECK (base_rate >= 0),
    max_guests INTEGER NOT NULL DEFAULT 2,
    hk_status TEXT NOT NULL DEFAULT 'CLEAN' CHECK (hk_status IN ('CLEAN', 'DIRTY', 'OUT_OF_ORDER')),
    hk_note TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE rate_overrides (
    unit_id INTEGER NOT NULL REFERENCES units(id),
    date TEXT NOT NULL,
    rate INTEGER NOT NULL CHECK (rate >= 0),
    PRIMARY KEY (unit_id, date)
  );

  CREATE TABLE meal_rate_overrides (
    date TEXT PRIMARY KEY,
    breakfast INTEGER NOT NULL,
    lunch INTEGER NOT NULL,
    dinner INTEGER NOT NULL
  );

  CREATE TABLE guests (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    nationality TEXT NOT NULL DEFAULT 'Indian',
    id_type TEXT NOT NULL DEFAULT '',
    id_number TEXT NOT NULL DEFAULT '',
    id_photo_file_id INTEGER REFERENCES files(id),
    company TEXT NOT NULL DEFAULT '',
    gstin TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_guests_phone ON guests(phone);
  CREATE INDEX idx_guests_name ON guests(full_name COLLATE NOCASE);

  CREATE TABLE bookings (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    group_code TEXT NOT NULL DEFAULT '',
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'BOOKED'
      CHECK (status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW')),
    adults INTEGER NOT NULL DEFAULT 1,
    children INTEGER NOT NULL DEFAULT 0,
    nightly_rate INTEGER,
    rate_snapshot TEXT NOT NULL DEFAULT '{}',
    meal_plan TEXT NOT NULL DEFAULT '{}',
    meal_schedule TEXT NOT NULL DEFAULT '[]',
    room_discount_type TEXT NOT NULL DEFAULT 'NONE',
    room_discount_value REAL NOT NULL DEFAULT 0,
    meal_discount_type TEXT NOT NULL DEFAULT 'NONE',
    meal_discount_value REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'Walk-in',
    notes TEXT NOT NULL DEFAULT '',
    checked_in_at TEXT,
    checked_out_at TEXT,
    cancelled_at TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (check_in < check_out)
  );
  CREATE INDEX idx_bookings_unit_dates ON bookings(unit_id, check_in, check_out);
  CREATE INDEX idx_bookings_guest ON bookings(guest_id);
  CREATE INDEX idx_bookings_status ON bookings(status);

  CREATE TABLE declarations (
    id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
    co_guests TEXT NOT NULL DEFAULT '[]',
    arriving_from TEXT NOT NULL DEFAULT '',
    going_to TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL DEFAULT '',
    vehicle_no TEXT NOT NULL DEFAULT '',
    passport_no TEXT NOT NULL DEFAULT '',
    visa_no TEXT NOT NULL DEFAULT '',
    visa_valid_till TEXT NOT NULL DEFAULT '',
    arrived_in_india_on TEXT NOT NULL DEFAULT '',
    remarks TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE charges (
    id INTEGER PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('FOOD', 'SERVICE', 'OTHER')),
    amount INTEGER NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    voided_at TEXT,
    void_reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_charges_booking ON charges(booking_id);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id),
    order_id INTEGER REFERENCES orders(id),
    kind TEXT NOT NULL CHECK (kind IN ('ADVANCE', 'PAYMENT', 'REFUND')),
    mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    reference TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL,
    voided_at TEXT,
    void_reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
  );
  CREATE INDEX idx_payments_booking ON payments(booking_id);
  CREATE INDEX idx_payments_order ON payments(order_id);
  CREATE INDEX idx_payments_received ON payments(received_at);

  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    booking_id INTEGER REFERENCES bookings(id),
    order_id INTEGER REFERENCES orders(id),
    issued_at TEXT NOT NULL,
    bill_to TEXT NOT NULL,
    lines TEXT NOT NULL,
    tax_lines TEXT NOT NULL,
    taxable INTEGER NOT NULL,
    tax INTEGER NOT NULL,
    total INTEGER NOT NULL,
    paid INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'VOID')),
    void_reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_invoices_booking ON invoices(booking_id);
  CREATE INDEX idx_invoices_order ON invoices(order_id);

  CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    price INTEGER NOT NULL CHECK (price >= 0),
    is_veg INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE dining_tables (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 4,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE')),
    table_id INTEGER REFERENCES dining_tables(id),
    booking_id INTEGER REFERENCES bookings(id),
    customer_name TEXT NOT NULL DEFAULT '',
    covers INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'POSTED', 'CANCELLED')),
    discount_type TEXT NOT NULL DEFAULT 'NONE',
    discount_value REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    closed_at TEXT
  );
  CREATE INDEX idx_orders_status ON orders(status);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    menu_item_id INTEGER REFERENCES menu_items(id),
    name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    note TEXT NOT NULL DEFAULT '',
    kot_no INTEGER,
    voided INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_order_items_order ON order_items(order_id);

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL CHECK (amount > 0),
    mode TEXT NOT NULL,
    paid_to TEXT NOT NULL DEFAULT '',
    voided_at TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_expenses_date ON expenses(date);

  CREATE TABLE housekeeping_log (
    id INTEGER PRIMARY KEY,
    unit_id INTEGER NOT NULL REFERENCES units(id),
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    detail TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_audit_at ON audit_log(at);
  `,
  // 2: one catalogue for food and services, priced lines on charges, bill-to on counter bills.
  `
  ALTER TABLE menu_items ADD COLUMN tax_category TEXT NOT NULL DEFAULT 'FOOD' CHECK (tax_category IN ('FOOD', 'SERVICE'));
  ALTER TABLE order_items ADD COLUMN category TEXT NOT NULL DEFAULT 'FOOD' CHECK (category IN ('FOOD', 'SERVICE'));
  ALTER TABLE charges ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE charges ADD COLUMN unit_price INTEGER;
  ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
  ALTER TABLE orders ADD COLUMN customer_gstin TEXT NOT NULL DEFAULT '';
  INSERT INTO menu_items (name, category, price, is_veg, tax_category, sort, created_at, updated_at)
  SELECT name, category, price, 1, 'SERVICE', sort, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM (
    SELECT 'Laundry - shirt / top' AS name, 'Laundry' AS category, 4000 AS price, 1 AS sort
    UNION ALL SELECT 'Laundry - trouser / saree', 'Laundry', 6000, 2
    UNION ALL SELECT 'Laundry - per kg', 'Laundry', 12000, 3
    UNION ALL SELECT 'Ironing - per piece', 'Laundry', 2000, 4
    UNION ALL SELECT 'Extra bed (per night)', 'Room extras', 60000, 5
    UNION ALL SELECT 'Early check-in', 'Room extras', 50000, 6
    UNION ALL SELECT 'Late check-out', 'Room extras', 50000, 7
    UNION ALL SELECT 'Room decoration', 'Room extras', 150000, 8
    UNION ALL SELECT 'Airport / station pickup', 'Travel', 150000, 9
    UNION ALL SELECT 'Local sightseeing (half day)', 'Travel', 180000, 10
    UNION ALL SELECT 'Bonfire', 'Activities', 80000, 11
    UNION ALL SELECT 'Damage / breakage', 'Other', 0, 12
  )
  WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE tax_category = 'SERVICE');
  `,
  // 3: identity data sealed at rest (see services/vault.js). id_number keeps only a masked copy.
  `
  ALTER TABLE guests ADD COLUMN id_number_enc BLOB;
  ALTER TABLE files ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;
  `,
  // 4: both sides of the photo ID (phone capture takes front and back).
  `
  ALTER TABLE guests ADD COLUMN id_photo_back_file_id INTEGER REFERENCES files(id);
  `
];

// 'VVR1' — lets an import reject SQLite files that are not Rooms data files.
const APPLICATION_ID = 0x56565231;

module.exports = { MIGRATIONS, APPLICATION_ID, SCHEMA_VERSION: MIGRATIONS.length };
