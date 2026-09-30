'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadApi(fetchImpl, initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const window = {
    location: { hostname: 'rxguard.test', href: '' },
    RXGUARD_CONFIG: { apiBase: 'https://api.example.test/api/v1' },
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window,
    localStorage: storage,
    fetch: fetchImpl,
    FormData,
    URL,
    URLSearchParams,
    atob,
    CustomEvent: class CustomEvent {},
    navigator: { onLine: true },
    console: { warn() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf8'), context);
  return { RxGuard: window.RxGuard, storage };
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('a delayed 401 retries with the already-refreshed token instead of rotating twice', async () => {
  let refreshCount = 0;
  let releaseDelayed401;
  let delayedRequestStarted;
  const started = new Promise(resolve => { delayedRequestStarted = resolve; });
  const api = loadApi(async (url, options = {}) => {
    if (url.endsWith('/auth/refresh')) {
      refreshCount++;
      return jsonResponse(200, { data: { access_token: 'new-access', refresh_token: 'new-refresh' } });
    }
    if (options.headers.Authorization === 'Bearer new-access') {
      return jsonResponse(200, { status: 'success', data: [] });
    }
    if (url.endsWith('/slow')) {
      delayedRequestStarted();
      return new Promise(resolve => { releaseDelayed401 = () => resolve(jsonResponse(401, { message: 'expired' })); });
    }
    return jsonResponse(401, { message: 'expired' });
  }, {
    rxguard_access_token: 'old-access',
    rxguard_refresh_token: 'old-refresh',
  }).RxGuard;

  const slow = api.api.get('/slow');
  await started;
  const fast = api.api.get('/fast');
  while (!releaseDelayed401) await new Promise(resolve => setImmediate(resolve));
  await fast;
  releaseDelayed401();
  await slow;

  assert.equal(refreshCount, 1);
});

test('FormData upload leaves Content-Type unset for the browser boundary', async () => {
  let requestOptions;
  const api = loadApi(async (url, options) => {
    requestOptions = options;
    return jsonResponse(201, { status: 'success' });
  }, { rxguard_access_token: 'valid-access' }).RxGuard;

  await api.Prescriptions.upload(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));

  assert.equal(requestOptions.body instanceof FormData, true);
  assert.equal(Object.hasOwn(requestOptions.headers, 'Content-Type'), false);
  assert.equal(requestOptions.headers.Authorization, 'Bearer valid-access');
});