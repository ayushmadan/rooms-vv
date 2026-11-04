const { badRequest, notFound } = require('../lib/http');
const vault = require('./vault');

const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Detect type from content, never from the client-supplied name or MIME.
const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' }
];

function detectMime(buffer) {
  const match = SIGNATURES.find((sig) => buffer.length >= 12 && sig.test(buffer));
  return match ? match.mime : null;
}

/** Stores an upload. Identity documents are sealed when encryption keys exist. */
function save(ctx, { name, buffer }) {
  if (!buffer || !buffer.length) throw badRequest('File is empty');
  if (buffer.length > MAX_FILE_BYTES) throw badRequest('File is larger than 8 MB');
  const mime = detectMime(buffer);
  if (!mime) throw badRequest('Only JPEG, PNG, WEBP images or PDF files are accepted');
  const sealed = vault.hasKeys(ctx.store);
  return ctx.store.insert('files', {
    name: String(name || 'upload').slice(0, 120),
    mime,
    size: buffer.length,
    data: sealed ? vault.seal(ctx.store, buffer) : buffer,
    encrypted: sealed ? 1 : 0,
    created_at: ctx.now()
  });
}

function get(store, id) {
  const file = store.get('SELECT id, name, mime, size, data, encrypted FROM files WHERE id = ?', id);
  if (!file) throw notFound('File not found');
  return file.encrypted ? { ...file, data: vault.open(store, Buffer.from(file.data)) } : file;
}

module.exports = { save, get, detectMime, MAX_FILE_BYTES };
