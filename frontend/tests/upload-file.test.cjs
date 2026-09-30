'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

global.File = class TestFile extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = name;
    this.lastModified = options.lastModified || 0;
  }
};

const { MAX_FILE_SIZE, prepareSelectedFile } = require('../js/upload-file.js');

function selectedFile(name, bytes, type = '') {
  return new File([Uint8Array.from(bytes)], name, { type, lastModified: 123 });
}

test('copies JPG bytes to a stable File and derives MIME when provider MIME is empty', async () => {
  const original = selectedFile('rx.jpeg', [0xff, 0xd8, 0xff, 0x00]);
  const stable = await prepareSelectedFile(original);

  assert.notStrictEqual(stable, original);
  assert.equal(stable.name, 'rx.jpeg');
  assert.equal(stable.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await stable.arrayBuffer())], [0xff, 0xd8, 0xff, 0x00]);
});

test('accepts PNG and PDF signatures without converting the file', async () => {
  const png = await prepareSelectedFile(selectedFile('rx.png', [137, 80, 78, 71, 13, 10, 26, 10]));
  const pdf = await prepareSelectedFile(selectedFile('rx.pdf', [37, 80, 68, 70, 45, 49]));

  assert.equal(png.type, 'image/png');
  assert.equal(pdf.type, 'application/pdf');
  assert.deepEqual([...new Uint8Array(await pdf.arrayBuffer())], [37, 80, 68, 70, 45, 49]);
});

test('rejects unsupported, empty, oversized, and extension/content-mismatched files', async () => {
  await assert.rejects(prepareSelectedFile(selectedFile('rx.gif', [71, 73, 70])), { code: 'UNSUPPORTED_FILE' });
  await assert.rejects(prepareSelectedFile(selectedFile('empty.png', [])), { code: 'EMPTY_FILE' });
  await assert.rejects(prepareSelectedFile(selectedFile('wrong.jpg', [137, 80, 78, 71])), { code: 'INVALID_FILE_CONTENT' });
  const oversized = {
    name: 'large.pdf',
    size: MAX_FILE_SIZE + 1,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
  await assert.rejects(prepareSelectedFile(oversized), { code: 'FILE_TOO_LARGE' });
});