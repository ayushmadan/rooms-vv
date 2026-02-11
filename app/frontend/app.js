const state = {
  rooms: [],
  selectedRoom: null,
  selectedRoomIds: [],
  customerClipboard: null,
  selectedBookingId: '',
  bookingsById: {},
  allBookings: [],
  opsPage: 1,
  opsPageSize: 10,
  activeFilter: 'ALL',
  adminUnlocked: false,
  defaults: {
    defaultSmallRoomRent: 1800,
    defaultBigRoomRent: 2200,
    defaultPartyHallRent: 5000,
    defaultDiningHallRent: 20000,
    mealAddonPerDay: 250,
    gstPercent: 10
  }
};

const el = {
  tabButtons: Array.from(document.querySelectorAll('[data-tab-target]')),
  tabPanels: Array.from(document.querySelectorAll('[data-tab-panel]')),
  fromDate: document.getElementById('fromDate'),
  toDate: document.getElementById('toDate'),
  roomsGrid: document.getElementById('roomsGrid'),
  roomBookingsList: document.getElementById('roomBookingsList'),
  quoteBox: document.getElementById('quoteBox'),
  mealPlanner: document.getElementById('mealPlanner'),
  bookingForm: document.getElementById('bookingForm'),
  copyCustomerBtn: document.getElementById('copyCustomerBtn'),
  pasteCustomerBtn: document.getElementById('pasteCustomerBtn'),
  roomIdField: document.getElementById('roomIdField'),
  selectedUnitText: document.getElementById('selectedUnitText'),
  nightlyRent: document.getElementById('nightlyRent'),
  paymentMode: document.getElementById('paymentMode'),
  advancePaid: document.getElementById('advancePaid'),
  bookingNotes: document.getElementById('bookingNotes'),
  bookingStatus: document.getElementById('bookingStatus'),
  roleSelect: document.getElementById('roleSelect'),
  adminPin: document.getElementById('adminPin'),
  adminState: document.getElementById('adminState'),
  idTypeOtherWrap: document.getElementById('idTypeOtherWrap'),
  idTypeOther: document.getElementById('idTypeOther'),
  manageBookingId: document.getElementById('manageBookingId'),
  moveRoomId: document.getElementById('moveRoomId'),
  moveRent: document.getElementById('moveRent'),
  moveCheckIn: document.getElementById('moveCheckIn'),
  moveCheckOut: document.getElementById('moveCheckOut'),
  paymentAmount: document.getElementById('paymentAmount'),
  paymentModeUpdate: document.getElementById('paymentModeUpdate'),
  paymentType: document.getElementById('paymentType'),
  paymentNote: document.getElementById('paymentNote'),
  manageStatus: document.getElementById('manageStatus'),
  billingBookingId: document.getElementById('billingBookingId'),
  extraAmount: document.getElementById('extraAmount'),
  extraOtherWrap: document.getElementById('extraOtherWrap'),
  extraOtherLabel: document.getElementById('extraOtherLabel'),
  billStatus: document.getElementById('billStatus'),
  defSmall: document.getElementById('defSmall'),
  defBig: document.getElementById('defBig'),
  defParty: document.getElementById('defParty'),
  defDining: document.getElementById('defDining'),
  defMeal: document.getElementById('defMeal'),
  defGst: document.getElementById('defGst'),
  configRoomId: document.getElementById('configRoomId'),
  configDate: document.getElementById('configDate'),
  configRent: document.getElementById('configRent'),
  configMealRate: document.getElementById('configMealRate'),
  configStatus: document.getElementById('configStatus'),
  ledgerFrom: document.getElementById('ledgerFrom'),
  ledgerTo: document.getElementById('ledgerTo'),
  ledgerSummary: document.getElementById('ledgerSummary'),
  ledgerRows: document.getElementById('ledgerRows'),
  ledgerStatus: document.getElementById('ledgerStatus'),
  backupFrom: document.getElementById('backupFrom'),
  backupTo: document.getElementById('backupTo'),
  backupStatus: document.getElementById('backupStatus'),
  backupFiles: document.getElementById('backupFiles'),
  uploadStatus: document.getElementById('uploadStatus'),
  bookingsTableBody: document.querySelector('#bookingsTable tbody'),
  adminConfigPanel: document.getElementById('adminConfigPanel'),
  ledgerPanel: document.getElementById('ledgerPanel'),
  customerEditPanel: document.getElementById('customerEditPanel'),
  editCustomerId: document.getElementById('editCustomerId'),
  editCustomerName: document.getElementById('editCustomerName'),
  editCustomerPhone: document.getElementById('editCustomerPhone'),
  customerEditStatus: document.getElementById('customerEditStatus')
  ,
  opFromDate: document.getElementById('opFromDate'),
  opToDate: document.getElementById('opToDate'),
  opRoomsGrid: document.getElementById('opRoomsGrid'),
  opBookingList: document.getElementById('opBookingList'),
  opsPrevBtn: document.getElementById('opsPrevBtn'),
  opsNextBtn: document.getElementById('opsNextBtn'),
  opsPageInfo: document.getElementById('opsPageInfo'),
  feedbackModal: document.getElementById('feedbackModal'),
  feedbackTitle: document.getElementById('feedbackTitle'),
  feedbackMessage: document.getElementById('feedbackMessage'),
  feedbackCloseBtn: document.getElementById('feedbackCloseBtn')
};

