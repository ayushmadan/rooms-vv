const app = require('./app');
const { port } = require('./config/env');
const { connectDb } = require('./config/db');
const { scheduleBackups } = require('./services/backup.service');
const { ensureMongoRunning } = require('../../../scripts/start-mongo');

async function start() {
  await ensureMongoRunning();
  await connectDb();
  scheduleBackups();

  const server = app.listen(port, () => {
    console.log(`Vira Villas Rooms server listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${port} is already in use.`);
      console.error('Another instance of the application may be running.');
      console.error('\nTo fix this:');
      console.error('  1. Close all Electron windows');
      console.error('  2. Kill the process: npx kill-port 4000');
      console.error('  3. Restart the application\n');
      process.exit(1);
    } else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });
}

start().catch((e) => {
  console.error('Failed to start application:', e.message);
  process.exit(1);
});
