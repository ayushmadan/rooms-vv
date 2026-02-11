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

  // Graceful shutdown handlers
  const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Closing server gracefully...`);
    server.close(() => {
      console.log('Server closed. Exiting process.');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('exit', () => {
    console.log('Backend process exiting...');
  });
}

start().catch((e) => {
  console.error('Failed to start application:', e.message);
  process.exit(1);
});
