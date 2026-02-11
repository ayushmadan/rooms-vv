const app = require('./app');
const { port } = require('./config/env');
const { connectDb } = require('./config/db');
const { scheduleBackups } = require('./services/backup.service');
const { ensureMongoRunning } = require('../../../scripts/start-mongo');

async function start() {
  await ensureMongoRunning();
  await connectDb();
  scheduleBackups();

  app.listen(port, () => {
    console.log(`Vira Villas Rooms server listening on http://localhost:${port}`);
  });
}

start().catch((e) => {
  console.error('Failed to start application:', e.message);
  process.exit(1);
});