const api = {
  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    headers['x-role'] = options.roleOverride || el.roleSelect.value;
    const pin = options.adminPinOverride || el.adminPin.value.trim();
    if (pin) headers['x-admin-pin'] = pin;

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  },
  seedRooms: () => api.request('/api/rooms/seed-default', { method: 'POST' }),
  getDefaults: () => api.request('/api/config/defaults'),
  saveDefaults: (payload, pin) => api.request('/api/config/defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), adminPinOverride: pin, roleOverride: 'ADMIN' }),
  saveRate: (payload, pin) => api.request('/api/config/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), adminPinOverride: pin, roleOverride: 'ADMIN' }),
  saveMealRate: (payload, pin) => api.request('/api/config/meal-rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), adminPinOverride: pin, roleOverride: 'ADMIN' }),
  updateCustomer: (id, payload, pin) => api.request(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), adminPinOverride: pin, roleOverride: 'ADMIN' }),
  adminStatus: () => api.request('/api/auth/status'),
  availability: (from, to) => api.request(`/api/bookings/availability?from=${from}&to=${to}`),
  roomBookings: (roomId, from, to) => api.request(`/api/bookings/room-bookings?roomId=${roomId}&from=${from}&to=${to}`),
  quote: (payload) => api.request('/api/bookings/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createCustomer: (formData) => api.request('/api/customers', { method: 'POST', body: formData }),
  createBooking: (payload) => api.request('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listBookings: () => api.request('/api/bookings'),
  moveBooking: (id, payload) => api.request(`/api/bookings/${id}/reschedule`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  cancelBooking: (id) => api.request(`/api/bookings/${id}/cancel`, { method: 'PATCH' }),
  changeStatus: (id, action) => api.request(`/api/bookings/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }),
  addPayment: (id, payload) => api.request(`/api/bookings/${id}/payment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  generateBill: (bookingId, extras) => api.request(`/api/billing/generate/${bookingId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extras }) }),
  ledger: (from, to, pin) => api.request(`/api/ledger/report?from=${from}&to=${to}`, { adminPinOverride: pin, roleOverride: 'ADMIN' }),
  exportBackup: (payload) => api.request('/api/backups/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listBackupFiles: () => api.request('/api/backups/files'),
  uploadBackups: (files) => api.request('/api/backups/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) })
};

function showFeedback(title, message) {
  if (!el.feedbackModal) return;
  el.feedbackTitle.textContent = title;
  el.feedbackMessage.textContent = message;
  el.feedbackModal.classList.remove('hidden');
}

function hideFeedback() {
  if (!el.feedbackModal) return;
  el.feedbackModal.classList.add('hidden');
}

async function requireAdminPinForAction() {
  const pin = window.prompt('Enter Admin PIN to continue this action:');
  if (!pin) throw new Error('Admin PIN required');
  return pin.trim();
}

function displayBookingRef(ref) {
  if (!ref) return '-';
  if (ref.startsWith('VV-')) return ref;
  return `LEG-${String(ref).slice(-6).toUpperCase()}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtIst(value) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

function unitTitle(room) {
  if (!room) return '-';
  if (room.size === 'PARTY_HALL') return 'Party Hall';
  if (room.size === 'DINING_HALL') return 'Complete Dining Hall';
  return `Room ${room.code}`;
}

function defaultRent(room) {
  if (!room) return 0;
  if (room.size === 'BIG') return state.defaults.defaultBigRoomRent;
  if (room.size === 'SMALL') return state.defaults.defaultSmallRoomRent;
  if (room.size === 'PARTY_HALL') return state.defaults.defaultPartyHallRent;
  return state.defaults.defaultDiningHallRent;
}

function mealPlanFromForm() {
  const schedule = mealScheduleFromPlanner();
  const hasBreakfast = schedule.some((d) => d.breakfast);
  const hasLunch = schedule.some((d) => d.lunch);
  const hasDinner = schedule.some((d) => d.dinner);
  return { breakfast: hasBreakfast, lunch: hasLunch, dinner: hasDinner };
}

function mealLabel(mealPlan) {
  const labels = ['breakfast', 'lunch', 'dinner'].filter((k) => mealPlan?.[k]);
  return labels.length ? labels.join(', ') : '-';
}

function dateRangeDays(fromDate, toDate) {
  const days = [];
  if (!fromDate || !toDate || toDate <= fromDate) return days;
  const d = new Date(`${fromDate}T00:00:00+05:30`);
  const end = new Date(`${toDate}T00:00:00+05:30`);
  while (d < end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function plannerDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderMealPlanner() {
  if (!el.mealPlanner) return;
  const days = dateRangeDays(el.fromDate.value, el.toDate.value);
  el.mealPlanner.innerHTML = '';

  if (!days.length) {
    el.mealPlanner.innerHTML = '<div class=\"list-item\">Select valid check-in/check-out to plan meals.</div>';
    return;
  }

  days.forEach((day) => {
    const key = plannerDateKey(day);
    const row = document.createElement('div');
    row.className = 'meal-row';
    row.innerHTML = `<div>${key}</div>\n      <div class=\"meal-checks\">\n        <label><input type=\"checkbox\" data-meal-date=\"${key}\" data-meal-type=\"breakfast\" />Breakfast</label>\n        <label><input type=\"checkbox\" data-meal-date=\"${key}\" data-meal-type=\"lunch\" />Lunch</label>\n        <label><input type=\"checkbox\" data-meal-date=\"${key}\" data-meal-type=\"dinner\" />Dinner</label>\n      </div>`;
    el.mealPlanner.appendChild(row);
  });

  el.mealPlanner.querySelectorAll('input[type=\"checkbox\"]').forEach((cb) => cb.addEventListener('change', refreshQuote));
}

function mealScheduleFromPlanner() {
  if (!el.mealPlanner) return [];
  const map = {};
  el.mealPlanner.querySelectorAll('input[type=\"checkbox\"][data-meal-date]').forEach((cb) => {
    const date = cb.getAttribute('data-meal-date');
    const type = cb.getAttribute('data-meal-type');
    if (!map[date]) map[date] = { date, breakfast: false, lunch: false, dinner: false };
    map[date][type] = cb.checked;
  });
  return Object.values(map);
}

function selectedIdType() {
  const val = document.querySelector('input[name="idTypeRadio"]:checked')?.value || 'AADHAAR';
  return val === 'OTHER' ? (el.idTypeOther.value.trim() || 'OTHER') : val;
}

function selectedExtraLabel() {
  const val = document.querySelector('input[name="extraLabelRadio"]:checked')?.value || 'Food';
  return val === 'Other' ? (el.extraOtherLabel.value.trim() || 'Other') : val;
}

function setStatus(node, text, type = 'info') {
  node.textContent = text;
  if (type === 'error') node.style.color = '#a4372f';
  else if (type === 'success') node.style.color = '#0f7d6e';
  else node.style.color = '#214258';
}

function visibleRooms() {
  if (state.activeFilter === 'ALL') return state.rooms;
  if (state.activeFilter === '1' || state.activeFilter === '2') return state.rooms.filter((r) => String(r.floor) === state.activeFilter);
  return state.rooms.filter((r) => r.size === state.activeFilter);
}

function selectedRoomsFromState() {
  return state.rooms.filter((r) => state.selectedRoomIds.includes(r.roomId));
}

async function renderRoomBookings(roomId) {
  if (!roomId || !el.fromDate.value || !el.toDate.value) return;
  const rows = await api.roomBookings(roomId, el.fromDate.value, el.toDate.value);
  el.roomBookingsList.innerHTML = '';

  if (!rows.length) {
    el.roomBookingsList.innerHTML = '<div class="list-item">No bookings in selected range.</div>';
    return;
  }

  rows.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'booking-card';
    div.innerHTML = `<strong>${displayBookingRef(r.bookingId)}</strong><small>${r.customerName}</small><small>${r.checkInIst} to ${r.checkOutIst}</small><small>Status: ${r.status} | Payment: ${r.paymentStatus}</small>`;
    div.addEventListener('click', () => {
      fillSelectedBooking(r.bookingId);
    });
    el.roomBookingsList.appendChild(div);
  });
}

function renderRooms() {
  const rooms = visibleRooms();
  el.roomsGrid.innerHTML = '';

  rooms.forEach((room) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `room-tile ${room.available ? 'available' : 'booked'} ${room.needsCleaning ? 'needs-cleaning' : ''} ${state.selectedRoomIds.includes(room.roomId) ? 'selected' : ''}`;
    tile.innerHTML = `<h4>${unitTitle(room)}</h4>
      <p>${room.size.replace('_', ' ')} ${room.floor > 0 ? `· Floor ${room.floor}` : ''}</p>
      <p>Default: Rs ${defaultRent(room)}/night</p>
      <p>${room.available ? 'Available' : `Booked (${room.occupancyCount})`}</p>`;

    tile.addEventListener('click', async () => {
      state.selectedRoom = room;

      if (room.available) {
        if (state.selectedRoomIds.includes(room.roomId)) {
          state.selectedRoomIds = state.selectedRoomIds.filter((id) => id !== room.roomId);
        } else {
          state.selectedRoomIds.push(room.roomId);
        }
      }

      const selectedRooms = selectedRoomsFromState();
      const selectedTitles = selectedRooms.map((r) => unitTitle(r));
      el.selectedUnitText.value = selectedTitles.join(', ');
      el.roomIdField.value = state.selectedRoomIds.join(',');
      el.nightlyRent.value = selectedRooms.length === 1 ? defaultRent(selectedRooms[0]) : '';
      el.configRoomId.value = room.roomId;
      el.moveRoomId.value = room.roomId;
      renderRooms();
      await refreshQuote();
      await renderRoomBookings(room.roomId);
    });

    el.roomsGrid.appendChild(tile);
  });
}

function renderOperationsRoomTiles() {
  if (!el.opRoomsGrid) return;
  const rooms = state.rooms;
  el.opRoomsGrid.innerHTML = '';
  rooms.forEach((room) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `room-tile ${room.available ? 'available' : 'booked'} ${room.needsCleaning ? 'needs-cleaning' : ''} ${el.moveRoomId.value === room.roomId ? 'selected' : ''}`;
    btn.innerHTML = `<h4>${unitTitle(room)}</h4><p>${room.available ? 'Available' : 'Booked'}</p>`;
    btn.addEventListener('click', async () => {
      el.moveRoomId.value = room.roomId;
      renderOperationsRoomTiles();
      await loadOperationsBookings();
    });
    el.opRoomsGrid.appendChild(btn);
  });
}

async function loadOperationsBookings() {
  if (!el.opFromDate?.value || !el.opToDate?.value || !el.moveRoomId?.value) return;
  const rows = await api.roomBookings(el.moveRoomId.value, el.opFromDate.value, el.opToDate.value);
  el.opBookingList.innerHTML = '';
  if (!rows.length) {
    el.opBookingList.innerHTML = '<div class=\"list-item\">No bookings found for selection.</div>';
    return;
  }
  rows.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'booking-card';
    div.innerHTML = `<strong>${displayBookingRef(r.bookingId)}</strong><small>${r.customerName}</small><small>${r.checkInIst} to ${r.checkOutIst}</small><small>Status: ${r.status} | Paid: Rs ${r.totalPaid} / ${r.totalDue}</small>`;
    div.addEventListener('click', () => fillSelectedBooking(r.bookingId));
    el.opBookingList.appendChild(div);
  });
}

async function refreshQuote() {
  const selectedRooms = selectedRoomsFromState();
  if (!selectedRooms.length || !el.fromDate.value || !el.toDate.value) {
    el.quoteBox.innerHTML = '<div class=\"list-item\">Select a tile and date range for quote.</div>';
    return;
  }

  if (el.toDate.value <= el.fromDate.value) {
    el.quoteBox.innerHTML = '<div class=\"list-item\">Check-out date should be after check-in date.</div>';
    return;
  }

  try {
    let grandBase = 0;
    let grandMeals = 0;
    let grandTotal = 0;
    let nights = 0;

    for (const room of selectedRooms) {
      const override = Number(el.nightlyRent.value || 0) > 0 ? Number(el.nightlyRent.value) : defaultRent(room);
      const quote = await api.quote({
        roomId: room.roomId,
        checkInDate: el.fromDate.value,
        checkOutDate: el.toDate.value,
        mealPlan: mealPlanFromForm(),
        nightlyBaseOverride: override,
        mealSchedule: mealScheduleFromPlanner()
      });
      nights = quote.nights;
      grandBase += quote.baseTotal;
      grandMeals += quote.mealTotal;
      grandTotal += quote.total;
    }

    el.quoteBox.innerHTML = `
      <div class="quote-card">
        <div class="quote-line"><span>Units</span><strong>${selectedRooms.map((r) => unitTitle(r)).join(', ')}</strong></div>
        <div class="quote-line"><span>Nights</span><strong>${nights}</strong></div>
      </div>
      <div class="quote-card">
        <div class="quote-line"><span>Base Total</span><strong>Rs ${grandBase}</strong></div>
        <div class="quote-line"><span>Meals Total</span><strong>Rs ${grandMeals}</strong></div>
        <div class="quote-line"><span>Total (GST Inclusive)</span><strong>Rs ${grandTotal}</strong></div>
      </div>`;
  } catch (err) {
    el.quoteBox.innerHTML = `<div class=\"list-item\">${err.message}</div>`;
  }
}

async function searchAvailability() {
  if (!el.fromDate.value || !el.toDate.value) {
    setStatus(el.bookingStatus, 'Please select check-in/check-out dates.', 'error');
    return;
  }

  const data = await api.availability(el.fromDate.value, el.toDate.value);
  state.rooms = data.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  state.selectedRoomIds = state.selectedRoomIds.filter((id) => state.rooms.some((r) => r.roomId === id && r.available));
  const selectedRooms = selectedRoomsFromState();
  el.selectedUnitText.value = selectedRooms.map((r) => unitTitle(r)).join(', ');
  el.roomIdField.value = state.selectedRoomIds.join(',');
  renderMealPlanner();
  renderRooms();
  renderOperationsRoomTiles();
  await refreshQuote();
}

async function refreshAdminStatus() {
  state.adminUnlocked = false;
  el.adminState.textContent = 'PIN Required Per Admin Action';
  el.adminState.className = 'badge warn';
  el.adminConfigPanel.style.opacity = '1';
  el.ledgerPanel.style.opacity = '1';
  el.customerEditPanel.style.opacity = '1';
}

function fillDefaultsForm() {
  el.defSmall.value = state.defaults.defaultSmallRoomRent;
  el.defBig.value = state.defaults.defaultBigRoomRent;
  el.defParty.value = state.defaults.defaultPartyHallRent;
  el.defDining.value = state.defaults.defaultDiningHallRent;
  el.defMeal.value = state.defaults.mealAddonPerDay;
  el.defGst.value = state.defaults.gstPercent;
}

function fillSelectedBooking(bookingId) {
  state.selectedBookingId = bookingId;
  el.manageBookingId.value = bookingId;
  el.billingBookingId.value = bookingId;
}

async function loadBookings() {
  const rows = await api.listBookings();
  state.allBookings = rows;
  state.opsPage = 1;
  state.bookingsById = {};
  rows.forEach((b) => {
    const ref = b.bookingRef || b.bookingCode || String(b._id);
    state.bookingsById[ref] = b;
    state.bookingsById[String(b._id)] = b;
  });
  renderOperationsTablePage();
}

function renderOperationsTablePage() {
  const rows = state.allBookings || [];
  const totalPages = Math.max(1, Math.ceil(rows.length / state.opsPageSize));
  if (state.opsPage > totalPages) state.opsPage = totalPages;
  const start = (state.opsPage - 1) * state.opsPageSize;
  const pageRows = rows.slice(start, start + state.opsPageSize);
  el.bookingsTableBody.innerHTML = '';

  pageRows.forEach((b) => {
    const ref = b.bookingRef || b.bookingCode || String(b._id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${displayBookingRef(ref)}</td>
      <td>${b.customerId?.fullName || '-'}</td>
      <td>${unitTitle(b.roomId)}</td>
      <td>${fmtIst(b.checkInDate)}</td>
      <td>${fmtIst(b.checkOutDate)}</td>
      <td>${b.status}</td>
      <td>${b.paymentStatus} (${b.paymentMode || '-'})</td>
      <td>Rs ${b.pricingSnapshot?.estimatedTotal || 0}</td>
      <td>Rs ${b.totalPaid || 0}</td>
    `;
    tr.addEventListener('click', () => {
      fillSelectedBooking(ref);
      el.moveRoomId.value = b.roomId?._id || '';
      el.moveRent.value = b.pricingSnapshot?.nightlyBase || 0;
      el.moveCheckIn.value = new Date(b.checkInDate).toISOString().slice(0, 10);
      el.moveCheckOut.value = new Date(b.checkOutDate).toISOString().slice(0, 10);
      el.editCustomerId.value = b.customerId?._id || '';
      el.editCustomerName.value = b.customerId?.fullName || '';
      el.editCustomerPhone.value = b.customerId?.phone || '';
      renderOperationsRoomTiles();
    });
    el.bookingsTableBody.appendChild(tr);
  });

  if (el.opsPageInfo) el.opsPageInfo.textContent = `Page ${state.opsPage} of ${totalPages}`;
  if (el.opsPrevBtn) el.opsPrevBtn.disabled = state.opsPage <= 1;
  if (el.opsNextBtn) el.opsNextBtn.disabled = state.opsPage >= totalPages;
}

async function loadBackupFiles() {
  const data = await api.listBackupFiles();
  el.backupFiles.innerHTML = '';
  if (!data.files.length) {
    el.backupFiles.innerHTML = '<div class="list-item">No backup files found.</div>';
    return;
  }
  data.files.forEach((file) => {
    const label = document.createElement('label');
    label.className = 'list-item';
    label.innerHTML = `<input type="checkbox" value="${file}" /> ${file}`;
    el.backupFiles.appendChild(label);
  });
}

function wireToggles() {
  document.querySelectorAll('input[name="floorFilter"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.activeFilter = document.querySelector('input[name="floorFilter"]:checked')?.value || 'ALL';
      renderRooms();
    });
  });

  document.querySelectorAll('input[name="idTypeRadio"]').forEach((r) => {
    r.addEventListener('change', () => {
      const isOther = document.querySelector('input[name="idTypeRadio"]:checked')?.value === 'OTHER';
      el.idTypeOtherWrap.classList.toggle('hidden', !isOther);
    });
  });

  document.querySelectorAll('input[name="extraLabelRadio"]').forEach((r) => {
    r.addEventListener('change', () => {
      const isOther = document.querySelector('input[name="extraLabelRadio"]:checked')?.value === 'Other';
      el.extraOtherWrap.classList.toggle('hidden', !isOther);
    });
  });
}

function wireTabs() {
  if (!el.tabButtons.length) return;

  el.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab-target');
      el.tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
      el.tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.getAttribute('data-tab-panel') === target);
      });
      if (target === 'operations') loadOperationsBookings();
    });
  });
}

function collectCustomerDetailsFromForm() {
  return {
    fullName: el.bookingForm.fullName.value.trim(),
    phone: el.bookingForm.phone.value.trim(),
    email: el.bookingForm.email.value.trim(),
    address: el.bookingForm.address.value.trim(),
    idNumber: el.bookingForm.idNumber.value.trim(),
    idType: selectedIdType()
  };
}

function applyCustomerDetailsToForm(data) {
  el.bookingForm.fullName.value = data.fullName || '';
  el.bookingForm.phone.value = data.phone || '';
  el.bookingForm.email.value = data.email || '';
  el.bookingForm.address.value = data.address || '';
  el.bookingForm.idNumber.value = data.idNumber || '';

  const knownTypes = ['AADHAAR', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID'];
  const type = data.idType || 'AADHAAR';
  if (knownTypes.includes(type)) {
    const radio = document.querySelector(`input[name=\"idTypeRadio\"][value=\"${type}\"]`);
    if (radio) radio.checked = true;
    el.idTypeOtherWrap.classList.add('hidden');
    el.idTypeOther.value = '';
  } else {
    const otherRadio = document.querySelector('input[name=\"idTypeRadio\"][value=\"OTHER\"]');
    if (otherRadio) otherRadio.checked = true;
    el.idTypeOtherWrap.classList.remove('hidden');
    el.idTypeOther.value = type;
  }
}

document.getElementById('seedRoomsBtn').addEventListener('click', async () => {
  try {
    await api.seedRooms();
    setStatus(el.bookingStatus, 'Inventory seeded.', 'success');
    await searchAvailability();
  } catch (err) {
    setStatus(el.bookingStatus, err.message, 'error');
  }
});

document.getElementById('searchBtn').addEventListener('click', async () => {
  await searchAvailability().catch((e) => setStatus(el.bookingStatus, e.message, 'error'));
});

el.copyCustomerBtn.addEventListener('click', async () => {
  const payload = collectCustomerDetailsFromForm();
  state.customerClipboard = payload;
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
  } catch (_e) {
    // ignore clipboard permission issues and rely on in-memory copy
  }
  setStatus(el.bookingStatus, 'Customer details copied.', 'success');
});

el.pasteCustomerBtn.addEventListener('click', async () => {
  let payload = state.customerClipboard;
  if (!payload) {
    try {
      const text = await navigator.clipboard.readText();
      payload = JSON.parse(text);
    } catch (_e) {
      payload = null;
    }
  }

  if (!payload) {
    setStatus(el.bookingStatus, 'No copied customer details available.', 'error');
    return;
  }

  applyCustomerDetailsToForm(payload);
  setStatus(el.bookingStatus, 'Customer details pasted.', 'success');
});

el.roleSelect.addEventListener('change', refreshAdminStatus);
el.adminPin.addEventListener('input', refreshAdminStatus);

[el.fromDate, el.toDate, el.nightlyRent].forEach((n) => n.addEventListener('change', refreshQuote));

el.fromDate.addEventListener('change', () => {
  if (el.toDate.value && el.fromDate.value > el.toDate.value) {
    const d = new Date(`${el.fromDate.value}T00:00:00+05:30`);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    el.toDate.value = `${y}-${m}-${day}`;
  }
  el.opFromDate.value = el.fromDate.value;
  if (el.opToDate.value < el.opFromDate.value) el.opToDate.value = el.toDate.value;
  renderMealPlanner();
  refreshQuote();
});
el.toDate.addEventListener('change', () => {
  el.opToDate.value = el.toDate.value;
  renderMealPlanner();
  refreshQuote();
});

el.opFromDate?.addEventListener('change', loadOperationsBookings);
el.opToDate?.addEventListener('change', loadOperationsBookings);
el.moveRoomId?.addEventListener('change', () => {
  renderOperationsRoomTiles();
  loadOperationsBookings();
});
el.opsPrevBtn?.addEventListener('click', () => {
  if (state.opsPage > 1) state.opsPage -= 1;
  renderOperationsTablePage();
});
el.opsNextBtn?.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil((state.allBookings || []).length / state.opsPageSize));
  if (state.opsPage < totalPages) state.opsPage += 1;
  renderOperationsTablePage();
});
el.feedbackCloseBtn?.addEventListener('click', hideFeedback);
el.feedbackModal?.addEventListener('click', (e) => {
  if (e.target === el.feedbackModal) hideFeedback();
});

el.bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedRooms = selectedRoomsFromState();
  if (!selectedRooms.length) {
    setStatus(el.bookingStatus, 'Select one or more available rooms/halls first.', 'error');
    return;
  }

  try {
    const form = new FormData(el.bookingForm);
    form.set('idType', selectedIdType());

    const customer = await api.createCustomer(form);

    const createdIds = [];
    const failed = [];
    for (const room of selectedRooms) {
      try {
        const booking = await api.createBooking({
          roomId: room.roomId,
          customerId: customer._id,
          checkInDate: el.fromDate.value,
          checkOutDate: el.toDate.value,
          mealPlan: mealPlanFromForm(),
          mealSchedule: mealScheduleFromPlanner(),
          nightlyBaseOverride: Number(el.nightlyRent.value || 0) > 0 ? Number(el.nightlyRent.value) : defaultRent(room),
          paymentMode: el.paymentMode.value,
          advancePaid: Number(el.advancePaid.value || 0),
          notes: el.bookingNotes.value.trim()
        });
        createdIds.push(booking.bookingCode || booking.bookingRef || booking._id);
      } catch (inner) {
        failed.push(`${unitTitle(room)}: ${inner.message}`);
      }
    }

    if (createdIds[0]) fillSelectedBooking(createdIds[0]);
    const message = `Created ${createdIds.length} booking(s)` + (failed.length ? ` | Failed ${failed.length}: ${failed.join(' ; ')}` : '');
    setStatus(el.bookingStatus, message, failed.length ? 'error' : 'success');
    showFeedback(failed.length ? 'Booking Partially Completed' : 'Booking Successful', message);

    el.bookingForm.reset();
    el.advancePaid.value = '0';
    el.bookingNotes.value = '';
    el.nightlyRent.value = '';
    state.selectedRoomIds = [];
    el.selectedUnitText.value = '';
    el.roomIdField.value = '';
    renderMealPlanner();

    await searchAvailability();
    await loadBookings();
  } catch (err) {
    setStatus(el.bookingStatus, err.message, 'error');
    showFeedback('Booking Failed', err.message);
  }
});

