'use strict';

(function (root) {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const TYPES = {
    jpg: { mime: 'image/jpeg', signature: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
    jpeg: { mime: 'image/jpeg', signature: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
    png: { mime: 'image/png', signature: bytes => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) },
    pdf: { mime: 'application/pdf', signature: bytes => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d },
  };

  class UploadFileError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'UploadFileError';
      this.code = code;
    }
  }

  async function prepareSelectedFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new UploadFileError('FILE_UNAVAILABLE', 'The selected file could not be read. Please select it again.');
    }
    if (!file.size) {
      throw new UploadFileError('EMPTY_FILE', 'The selected file is empty. Please choose another file.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new UploadFileError('FILE_TOO_LARGE', 'Maximum file size is 10 MB.');
    }

    const extension = String(file.name || '').split('.').pop().toLowerCase();
    const type = TYPES[extension];
    if (!type) {
      throw new UploadFileError('UNSUPPORTED_FILE', 'Please upload a JPG, PNG, or PDF file.');
    }

    try {
      const bytes = await file.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8));
      if (!type.signature(signature)) {
        throw new UploadFileError('INVALID_FILE_CONTENT', 'The file contents do not match its extension. Please choose a valid JPG, PNG, or PDF.');
      }

      return new File([bytes], file.name, {
        type: type.mime,
        lastModified: file.lastModified || Date.now(),
      });
    } catch (error) {
      if (error instanceof UploadFileError) throw error;
      throw new UploadFileError('FILE_UNAVAILABLE', 'The selected file could not be read by the browser. Please select it again.');
    }
  }

  const api = { MAX_FILE_SIZE, UploadFileError, prepareSelectedFile };
  root.RxGuardUploadFile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);