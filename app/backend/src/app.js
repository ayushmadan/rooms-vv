const express = require('express');
const cors = require('cors');
const path = require('path');
const { injectUser } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const roomRoutes = require('./routes/rooms');
const customerRoutes = require('./routes/customers');
const bookingRoutes = require('./routes/bookings');
const billingRoutes = require('./routes/billing');
const configRoutes = require('./routes/config');
const backupRoutes = require('./routes/backups');
const authRoutes = require('./routes/auth');
const ledgerRoutes = require('./routes/ledger');
const systemRoutes = require('./routes/system');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(injectUser);

app.use('/api/health', healthRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/config', configRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/system', systemRoutes);

app.use('/', express.static(path.resolve('app/frontend')));

app.use(errorHandler);

module.exports = app;
