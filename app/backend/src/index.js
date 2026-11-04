// Standalone entry for development in a browser: `npm start`.
const path = require('path');
const { createServer } = require('./server');
const logger = require('./lib/logger');
const { version } = require('../../../package.json');

const DEFAULT_PORT = 4000;

async function main() {
  const dataDir = path.resolve(process.env.ROOMS_DATA_DIR || '.data');
  const server = createServer({ dataDir, appVersion: version });
  const { url } = await server.listen({ port: Number(process.env.PORT || DEFAULT_PORT) });
  logger.info('Rooms server ready', { url, dataDir });

  const shutdown = () => server.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start', { error: err.stack || err.message });
  process.exit(1);
});