document.getElementById('moveBookingBtn').addEventListener('click', async () => {
  const bookingId = el.manageBookingId.value.trim();
  if (!bookingId) return setStatus(el.manageStatus, 'Select booking to move.', 'error');

  try {
    await api.moveBooking(bookingId, {
      roomId: el.moveRoomId.value.trim(),
      checkInDate: el.moveCheckIn.value,
      checkOutDate: el.moveCheckOut.value,
      nightlyBaseOverride: Number(el.moveRent.value || 0),
      mealSchedule: mealScheduleFromPlanner(),
      mealPlan: mealPlanFromForm()
    });
    setStatus(el.manageStatus, 'Booking moved successfully.', 'success');
    await searchAvailability();
    await loadBookings();
  } catch (err) {
    setStatus(el.manageStatus, err.message, 'error');
  }
});

document.getElementById('cancelBookingBtn').addEventListener('click', async () => {
  const bookingId = el.manageBookingId.value.trim();
  if (!bookingId) return setStatus(el.manageStatus, 'Select booking to cancel.', 'error');

  try {
    await api.cancelBooking(bookingId);
    setStatus(el.manageStatus, 'Booking cancelled.', 'success');
    await searchAvailability();
    await loadBookings();
  } catch (err) {
    setStatus(el.manageStatus, err.message, 'error');
  }
});

