// HTTP client for the local server. Handles the CSRF header, staff name and admin token.

const STAFF_KEY = 'rooms.staff';
let adminToken = '';
let onAdminRequired = null;
let onAdminChange = () => {};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: staff name simply is not remembered.
  }
}

export const staff = {
  get: () => storageGet(STAFF_KEY) || '',
  set: (name) => storageSet(STAFF_KEY, name.trim().slice(0, 40))
};

export const admin = {
  get isUnlocked() {
    return Boolean(adminToken);
  },
  /** Passed to the desktop bridge, which re-verifies it with the server. */
  get token() {
    return adminToken;
  },
  setToken(token) {
    adminToken = token || '';
    onAdminChange(Boolean(adminToken));
  },
  onChange(fn) {
    onAdminChange = fn;
  },
  /** fn() should prompt for the PIN and resolve true when unlocked. */
  setPrompt(fn) {
    onAdminRequired = fn;
  }
};

function headers(extra = {}) {
  const result = { 'x-rooms-client': '1', ...extra };
  const name = staff.get();
  if (name) result['x-staff'] = name;
  if (adminToken) result.authorization = `Bearer ${adminToken}`;
  return result;
}

async function send(method, path, { body, raw, retryAsAdmin = true } = {}) {
  const init = { method, headers: headers() };
  if (raw !== undefined) {
    init.body = raw;
    init.headers['content-type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'The app server is not responding. Restart the app.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : res.ok ? await res.blob() : null;
  if (res.ok) return data;

  const message = (data && data.message) || `Request failed (${res.status})`;
  if (res.status === 403 && /admin/i.test(message) && retryAsAdmin && onAdminRequired) {
    if (adminToken) admin.setToken('');
    if (await onAdminRequired()) return send(method, path, { body, raw, retryAsAdmin: false });
  }
  throw new ApiError(res.status, message);
}

export const api = {
  get: (path) => send('GET', path),
  post: (path, body = {}) => send('POST', path, { body }),
  put: (path, body = {}) => send('PUT', path, { body }),
  patch: (path, body = {}) => send('PATCH', path, { body }),
  del: (path) => send('DELETE', path),
  upload: (method, path, file) => send(method, path, { raw: file })
};

export function query(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, v);
  return search.toString();
}
