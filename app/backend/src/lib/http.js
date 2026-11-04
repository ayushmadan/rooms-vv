class HttpError extends Error {
  constructor(status, message, options) {
    super(message, options);
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);
const forbidden = (message) => new HttpError(403, message);
const notFound = (message) => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

/** Wraps a handler so thrown errors (sync or async) reach the error middleware. */
function handle(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { HttpError, badRequest, forbidden, notFound, conflict, handle };