document.getElementById('checkInBtn').addEventListener('click', () => updateBookingAction('CHECK_IN'));
document.getElementById('checkOutBtn').addEventListener('click', () => updateBookingAction('CHECK_OUT'));
document.getElementById('cleanedBtn').addEventListener('click', () => updateBookingAction('CLEANED'));

async function updateBookingAction(action) {
  const bookingId = el.manageBookingId.value.trim();
  if (!bookingId) return setStatus(el.manageStatus, 'Select booking first.', 'error');

  try {
    if (action === 'CHECK_IN') {
      const booking = state.bookingsById[bookingId];
      const customer = booking?.customerId || {};
      const details = [
        `Name: ${customer.fullName || '-'}`,
        `Phone: ${customer.phone || '-'}`,
        `ID: ${customer.idType || '-'} ${customer.idNumber || ''}`,
        `Address: ${customer.address || '-'}`,
        `Unit: ${unitTitle(booking?.roomId)}`,
        `Check-in: ${fmtIst(booking?.checkInDate)}`
      ].join('\n');
      const confirmed = window.confirm(`Confirm customer details before check-in:\n\n${details}`);
      if (!confirmed) return;
    }

    await api.changeStatus(bookingId, action);
    setStatus(el.manageStatus, `Booking marked: ${action}`, 'success');
    await loadBookings();
    await searchAvailability();
  } catch (err) {
    setStatus(el.manageStatus, err.message, 'error');
  }
}

