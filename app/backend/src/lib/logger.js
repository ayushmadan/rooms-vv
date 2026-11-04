// Structured line logger. Writes JSON lines to a file when configured, else to the console.
const fs = require('fs');
const path = require('path');

const MAX_LOG_BYTES = 5 * 1024 * 1024;
let logFile = null;

function configure({ dir }) {
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'app.log');
  try {
    if (fs.statSync(logFile).size > MAX_LOG_BYTES) fs.renameSync(logFile, `${logFile}.1`);
  } catch (_err) {
    // No existing log yet.
  }
}

function write(level, message, fields = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), level, message, ...fields });
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `${line}\n`);
      return;
    } catch (_err) {
      // Fall through to console if the log file is unwritable.
    }
  }
  (level === 'error' ? console.error : console.log)(line);
}

module.exports = {
  configure,
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
  get file() {
    return logFile;
  }
};
