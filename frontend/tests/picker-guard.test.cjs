'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class FakeElement {
  constructor(id) {
    this.id = id;
    this.listeners = new Map();
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.value = '';
    this.files = [];
    this.pickerCalls = 0;
    this.previewWrites = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  click() {
    this.pickerCalls++;
    let stopped = false;
    this.dispatch('click', { stopPropagation() { stopped = true; } });
    if (!stopped) elements.get('uploadZone').dispatch('click');
  }

  set textContent(value) {
    this._textContent = value;
    if (this.id === 'previewName') this.previewWrites++;
  }

  get textContent() {
    return this._textContent;
  }
}

const ids = [
  'uploadZone', 'fileInput', 'scanBtn', 'clearBtn', 'retryScanBtn', 'suggestBtn',
  'useSuggestionBtn', 'approveBtn', 'filePreview', 'previewName', 'previewSize',
  'previewType', 'previewThumb', 'historyList', 'historyEmpty',
];
const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
const documentListeners = new Map();
const windowListeners = new Map();
let nextTimerId = 1;
const timers = new Map();
let preparationCalls = 0;
let objectUrlCalls = 0;

const document = {
  hidden: false,
  getElementById: id => elements.get(id) || null,
  addEventListener(type, listener) {
    const listeners = documentListeners.get(type) || [];
    listeners.push(listener);
    documentListeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    documentListeners.set(type, (documentListeners.get(type) || []).filter(item => item !== listener));
  },
};

const window = {
  location: { search: '' },
  ScannerPage: null,
  addEventListener(type, listener) {
    const listeners = windowListeners.get(type) || [];
    listeners.push(listener);
    windowListeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    windowListeners.set(type, (windowListeners.get(type) || []).filter(item => item !== listener));
  },
};

const stableFile = { name: 'prescription.jpg', type: 'image/jpeg', size: 4 };
const context = {
  window,
  document,
  App: { injectSidebar() {} },
  RxGuard: { Toast: { warning() {}, error() {}, info() {} } },
  RxGuardUploadFile: {
    async prepareSelectedFile() {
      preparationCalls++;
      return stableFile;
    },
  },
  URL: { createObjectURL: () => `blob:test-${++objectUrlCalls}`, revokeObjectURL() {} },
  URLSearchParams,
  setTimeout(callback) {
    const id = nextTimerId++;
    timers.set(id, callback);
    return id;
  },
  clearTimeout(id) { timers.delete(id); },
  console,
};

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/scanner.js'), 'utf8'), context);
for (const listener of documentListeners.get('DOMContentLoaded') || []) listener();

test('one tap and rapid repeated taps open only one picker; cancel permits reopening', () => {
  const zone = elements.get('uploadZone');
  const input = elements.get('fileInput');

  zone.dispatch('click');
  zone.dispatch('click');
  zone.dispatch('click');
  assert.equal(input.pickerCalls, 1);

  input.dispatch('cancel');
  zone.dispatch('click');
  assert.equal(input.pickerCalls, 2);
  input.dispatch('cancel');
});

test('one input change prepares and previews one stable file, and a later same-file change works', async () => {
  const zone = elements.get('uploadZone');
  const input = elements.get('fileInput');
  const initialPickerCalls = input.pickerCalls;
  input.files = [{ name: stableFile.name, type: stableFile.type, size: stableFile.size }];

  zone.dispatch('click');
  input.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(input.pickerCalls, initialPickerCalls + 1);
  assert.equal(preparationCalls, 1);
  assert.equal(objectUrlCalls, 1);
  assert.equal(elements.get('previewName').textContent, stableFile.name);
  assert.equal(elements.get('previewName').previewWrites, 1);

  zone.dispatch('click');
  assert.equal(input.pickerCalls, initialPickerCalls + 2);
  input.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(preparationCalls, 2);
  assert.equal(objectUrlCalls, 2);
  assert.equal(elements.get('previewName').previewWrites, 2);
});