document.getElementById('addPaymentBtn').addEventListener('click', async () => {
  const bookingId = el.manageBookingId.value.trim();
  if (!bookingId) return setStatus(el.manageStatus, 'Select booking first.', 'error');

  try {
    await api.addPayment(bookingId, {
      amount: Number(el.paymentAmount.value || 0),
      mode: el.paymentModeUpdate.value,
      type: el.paymentType.value,
      note: el.paymentNote.value.trim()
    });
    setStatus(el.manageStatus, 'Payment recorded.', 'success');
    await loadBookings();
  } catch (err) {
    setStatus(el.manageStatus, err.message, 'error');
  }
});

document.getElementById('markBillPaidBtn').addEventListener('click', async () => {
  const bookingId = el.manageBookingId.value.trim();
  if (!bookingId) return setStatus(el.manageStatus, 'Select booking first.', 'error');

  try {
    await api.addPayment(bookingId, { markBillPaid: true, amount: 0, mode: el.paymentModeUpdate.value, type: 'SETTLEMENT', note: 'Marked paid' });
    setStatus(el.manageStatus, 'Bill marked as paid.', 'success');
    await loadBookings();
  } catch (err) {
    setStatus(el.manageStatus, err.message, 'error');
  }
});

document.getElementById('saveCustomerBtn').addEventListener('click', async () => {
  const customerId = el.editCustomerId.value.trim();
  if (!customerId) return setStatus(el.customerEditStatus, 'Customer ID is required.', 'error');

  try {
    const pin = await requireAdminPinForAction();
    await api.updateCustomer(customerId, {
      fullName: el.editCustomerName.value.trim(),
      phone: el.editCustomerPhone.value.trim()
    }, pin);
    setStatus(el.customerEditStatus, 'Customer updated successfully.', 'success');
    await loadBookings();
  } catch (err) {
    setStatus(el.customerEditStatus, err.message, 'error');
  }
});

