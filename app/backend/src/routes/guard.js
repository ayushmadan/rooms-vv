const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { forbidden, badRequest, HttpError } = require('../lib/http');

function requireAdmin(req, _res, next) {
  if (!req.ctx.isAdmin) return next(forbidden('Admin PIN required'));
  next();
}

/** ID numbers and photos: admin PIN, or the admin PC itself. */
function requireIdAccess(req, _res, next) {
  if (!req.ctx.canSeeIds) return next(forbidden('Admin PIN required to view identity documents'));
  next();
}

/** Streams a raw request body to a temp file, enforcing a size cap. Resolves to the file path. */
function receiveFile(req, dir, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.get('content-length') || 0);
    if (declared > maxBytes) return reject(new HttpError(413, 'File is too large'));
    const file = path.join(dir, `upload-${crypto.randomBytes(8).toString('hex')}`);
    const out = fs.createWriteStream(file);
    let received = 0;
    const fail = (err) => {
      out.destroy();
      fs.rm(file, { force: true }, () => reject(err));
    };
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.unpipe(out);
        req.resume();
        fail(new HttpError(413, 'File is too large'));
      }
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => (received ? resolve(file) : fail(badRequest('No file received'))));
    req.pipe(out);
  });
}

/** Reads a raw request body into memory (for small uploads such as ID photos). */
function receiveBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        reject(new HttpError(413, 'File is too large'));
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = { requireAdmin, requireIdAccess, receiveFile, receiveBuffer };
