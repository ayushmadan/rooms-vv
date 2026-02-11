function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Unexpected error'
  });
}

module.exports = { errorHandler };