document.getElementById('generateBillBtn').addEventListener('click', async () => {
  const bookingId = el.billingBookingId.value.trim();
  if (!bookingId) return setStatus(el.billStatus, 'Enter booking ID.', 'error');

  const amount = Number(el.extraAmount.value || 0);
  const label = selectedExtraLabel();
  const extras = amount > 0 ? [{ label, amount, category: label.toLowerCase().includes('food') ? 'FOOD' : 'SERVICE' }] : [];

  try {
    const bill = await api.generateBill(bookingId, extras);
    setStatus(el.billStatus, `Bill generated. Total Rs ${bill.totalAmount}`, 'success');
  } catch (err) {
    setStatus(el.billStatus, err.message, 'error');
  }
});

document.getElementById('openBillBtn').addEventListener('click', () => {
  const id = el.billingBookingId.value.trim();
  if (!id) return setStatus(el.billStatus, 'Enter booking ID.', 'error');
  const w = window.open(`/api/billing/pdf/${id}`, '_blank');
  if (w) setTimeout(() => w.print(), 800);
});

document.getElementById('declarationBtn').addEventListener('click', () => {
  const id = el.billingBookingId.value.trim();
  if (!id) return setStatus(el.billStatus, 'Enter booking ID.', 'error');
  const w = window.open(`/api/billing/declaration/${id}`, '_blank');
  if (w) setTimeout(() => w.print(), 800);
});

