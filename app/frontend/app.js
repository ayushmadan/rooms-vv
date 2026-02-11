const state = {
  rooms: [],
  selectedRoom: null,
  selectedRoomIds: [],
  customerClipboard: null,
  selectedBookingId: '',
  selectedBillingBooking: null,
  extraItems: [],
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
  searchCustomerPhone: document.getElementById('searchCustomerPhone'),
  searchCustomerBtn: document.getElementById('searchCustomerBtn'),
  customerSearchStatus: document.getElementById('customerSearchStatus'),
  roomIdField: document.getElementById('roomIdField'),
  selectedUnitText: document.getElementById('selectedUnitText'),
  nightlyRent: document.getElementById('nightlyRent'),
  paymentMode: document.getElementById('paymentMode'),
  advancePaid: document.getElementById('advancePaid'),
  bookingNotes: document.getElementById('bookingNotes'),
  roomDiscountType: document.getElementById('roomDiscountType'),
  roomDiscountValue: document.getElementById('roomDiscountValue'),
  mealDiscountType: document.getElementById('mealDiscountType'),
  mealDiscountValue: document.getElementById('mealDiscountValue'),
  bookingStatus: document.getElementById('bookingStatus'),
  checkUpdateBtn: document.getElementById('checkUpdateBtn'),
  runUpdateBtn: document.getElementById('runUpdateBtn'),
  versionInfo: document.getElementById('versionInfo'),
  healthIndicator: document.getElementById('healthIndicator'),
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
  paymentStatus: document.getElementById('paymentStatus'),
  manageStatus: document.getElementById('manageStatus'),
  billingFromDate: document.getElementById('billingFromDate'),
  billingToDate: document.getElementById('billingToDate'),
  billingRoomsGrid: document.getElementById('billingRoomsGrid'),
  selectedPaymentBookingId: document.getElementById('selectedPaymentBookingId'),
  selectedPaymentCustomer: document.getElementById('selectedPaymentCustomer'),
  selectedPaymentUnit: document.getElementById('selectedPaymentUnit'),
  selectedPaymentDue: document.getElementById('selectedPaymentDue'),
  selectedPaymentPaid: document.getElementById('selectedPaymentPaid'),
  selectedPaymentOutstanding: document.getElementById('selectedPaymentOutstanding'),
  extraAmount: document.getElementById('extraAmount'),
  extraOtherWrap: document.getElementById('extraOtherWrap'),
  extraOtherLabel: document.getElementById('extraOtherLabel'),
  addExtraItemBtn: document.getElementById('addExtraItemBtn'),
  extraItemsListWrap: document.getElementById('extraItemsListWrap'),
  extraItemsList: document.getElementById('extraItemsList'),
  billStatus: document.getElementById('billStatus'),
  defSmall: document.getElementById('defSmall'),
  defBig: document.getElementById('defBig'),
  defParty: document.getElementById('defParty'),
  defDining: document.getElementById('defDining'),
  defBreakfast: document.getElementById('defBreakfast'),
  defLunch: document.getElementById('defLunch'),
  defDinner: document.getElementById('defDinner'),
  defGst: document.getElementById('defGst'),
  configRoomId: document.getElementById('configRoomId'),
  configDate: document.getElementById('configDate'),
  configRent: document.getElementById('configRent'),
  configBreakfast: document.getElementById('configBreakfast'),
  configLunch: document.getElementById('configLunch'),
  configDinner: document.getElementById('configDinner'),
  configStatus: document.getElementById('configStatus'),
  ledgerFrom: document.getElementById('ledgerFrom'),
  ledgerTo: document.getElementById('ledgerTo'),
  ledgerSummaryCards: document.getElementById('ledgerSummaryCards'),
  summaryBookings: document.getElementById('summaryBookings'),
  summaryDue: document.getElementById('summaryDue'),
  summaryPaid: document.getElementById('summaryPaid'),
  summaryOutstanding: document.getElementById('summaryOutstanding'),
  ledgerTableContainer: document.getElementById('ledgerTableContainer'),
  ledgerTableBody: document.getElementById('ledgerTableBody'),
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
  selectedRoomIdForView: document.getElementById('selectedRoomIdForView'),
  opBookingList: document.getElementById('opBookingList'),
  opsPrevBtn: document.getElementById('opsPrevBtn'),
  opsNextBtn: document.getElementById('opsNextBtn'),
  opsPageInfo: document.getElementById('opsPageInfo'),
  feedbackModal: document.getElementById('feedbackModal'),
  feedbackTitle: document.getElementById('feedbackTitle'),
  feedbackMessage: document.getElementById('feedbackMessage'),
  feedbackCloseBtn: document.getElementById('feedbackCloseBtn'),
  pinModal: document.getElementById('pinModal'),
  pinModalInput: document.getElementById('pinModalInput'),
  pinModalError: document.getElementById('pinModalError'),
  pinModalCancel: document.getElementById('pinModalCancel'),
  pinModalConfirm: document.getElementById('pinModalConfirm'),
  checkinModal: document.getElementById('checkinModal'),
  checkinUnit: document.getElementById('checkinUnit'),
  checkinDateTime: document.getElementById('checkinDateTime'),
  checkinBookingId: document.getElementById('checkinBookingId'),
  checkinName: document.getElementById('checkinName'),
  checkinPhone: document.getElementById('checkinPhone'),
  checkinIdType: document.getElementById('checkinIdType'),
  checkinIdTypeOtherWrap: document.getElementById('checkinIdTypeOtherWrap'),
  checkinIdTypeOther: document.getElementById('checkinIdTypeOther'),
  checkinIdNumber: document.getElementById('checkinIdNumber'),
  checkinAddress: document.getElementById('checkinAddress'),
  checkinModalError: document.getElementById('checkinModalError'),
  checkinModalCancel: document.getElementById('checkinModalCancel'),
  checkinModalConfirm: document.getElementById('checkinModalConfirm'),
  selectedBookingPanel: document.getElementById('selectedBookingPanel'),
  selectedBookingRef: document.getElementById('selectedBookingRef'),
  selectedCustomerName: document.getElementById('selectedCustomerName'),
  selectedCurrentUnit: document.getElementById('selectedCurrentUnit'),
  selectedCheckIn: document.getElementById('selectedCheckIn'),
  selectedCheckOut: document.getElementById('selectedCheckOut'),
  selectedStatus: document.getElementById('selectedStatus'),
  selectedPaymentInfo: document.getElementById('selectedPaymentInfo')
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
  systemVersion: () => api.request('/api/system/version'),
  checkUpdate: () => api.request('/api/system/update/check'),
  runUpdate: (pin) => api.request('/api/system/update/run', { method: 'POST', adminPinOverride: pin, roleOverride: 'ADMIN' }),
  ensureMongo: (pin) => api.request('/api/system/mongo/ensure', { method: 'POST', adminPinOverride: pin, roleOverride: 'ADMIN' }),
  availability: (from, to) => api.request(`/api/bookings/availability?from=${from}&to=${to}`),
  roomBookings: (roomId, from, to) => api.request(`/api/bookings/room-bookings?roomId=${roomId}&from=${from}&to=${to}`),
  quote: (payload) => api.request('/api/bookings/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createCustomer: (formData) => api.request('/api/customers', { method: 'POST', body: formData }),
  searchCustomer: (phone) => api.request(`/api/customers/search?phone=${encodeURIComponent(phone)}`),
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

function requireAdminPinForAction() {
  return new Promise((resolve, reject) => {
    // Reset modal state
    el.pinModalInput.value = '';
    el.pinModalError.style.display = 'none';
    el.pinModalError.textContent = '';

    // Show modal
    el.pinModal.classList.remove('hidden');
    el.pinModalInput.focus();

    // Handle confirmation
    const handleConfirm = () => {
      const pin = el.pinModalInput.value.trim();
      if (!pin) {
        el.pinModalError.textContent = 'PIN cannot be empty';
        el.pinModalError.style.display = 'block';
        return;
      }
      cleanup();
      resolve(pin);
    };

    // Handle cancellation
    const handleCancel = () => {
      cleanup();
      reject(new Error('Admin PIN entry cancelled'));
    };

    // Cleanup function
    const cleanup = () => {
      el.pinModal.classList.add('hidden');
      el.pinModalInput.value = '';
      el.pinModalConfirm.removeEventListener('click', handleConfirm);
      el.pinModalCancel.removeEventListener('click', handleCancel);
      el.pinModalInput.removeEventListener('keypress', handleEnterKey);
      el.pinModal.removeEventListener('click', handleOutsideClick);
    };

    // Handle Enter key
    const handleEnterKey = (e) => {
      if (e.key === 'Enter') handleConfirm();
    };

    // Handle outside click
    const handleOutsideClick = (e) => {
      if (e.target === el.pinModal) handleCancel();
    };

    // Attach event listeners
    el.pinModalConfirm.addEventListener('click', handleConfirm);
    el.pinModalCancel.addEventListener('click', handleCancel);
    el.pinModalInput.addEventListener('keypress', handleEnterKey);
    el.pinModal.addEventListener('click', handleOutsideClick);
  });
}

function showCheckinModal(booking, customer) {
  return new Promise((resolve, reject) => {
    // Populate read-only booking info
    el.checkinUnit.textContent = unitTitle(booking?.roomId);
    el.checkinDateTime.textContent = fmtIst(booking?.checkInDate);
    el.checkinBookingId.textContent = displayBookingRef(booking?.bookingRef || booking?.bookingCode || booking?._id);

    // Populate editable customer fields
    el.checkinName.value = customer?.fullName || '';
    el.checkinPhone.value = customer?.phone || '';
    el.checkinIdType.value = customer?.idType || 'AADHAAR';
    el.checkinIdNumber.value = customer?.idNumber || '';
    el.checkinAddress.value = customer?.address || '';

    // Handle "Other" ID type field
    if (customer?.idType === 'OTHER') {
      el.checkinIdTypeOtherWrap.classList.remove('hidden');
      el.checkinIdTypeOther.value = customer?.idNumber || '';
    } else {
      el.checkinIdTypeOtherWrap.classList.add('hidden');
      el.checkinIdTypeOther.value = '';
    }

    // Add change listener for ID Type dropdown
    const handleIdTypeChange = () => {
      if (el.checkinIdType.value === 'OTHER') {
        el.checkinIdTypeOtherWrap.classList.remove('hidden');
      } else {
        el.checkinIdTypeOtherWrap.classList.add('hidden');
      }
    };
    el.checkinIdType.removeEventListener('change', handleIdTypeChange);
    el.checkinIdType.addEventListener('change', handleIdTypeChange);

    // Reset error state
    el.checkinModalError.style.display = 'none';
    el.checkinModalError.textContent = '';

    // Show modal
    el.checkinModal.classList.remove('hidden');
    el.checkinName.focus();

    // Handle confirmation
    const handleConfirm = async () => {
      const name = el.checkinName.value.trim();
      const phone = el.checkinPhone.value.trim();
      const address = el.checkinAddress.value.trim();
      const idType = el.checkinIdType.value;
      const idNumber = idType === 'OTHER' ? el.checkinIdTypeOther.value.trim() : el.checkinIdNumber.value.trim();

      if (!name || !phone) {
        el.checkinModalError.textContent = 'Name and phone are required';
        el.checkinModalError.style.display = 'block';
        return;
      }

      cleanup();

      // Return updated customer data
      resolve({
        customerId: customer?._id,
        fullName: name,
        phone: phone,
        address: address,
        idType: idType,
        idNumber: idNumber
      });
    };

    // Handle cancellation
    const handleCancel = () => {
      cleanup();
      reject(new Error('Check-in cancelled'));
    };

    // Cleanup function
    const cleanup = () => {
      el.checkinModal.classList.add('hidden');
      el.checkinModalConfirm.removeEventListener('click', handleConfirm);
      el.checkinModalCancel.removeEventListener('click', handleCancel);
      el.checkinModal.removeEventListener('click', handleOutsideClick);
    };

    // Handle outside click
    const handleOutsideClick = (e) => {
      if (e.target === el.checkinModal) handleCancel();
    };

    // Attach event listeners
    el.checkinModalConfirm.addEventListener('click', handleConfirm);
    el.checkinModalCancel.addEventListener('click', handleCancel);
    el.checkinModal.addEventListener('click', handleOutsideClick);
  });
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

function addExtraItem() {
  const amount = Number(el.extraAmount.value || 0);
  if (amount <= 0) {
    setStatus(el.billStatus, 'Please enter a valid amount for the extra item.', 'error');
    return;
  }

  const label = selectedExtraLabel();
  const category = label.toLowerCase().includes('food') ? 'FOOD' : 'SERVICE';

  state.extraItems.push({ label, amount, category });
  renderExtraItemsList();

  // Clear inputs
  el.extraAmount.value = '0';
  setStatus(el.billStatus, `Added: ${label} - Rs ${amount}`, 'success');
}

function removeExtraItem(index) {
  state.extraItems.splice(index, 1);
  renderExtraItemsList();
  setStatus(el.billStatus, 'Item removed from list.', 'success');
}

function renderExtraItemsList() {
  if (!el.extraItemsList || !el.extraItemsListWrap) return;

  if (state.extraItems.length === 0) {
    el.extraItemsListWrap.style.display = 'none';
    return;
  }

  el.extraItemsListWrap.style.display = 'block';
  el.extraItemsList.innerHTML = '';

  state.extraItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #f3f4f6; border-radius: 4px;';
    div.innerHTML = `
      <span><strong>${item.label}:</strong> Rs ${item.amount.toLocaleString()}</span>
      <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" data-index="${index}">Remove</button>
    `;

    const removeBtn = div.querySelector('button');
    removeBtn.addEventListener('click', () => removeExtraItem(index));

    el.extraItemsList.appendChild(div);
  });
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
  // Show helpful message if dates aren't selected
  if (!el.fromDate.value || !el.toDate.value) {
    el.roomBookingsList.innerHTML = '<div class="list-item" style="color: var(--muted); font-style: italic;">Please select check-in and check-out dates to view bookings for this room.</div>';
    return;
  }

  if (!roomId) return;

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
    div.addEventListener('click', async () => {
      fillSelectedBooking(r.bookingId);

      // Auto-fill customer details from the booking
      const booking = state.bookingsById[r.bookingId];
      if (booking && booking.customerId) {
        const customer = booking.customerId;
        // Auto-fill customer form fields
        if (el.fullName) el.fullName.value = customer.fullName || '';
        if (el.phone) el.phone.value = customer.phone || '';
        if (el.email) el.email.value = customer.email || '';
        if (el.address) el.address.value = customer.address || '';

        // Handle ID type
        if (customer.idType) {
          const idTypeRadios = document.querySelectorAll('input[name="idType"]');
          idTypeRadios.forEach(radio => {
            radio.checked = radio.value === customer.idType;
          });

          // Show "Other" field if needed
          if (customer.idType === 'OTHER' && el.idTypeOther) {
            el.idTypeOtherWrap.classList.remove('hidden');
            el.idTypeOther.value = customer.idNumber || '';
          }
        }

        setStatus(el.bookingStatus, 'Customer details auto-filled from selected booking', 'success');
      }
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
    const checkedInClass = room.checkedInCount > 0 ? 'checked-in' : '';
    const needsCleaningClass = room.needsCleaning ? 'needs-cleaning' : '';
    const availabilityClass = room.available ? 'available' : 'booked';
    tile.className = `room-tile ${availabilityClass} ${checkedInClass} ${needsCleaningClass} ${state.selectedRoomIds.includes(room.roomId) ? 'selected' : ''}`.trim();
    tile.innerHTML = `<h4>${unitTitle(room)}</h4>
      <p>${room.size.replace('_', ' ')} ${room.floor > 0 ? `· Floor ${room.floor}` : ''}</p>
      <p style="font-weight: 600; color: var(--brand);">Rs ${defaultRent(room)}/night</p>
      <p>${room.available ? 'Available' : `Booked (${room.occupancyCount})`}${room.needsCleaning ? ' (Needs Cleaning)' : ''}</p>`;

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
    const checkedInClass = room.checkedInCount > 0 ? 'checked-in' : '';
    const needsCleaningClass = room.needsCleaning ? 'needs-cleaning' : '';
    const availabilityClass = room.available ? 'available' : 'booked';
    btn.className = `room-tile ${availabilityClass} ${checkedInClass} ${needsCleaningClass} ${el.selectedRoomIdForView.value === room.roomId ? 'selected' : ''}`.trim();

    const statusText = room.available ? 'Available' : `${room.occupancyCount || 0} Booking${room.occupancyCount !== 1 ? 's' : ''}`;
    const cleaningBadge = room.needsCleaning ? '<span class="badge warn" style="font-size: 0.7rem; margin-top: 4px;">Needs Cleaning</span>' : '';

    btn.innerHTML = `<h4>${unitTitle(room)}</h4><p>${statusText}</p>${cleaningBadge}`;
    btn.addEventListener('click', async () => {
      el.selectedRoomIdForView.value = room.roomId;
      renderOperationsRoomTiles();
      await loadOperationsBookings();
    });
    el.opRoomsGrid.appendChild(btn);
  });
}

async function loadOperationsBookings() {
  // Show helpful message if dates aren't selected
  if (!el.opFromDate?.value || !el.opToDate?.value) {
    el.opBookingList.innerHTML = '<div class="list-item" style="color: var(--muted); font-style: italic;">Please select From Date and To Date above to view bookings.</div>';
    return;
  }

  // Show helpful message if no room is selected
  if (!el.selectedRoomIdForView?.value) {
    el.opBookingList.innerHTML = '<div class="list-item" style="color: var(--muted); font-style: italic;">Click on a room tile above to view its bookings.</div>';
    return;
  }

  const rows = await api.roomBookings(el.selectedRoomIdForView.value, el.opFromDate.value, el.opToDate.value);
  el.opBookingList.innerHTML = '';

  if (!rows.length) {
    el.opBookingList.innerHTML = '<div class="list-item">No bookings found for this room in the selected date range.</div>';
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

async function renderBillingRoomTiles() {
  if (!el.billingRoomsGrid || !el.billingFromDate?.value || !el.billingToDate?.value) return;

  try {
    const availability = await api.availability(el.billingFromDate.value, el.billingToDate.value);
    const rooms = availability.rooms || [];

    el.billingRoomsGrid.innerHTML = '';

    for (const room of rooms) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const checkedInClass = room.checkedInCount > 0 ? 'checked-in' : '';
      const needsCleaningClass = room.needsCleaning ? 'needs-cleaning' : '';
      const availabilityClass = room.available ? 'available' : 'booked';
      btn.className = `room-tile ${availabilityClass} ${checkedInClass} ${needsCleaningClass}`.trim();

      const statusText = room.available ? 'Available' : `${room.occupancyCount || 0} Booking${room.occupancyCount !== 1 ? 's' : ''}`;
      const cleaningBadge = room.needsCleaning ? '<span class="badge warn" style="font-size: 0.7rem; margin-top: 4px;">Needs Cleaning</span>' : '';

      btn.innerHTML = `<h4>${unitTitle(room)}</h4><p>${statusText}</p>${cleaningBadge}`;

      btn.addEventListener('click', async () => {
        // Load and show bookings for this room
        const rows = await api.roomBookings(room.roomId, el.billingFromDate.value, el.billingToDate.value);

        if (!rows.length) {
          setStatus(el.billStatus, `No bookings found for ${unitTitle(room)} in the selected date range.`, 'error');
          return;
        }

        // If only one booking, auto-select it
        if (rows.length === 1) {
          selectBillingBooking(rows[0]);
        } else {
          // Show a modal or list to let user choose which booking
          // For now, select the first active booking
          const activeBooking = rows.find(r => ['BOOKED', 'CHECKED_IN', 'CHECKED_OUT'].includes(r.status)) || rows[0];
          selectBillingBooking(activeBooking);
        }
      });

      el.billingRoomsGrid.appendChild(btn);
    }
  } catch (err) {
    setStatus(el.billStatus, `Failed to load rooms: ${err.message}`, 'error');
  }
}

function selectBillingBooking(booking) {
  if (!booking) return;

  state.selectedBillingBooking = booking;

  // Show selected booking info card
  el.selectedPaymentInfo.style.display = 'block';
  el.selectedPaymentBookingId.textContent = displayBookingRef(booking.bookingId);
  el.selectedPaymentCustomer.textContent = booking.customerName || '-';
  el.selectedPaymentUnit.textContent = booking.roomCode || '-';
  el.selectedPaymentDue.textContent = `Rs ${(booking.totalDue || 0).toLocaleString()}`;
  el.selectedPaymentPaid.textContent = `Rs ${(booking.totalPaid || 0).toLocaleString()}`;

  const outstanding = Math.max(0, (booking.totalDue || 0) - (booking.totalPaid || 0));
  el.selectedPaymentOutstanding.textContent = `Rs ${outstanding.toLocaleString()}`;

  setStatus(el.paymentStatus, `Booking selected: ${displayBookingRef(booking.bookingId)}`, 'success');
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
    let grandDiscount = 0;
    let grandBaseBeforeDiscount = 0;
    let grandMealBeforeDiscount = 0;
    let nights = 0;

    for (const room of selectedRooms) {
      const override = Number(el.nightlyRent.value || 0) > 0 ? Number(el.nightlyRent.value) : defaultRent(room);
      const quote = await api.quote({
        roomId: room.roomId,
        checkInDate: el.fromDate.value,
        checkOutDate: el.toDate.value,
        mealPlan: mealPlanFromForm(),
        nightlyBaseOverride: override,
        mealSchedule: mealScheduleFromPlanner(),
        discounts: {
          roomDiscountType: el.roomDiscountType.value,
          roomDiscountValue: Number(el.roomDiscountValue.value || 0),
          mealDiscountType: el.mealDiscountType.value,
          mealDiscountValue: Number(el.mealDiscountValue.value || 0)
        }
      });
      nights = quote.nights;
      grandBase += quote.baseTotal;
      grandMeals += quote.mealTotal;
      grandTotal += quote.total;
      grandDiscount += (quote.totalDiscount || 0);
      grandBaseBeforeDiscount += (quote.baseBeforeDiscount || quote.baseTotal);
      grandMealBeforeDiscount += (quote.mealBeforeDiscount || quote.mealTotal);
    }

    const hasDiscount = grandDiscount > 0;

    el.quoteBox.innerHTML = `
      <div class="quote-card">
        <div class="quote-line"><span>Units</span><strong>${selectedRooms.map((r) => unitTitle(r)).join(', ')}</strong></div>
        <div class="quote-line"><span>Nights</span><strong>${nights}</strong></div>
      </div>
      <div class="quote-card">
        ${hasDiscount ? `<div class="quote-line"><span>Base (Before Discount)</span><strong>Rs ${grandBaseBeforeDiscount}</strong></div>` : ''}
        <div class="quote-line"><span>Base Total</span><strong>Rs ${grandBase}</strong></div>
        ${hasDiscount ? `<div class="quote-line"><span>Meals (Before Discount)</span><strong>Rs ${grandMealBeforeDiscount}</strong></div>` : ''}
        <div class="quote-line"><span>Meals Total</span><strong>Rs ${grandMeals}</strong></div>
        ${hasDiscount ? `<div class="quote-line" style="color: #d9534f;"><span>Total Discount</span><strong>- Rs ${grandDiscount}</strong></div>` : ''}
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
  el.adminState.textContent = 'Admin PIN Required';
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
  el.defBreakfast.value = state.defaults.breakfastRate || 100;
  el.defLunch.value = state.defaults.lunchRate || 150;
  el.defDinner.value = state.defaults.dinnerRate || 200;
  el.defGst.value = state.defaults.gstPercent;
}

function populateRoomDropdown() {
  const rooms = visibleRooms();
  el.moveRoomId.innerHTML = '<option value="">Select Unit</option>';

  rooms.forEach((room) => {
    const option = document.createElement('option');
    option.value = room.roomId;
    option.textContent = unitTitle(room);
    el.moveRoomId.appendChild(option);
  });
}

function fillSelectedBooking(bookingId) {
  state.selectedBookingId = bookingId;
  el.manageBookingId.value = bookingId;
  el.billingBookingId.value = bookingId;

  // Get the booking from state
  const booking = state.bookingsById[bookingId];
  if (!booking) {
    el.selectedBookingPanel.classList.add('hidden');
    return;
  }

  // Show and populate the booking detail panel
  el.selectedBookingPanel.classList.remove('hidden');
  el.selectedBookingRef.textContent = displayBookingRef(booking.bookingRef || booking.bookingCode || booking._id);
  el.selectedCustomerName.textContent = booking.customerId?.fullName || '-';
  el.selectedCurrentUnit.textContent = unitTitle(booking.roomId);
  el.selectedCheckIn.textContent = fmtIst(booking.checkInDate);
  el.selectedCheckOut.textContent = fmtIst(booking.checkOutDate);
  el.selectedStatus.textContent = booking.status || '-';

  const totalPaid = booking.totalPaid || 0;
  const totalDue = booking.pricingSnapshot?.estimatedTotal || 0;
  el.selectedPaymentInfo.textContent = `Rs ${totalPaid} / Rs ${totalDue} (${booking.paymentStatus || 'UNPAID'})`;

  // Populate move/reschedule fields
  el.moveRoomId.value = booking.roomId?._id || '';
  el.moveRent.value = booking.pricingSnapshot?.nightlyBase || 0;
  el.moveCheckIn.value = new Date(booking.checkInDate).toISOString().slice(0, 10);
  el.moveCheckOut.value = new Date(booking.checkOutDate).toISOString().slice(0, 10);

  // Populate customer edit fields
  el.editCustomerId.value = booking.customerId?._id || '';
  el.editCustomerName.value = booking.customerId?.fullName || '';
  el.editCustomerPhone.value = booking.customerId?.phone || '';

  // Populate room dropdown with all active rooms
  populateRoomDropdown();
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
    setStatus(el.bookingStatus, 'Inventory initialized successfully.', 'success');
    await searchAvailability();
  } catch (err) {
    setStatus(el.bookingStatus, err.message, 'error');
  }
});

document.getElementById('searchBtn').addEventListener('click', async () => {
  await searchAvailability().catch((e) => setStatus(el.bookingStatus, e.message, 'error'));
});

el.checkUpdateBtn?.addEventListener('click', async () => {
  try {
    const data = await api.checkUpdate();
    const msg = data.updateAvailable
      ? `Update available. Local ${String(data.localHash).slice(0, 7)} -> Remote ${String(data.remoteHash).slice(0, 7)}`
      : `No update available. Local is current (${String(data.localHash).slice(0, 7)}).`;
    showFeedback('Update Check', msg);
  } catch (err) {
    showFeedback('Update Check Failed', err.message);
  }
});

el.runUpdateBtn?.addEventListener('click', async () => {
  try {
    const pin = await requireAdminPinForAction();
    const result = await api.runUpdate(pin);
    showFeedback('Update Started', result.message || 'Update started.');
  } catch (err) {
    showFeedback('Update Failed', err.message);
  }
});

el.copyCustomerBtn.addEventListener('click', async () => {
  const payload = collectCustomerDetailsFromForm();
  state.customerClipboard = payload;
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
  } catch (_e) {
    // ignore clipboard permission issues and rely on in-memory copy
  }
  setStatus(el.bookingStatus, 'Customer information copied.', 'success');
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
    setStatus(el.bookingStatus, 'No customer information available to paste.', 'error');
    return;
  }

  applyCustomerDetailsToForm(payload);
  setStatus(el.bookingStatus, 'Customer information pasted.', 'success');
});

el.searchCustomerBtn.addEventListener('click', async () => {
  const phone = el.searchCustomerPhone.value.trim();
  if (!phone) {
    setStatus(el.customerSearchStatus, 'Please enter a phone number to search.', 'error');
    return;
  }

  try {
    const customer = await api.searchCustomer(phone);

    // Auto-fill form with customer data
    applyCustomerDetailsToForm({
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      idType: customer.idType,
      idNumber: customer.idNumber,
      photoIdPath: customer.photoIdPath
    });

    setStatus(el.customerSearchStatus, `Customer found: ${customer.fullName}. Details auto-filled.`, 'success');
    el.searchCustomerPhone.value = ''; // Clear search input
  } catch (err) {
    setStatus(el.customerSearchStatus, err.message || 'Customer not found with this phone number.', 'error');
  }
});

el.roleSelect.addEventListener('change', refreshAdminStatus);
el.adminPin.addEventListener('input', refreshAdminStatus);

[el.fromDate, el.toDate, el.nightlyRent, el.roomDiscountType, el.roomDiscountValue, el.mealDiscountType, el.mealDiscountValue].forEach((n) => n.addEventListener('change', refreshQuote));

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
  // If toDate is before or equal to fromDate, adjust fromDate to be 1 day before toDate
  if (el.fromDate.value && el.toDate.value <= el.fromDate.value) {
    const d = new Date(`${el.toDate.value}T00:00:00+05:30`);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    el.fromDate.value = `${y}-${m}-${day}`;
    el.opFromDate.value = el.fromDate.value;
  }
  el.opToDate.value = el.toDate.value;
  if (el.opFromDate.value > el.opToDate.value) el.opFromDate.value = el.fromDate.value;
  renderMealPlanner();
  refreshQuote();
});

el.opFromDate?.addEventListener('change', loadOperationsBookings);
el.opToDate?.addEventListener('change', loadOperationsBookings);
el.billingFromDate?.addEventListener('change', renderBillingRoomTiles);
el.billingToDate?.addEventListener('change', renderBillingRoomTiles);
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
          notes: el.bookingNotes.value.trim(),
          discounts: {
            roomDiscountType: el.roomDiscountType.value,
            roomDiscountValue: Number(el.roomDiscountValue.value || 0),
            mealDiscountType: el.mealDiscountType.value,
            mealDiscountValue: Number(el.mealDiscountValue.value || 0)
          }
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
    setStatus(el.manageStatus, 'Booking rescheduled successfully.', 'success');
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

      // Show modal and wait for confirmation
      const updatedCustomer = await showCheckinModal(booking, customer);

      // If customer details were edited, update them first
      if (updatedCustomer.fullName !== customer.fullName ||
          updatedCustomer.phone !== customer.phone ||
          updatedCustomer.address !== customer.address) {
        try {
          const pin = await requireAdminPinForAction();
          await api.updateCustomer(updatedCustomer.customerId, {
            fullName: updatedCustomer.fullName,
            phone: updatedCustomer.phone,
            address: updatedCustomer.address
          }, pin);
          setStatus(el.manageStatus, 'Customer information updated.', 'success');
        } catch (updateErr) {
          setStatus(el.manageStatus, `Customer update failed: ${updateErr.message}`, 'error');
          return; // Don't proceed with check-in if customer update fails
        }
      }
    }

    await api.changeStatus(bookingId, action);
    setStatus(el.manageStatus, `Status updated: ${action.replace('_', ' ')}`, 'success');
    await loadBookings();
    await searchAvailability();
  } catch (err) {
    if (err.message !== 'Check-in cancelled') {
      setStatus(el.manageStatus, err.message, 'error');
    }
  }
}

document.getElementById('addPaymentBtn').addEventListener('click', async () => {
  const bookingId = state.selectedBillingBooking?.bookingId;
  if (!bookingId) return setStatus(el.paymentStatus, 'Select a booking first from the room tiles.', 'error');

  try {
    await api.addPayment(bookingId, {
      amount: Number(el.paymentAmount.value || 0),
      mode: el.paymentModeUpdate.value,
      type: el.paymentType.value,
      note: el.paymentNote.value.trim()
    });
    setStatus(el.paymentStatus, 'Payment recorded successfully.', 'success');

    // Refresh the selected booking info
    const rows = await api.roomBookings(state.selectedBillingBooking.roomId, el.billingFromDate.value, el.billingToDate.value);
    const updatedBooking = rows.find(r => r.bookingId === bookingId);
    if (updatedBooking) {
      selectBillingBooking(updatedBooking);
    }
  } catch (err) {
    setStatus(el.paymentStatus, err.message, 'error');
  }
});

document.getElementById('markBillPaidBtn').addEventListener('click', async () => {
  const bookingId = state.selectedBillingBooking?.bookingId;
  if (!bookingId) return setStatus(el.paymentStatus, 'Select a booking first from the room tiles.', 'error');

  // Show confirmation dialog
  const outstanding = Math.max(0, (state.selectedBillingBooking.totalDue || 0) - (state.selectedBillingBooking.totalPaid || 0));
  const confirmMessage = `Are you sure you want to mark this bill as fully paid?\n\nBooking: ${displayBookingRef(bookingId)}\nOutstanding Amount: Rs ${outstanding.toLocaleString()}\n\nThis will record a settlement payment for the outstanding amount.`;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    await api.addPayment(bookingId, { markBillPaid: true, amount: 0, mode: el.paymentModeUpdate.value, type: 'SETTLEMENT', note: 'Marked as fully paid' });
    setStatus(el.paymentStatus, 'Bill marked as fully paid successfully.', 'success');

    // Refresh the selected booking info
    const rows = await api.roomBookings(state.selectedBillingBooking.roomId, el.billingFromDate.value, el.billingToDate.value);
    const updatedBooking = rows.find(r => r.bookingId === bookingId);
    if (updatedBooking) {
      selectBillingBooking(updatedBooking);
    }
  } catch (err) {
    setStatus(el.paymentStatus, err.message, 'error');
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
    setStatus(el.customerEditStatus, 'Customer information updated successfully.', 'success');
    await loadBookings();
  } catch (err) {
    setStatus(el.customerEditStatus, err.message, 'error');
  }
});

document.getElementById('addExtraItemBtn').addEventListener('click', () => {
  addExtraItem();
});

document.getElementById('generateBillBtn').addEventListener('click', async () => {
  const bookingId = state.selectedBillingBooking?.bookingId;
  if (!bookingId) return setStatus(el.billStatus, 'Select a booking first from the room tiles.', 'error');

  try {
    // Use the extra items array
    const bill = await api.generateBill(bookingId, state.extraItems);
    setStatus(el.billStatus, `Bill generated successfully. Total: Rs ${bill.totalAmount.toLocaleString()}`, 'success');

    // Clear extra items list after successful bill generation
    state.extraItems = [];
    renderExtraItemsList();
  } catch (err) {
    setStatus(el.billStatus, err.message, 'error');
  }
});

document.getElementById('openBillBtn').addEventListener('click', async () => {
  const id = state.selectedBillingBooking?.bookingId;
  if (!id) return setStatus(el.billStatus, 'Select a booking first from the room tiles.', 'error');

  try {
    // Check if bill exists before opening
    const response = await fetch(`/api/billing/pdf/${id}`, { method: 'HEAD' });
    if (!response.ok) {
      setStatus(el.billStatus, 'Bill not generated yet. Please generate the bill first.', 'error');
      return;
    }

    // Bill exists, open and print
    const w = window.open(`/api/billing/pdf/${id}`, '_blank');
    if (w) {
      // Use Electron print API if available, otherwise use browser print
      if (window.electronAPI && window.electronAPI.print) {
        setTimeout(() => window.electronAPI.print(), 800);
      } else {
        setTimeout(() => w.print(), 800);
      }
    }
  } catch (err) {
    setStatus(el.billStatus, `Failed to open bill: ${err.message}`, 'error');
  }
});

document.getElementById('declarationBtn').addEventListener('click', () => {
  const id = state.selectedBillingBooking?.bookingId;
  if (!id) return setStatus(el.billStatus, 'Select a booking first from the room tiles.', 'error');
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
      breakfastRate: Number(el.defBreakfast.value || 100),
      lunchRate: Number(el.defLunch.value || 150),
      dinnerRate: Number(el.defDinner.value || 200),
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

    // Save individual meal rates if any are specified
    const breakfastVal = Number(el.configBreakfast.value || 0);
    const lunchVal = Number(el.configLunch.value || 0);
    const dinnerVal = Number(el.configDinner.value || 0);

    if (breakfastVal > 0 || lunchVal > 0 || dinnerVal > 0) {
      await api.saveMealRate({
        date: el.configDate.value,
        breakfastRate: breakfastVal || undefined,
        lunchRate: lunchVal || undefined,
        dinnerRate: dinnerVal || undefined
      }, pin);
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

    // Fix: Add +1 day to the 'to' date when querying to include the end date
    const fromDate = el.ledgerFrom.value;
    const toDateInput = new Date(el.ledgerTo.value);
    toDateInput.setDate(toDateInput.getDate() + 1);
    const toDate = toDateInput.toISOString().split('T')[0];

    const report = await api.ledger(fromDate, toDate, pin);

    // Show and populate summary cards
    el.ledgerSummaryCards.style.display = 'grid';
    el.summaryBookings.textContent = `${report.summary.totalBookings} / ${report.summary.totalBills}`;
    el.summaryDue.textContent = `Rs ${report.summary.totalDue.toLocaleString()}`;
    el.summaryPaid.textContent = `Rs ${report.summary.totalPaid.toLocaleString()}`;
    el.summaryOutstanding.textContent = `Rs ${report.summary.outstanding.toLocaleString()}`;

    // Show table and populate rows
    el.ledgerTableContainer.style.display = 'block';
    el.ledgerTableBody.innerHTML = '';

    report.rows.forEach((r) => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #e5e7eb';
      row.innerHTML = `
        <td style="padding: 0.75rem;">${r.bookingId || '-'}</td>
        <td style="padding: 0.75rem;">${r.customer || '-'}</td>
        <td style="padding: 0.75rem;">${r.unit || '-'}</td>
        <td style="padding: 0.75rem;">${r.checkIn ? fmtIst(r.checkIn) : '-'}</td>
        <td style="padding: 0.75rem;">${r.checkOut ? fmtIst(r.checkOut) : '-'}</td>
        <td style="padding: 0.75rem;"><span style="padding: 0.25rem 0.5rem; background: ${r.status === 'CHECKED_OUT' ? '#fef3c7' : r.status === 'CHECKED_IN' ? '#d1fae5' : '#e0e7ff'}; border-radius: 4px; font-size: 0.75rem;">${r.status || '-'}</span></td>
        <td style="padding: 0.75rem;"><span style="padding: 0.25rem 0.5rem; background: ${r.paymentStatus === 'PAID' ? '#d1fae5' : r.paymentStatus === 'PARTIAL' ? '#fed7aa' : '#fecaca'}; border-radius: 4px; font-size: 0.75rem;">${r.paymentStatus || '-'}</span></td>
        <td style="padding: 0.75rem; text-align: right; font-weight: 600;">Rs ${(r.amountDue || 0).toLocaleString()}</td>
        <td style="padding: 0.75rem; text-align: right; color: #16a34a;">Rs ${(r.paid || 0).toLocaleString()}</td>
        <td style="padding: 0.75rem; text-align: right; color: #ea580c; font-weight: 600;">Rs ${(r.outstanding || 0).toLocaleString()}</td>
      `;
      el.ledgerTableBody.appendChild(row);
    });

    setStatus(el.ledgerStatus, `Ledger loaded: ${report.rows.length} booking(s) found.`, 'success');
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

async function checkSystemHealth() {
  try {
    const response = await fetch('/api/health');
    const health = await response.json();

    if (!el.healthIndicator) return;

    const isHealthy = health.ok && health.mongoState === 1;

    if (isHealthy) {
      el.healthIndicator.classList.remove('unhealthy');
      el.healthIndicator.title = 'System Healthy\nDatabase: Connected';
    } else {
      el.healthIndicator.classList.add('unhealthy');
      const mongoStatus = health.mongoState === 1 ? 'Connected' : `Disconnected (State: ${health.mongoState})`;
      el.healthIndicator.title = `System Unhealthy\nDatabase: ${mongoStatus}`;
    }
  } catch (err) {
    if (el.healthIndicator) {
      el.healthIndicator.classList.add('unhealthy');
      el.healthIndicator.title = 'System Unreachable\nBackend not responding';
    }
  }
}

async function bootstrap() {
  el.fromDate.value = todayIso();
  el.toDate.value = plusDaysIso(1);
  el.opFromDate.value = todayIso();
  el.opToDate.value = plusDaysIso(1);
  el.billingFromDate.value = todayIso();
  el.billingToDate.value = plusDaysIso(1);
  el.moveCheckIn.value = todayIso();
  el.moveCheckOut.value = plusDaysIso(1);
  el.configDate.value = todayIso();
  el.ledgerFrom.value = todayIso();
  el.ledgerTo.value = todayIso();
  el.backupFrom.value = todayIso();
  el.backupTo.value = todayIso();

  wireToggles();
  wireTabs();

  const ver = await api.systemVersion().catch(() => null);
  if (ver && el.versionInfo) {
    el.versionInfo.textContent = `v${ver.version} · ${String(ver.localHash || '').slice(0, 7)}`;
  }

  state.defaults = await api.getDefaults().catch(() => state.defaults);
  fillDefaultsForm();

  await refreshAdminStatus();
  await searchAvailability().catch(() => setStatus(el.bookingStatus, 'Inventory not seeded yet.', 'info'));
  await loadBookings().catch(() => {});

  // System health monitoring
  await checkSystemHealth();
  setInterval(checkSystemHealth, 20000); // Check every 20 seconds

  // Health indicator click handler
  if (el.healthIndicator) {
    el.healthIndicator.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/health');
        const health = await response.json();

        const mongoStatus = health.mongoState === 1 ? 'Connected' : `Disconnected (State: ${health.mongoState})`;
        const details = `System Health Details:\n\nBackend: Running\nDatabase: ${mongoStatus}\nMongo State: ${health.mongoState}`;

        alert(details);
      } catch (err) {
        alert('System Health Details:\n\nBackend: Not responding\nPlease check if the application is running.');
      }
    });
  }

  await loadOperationsBookings().catch(() => {});
  await renderBillingRoomTiles().catch(() => {});
  await loadBackupFiles().catch(() => {});

  setStatus(el.bookingStatus, `System initialized. GST rate: ${state.defaults.gstPercent}% (inclusive).`);
}

bootstrap();
