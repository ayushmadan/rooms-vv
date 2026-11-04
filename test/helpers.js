const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../app/backend/src/server');

const ADMIN_PIN = '4826';

/** A controllable clock, so tests never depend on the real date. */
function fixedClock(iso) {
  let current = new Date(iso);
  const clock = () => new Date(current);
  clock.set = (next) => {
    current = new Date(next);
  };
  return clock;
}

const offlineFetch = async () => { throw new Error('offline in tests'); };

async function startApp({ now = '2026-11-02T06:30:00.000Z', setup = true, license, publicKeyPem, fetchImpl = offlineFetch, dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-test-')) } = {}) {
  const clock = fixedClock(now);
  const server = createServer({
    dataDir: path.join(dataDir, 'data'), appVersion: 'test', clock, ...(license ? { license } : {}),
    phoneCapture: { host: '127.0.0.1', port: 0 },
    sync: { host: '127.0.0.1', port: 0, discoveryPort: null },
    fetchImpl,
    ...(publicKeyPem ? { publicKeyPem } : {})
  });
  const { url } = await server.listen();
  let adminToken = '';

  async function request(method, urlPath, { body, admin = false, headers = {}, raw } = {}) {
    const init = { method, headers: { 'x-rooms-client': '1', 'x-staff': 'Tester', ...headers } };
    if (admin) init.headers.authorization = `Bearer ${adminToken}`;
    if (raw !== undefined) {
      init.body = raw;
      init.headers['content-type'] = 'application/octet-stream';
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const res = await fetch(url + urlPath, init);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : type.includes('text') ? await res.text() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }

  const api = {
    get: (p, o) => request('GET', p, o),
    post: (p, body, o = {}) => request('POST', p, { ...o, body }),
    put: (p, body, o = {}) => request('PUT', p, { ...o, body }),
    patch: (p, body, o = {}) => request('PATCH', p, { ...o, body }),
    raw: request,
    get adminToken() {
      return adminToken;
    },
    async unlock() {
      const res = await request('POST', '/api/auth/unlock', { body: { pin: ADMIN_PIN } });
      adminToken = res.data.token;
      return res;
    }
  };

  if (setup) {
    const res = await api.post('/api/setup', {
      property: { name: 'Vira Villas', invoicePrefix: 'VV', address: 'Test Road', gstin: '' },
      taxes: { roomGstPercent: 5, hallGstPercent: 18, foodGstPercent: 5, serviceGstPercent: 18, pricesIncludeTax: true },
      meals: { breakfast: 100, lunch: 150, dinner: 200 },
      pin: ADMIN_PIN
    });
    if (res.status !== 200) throw new Error(`setup failed: ${JSON.stringify(res.data)}`);
  }

  /** keepData: leave the data folder so a new startApp({ dataDir }) can reopen it (a restart). */
  async function stop({ keepData = false } = {}) {
    await server.close();
    if (!keepData) fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { api, url, server, clock, dataDir, stop };
}

async function unitByCode(api, code) {
  const { data } = await api.get('/api/units');
  return data.find((u) => u.code === code);
}

module.exports = { startApp, unitByCode, fixedClock, ADMIN_PIN };