document.getElementById('saveDefaultsBtn').addEventListener('click', async () => {
  try {
    const pin = await requireAdminPinForAction();
    const data = await api.saveDefaults({
      defaultSmallRoomRent: Number(el.defSmall.value || 0),
      defaultBigRoomRent: Number(el.defBig.value || 0),
      defaultPartyHallRent: Number(el.defParty.value || 0),
      defaultDiningHallRent: Number(el.defDining.value || 0),
      mealAddonPerDay: Number(el.defMeal.value || 0),
      gstPercent: Number(el.defGst.value || 0)
    }, pin);

    state.defaults = {
      defaultSmallRoomRent: data.defaultSmallRoomRent,
      defaultBigRoomRent: data.defaultBigRoomRent,
      defaultPartyHallRent: data.defaultPartyHallRent,
      defaultDiningHallRent: data.defaultDiningHallRent,
      mealAddonPerDay: data.mealAddonPerDay,
      gstPercent: data.gstPercent
    };

    setStatus(el.configStatus, 'Default pricing/GST saved.', 'success');
    await refreshQuote();
    renderRooms();
  } catch (err) {
    setStatus(el.configStatus, err.message, 'error');
  }
});

document.getElementById('saveRateBtn').addEventListener('click', async () => {
  try {
    const pin = await requireAdminPinForAction();
    if (el.configRoomId.value.trim() && Number(el.configRent.value || 0) > 0) {
      await api.saveRate({ roomId: el.configRoomId.value.trim(), date: el.configDate.value, rent: Number(el.configRent.value) }, pin);
    }
    if (Number(el.configMealRate.value || 0) > 0) {
      await api.saveMealRate({ date: el.configDate.value, mealAddonPerDay: Number(el.configMealRate.value) }, pin);
    }

    setStatus(el.configStatus, 'Date overrides saved.', 'success');
    await refreshQuote();
  } catch (err) {
    setStatus(el.configStatus, err.message, 'error');
  }
});

document.getElementById('loadLedgerBtn').addEventListener('click', async () => {
  try {
    const pin = await requireAdminPinForAction();
    const report = await api.ledger(el.ledgerFrom.value, el.ledgerTo.value, pin);
    el.ledgerSummary.textContent = `Bookings: ${report.summary.totalBookings}\nBills: ${report.summary.totalBills}\nDue: Rs ${report.summary.totalDue}\nPaid: Rs ${report.summary.totalPaid}\nOutstanding: Rs ${report.summary.outstanding}\nAdvance: Rs ${report.summary.totalAdvance}`;

    el.ledgerRows.innerHTML = '';
    report.rows.slice(0, 100).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.textContent = `${r.bookingId} | ${r.customer} | ${r.unit} | Due ${r.amountDue} | Paid ${r.paid} | ${r.paymentStatus}`;
      el.ledgerRows.appendChild(div);
    });

    setStatus(el.ledgerStatus, 'Ledger loaded.', 'success');
  } catch (err) {
    setStatus(el.ledgerStatus, err.message, 'error');
  }
});

document.getElementById('exportBackupBtn').addEventListener('click', async () => {
  try {
    const result = await api.exportBackup({ fromDate: el.backupFrom.value, toDate: el.backupTo.value });
    setStatus(el.backupStatus, `Backup created: ${result.fileName} (${result.rows} rows)`, 'success');
    window.open(`/api/backups/download/${encodeURIComponent(result.fileName)}`, '_blank');
    await loadBackupFiles();
  } catch (err) {
    setStatus(el.backupStatus, err.message, 'error');
  }
});

document.getElementById('uploadSelectedBtn').addEventListener('click', async () => {
  const files = Array.from(el.backupFiles.querySelectorAll('input[type="checkbox"]:checked')).map((node) => node.value);
  if (!files.length) return setStatus(el.uploadStatus, 'Select files to upload.', 'error');

  try {
    const result = await api.uploadBackups(files);
    const successCount = result.results.filter((r) => r.uploaded).length;
    setStatus(el.uploadStatus, `Uploaded ${successCount}/${result.results.length} files.`, 'success');
  } catch (err) {
    setStatus(el.uploadStatus, err.message, 'error');
  }
});

async function bootstrap() {
  el.fromDate.value = todayIso();
  el.toDate.value = plusDaysIso(1);
  el.opFromDate.value = todayIso();
  el.opToDate.value = plusDaysIso(1);
  el.moveCheckIn.value = todayIso();
  el.moveCheckOut.value = plusDaysIso(1);
  el.configDate.value = todayIso();
  el.ledgerFrom.value = todayIso();
  el.ledgerTo.value = todayIso();
  el.backupFrom.value = todayIso();
  el.backupTo.value = todayIso();

  wireToggles();
  wireTabs();

  state.defaults = await api.getDefaults().catch(() => state.defaults);
  fillDefaultsForm();

  await refreshAdminStatus();
  await searchAvailability().catch(() => setStatus(el.bookingStatus, 'Inventory not seeded yet.', 'info'));
  await loadBookings().catch(() => {});
  await loadOperationsBookings().catch(() => {});
  await loadBackupFiles().catch(() => {});

  setStatus(el.bookingStatus, `Defaults loaded. GST inclusive at ${state.defaults.gstPercent}% by default.`);
}

bootstrap();
