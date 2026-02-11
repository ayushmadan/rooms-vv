const express = require('express');
const path = require('path');
const { runRangeBackup, listBackupFiles, uploadBackupFiles } = require('../services/backup.service');

const router = express.Router();

router.post('/export', async (req, res, next) => {
  try {
    const { fromDate, toDate } = req.body;
    if (!fromDate || !toDate) return res.status(400).json({ message: 'fromDate and toDate are required' });

    const result = await runRangeBackup(fromDate, toDate, 'manual');
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get('/files', (_req, res) => {
  res.json({ files: listBackupFiles() });
});

router.post('/upload', async (req, res, next) => {
  try {
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ message: 'files list is required' });

    const results = await uploadBackupFiles(files);
    res.json({ results });
  } catch (e) {
    next(e);
  }
});

router.get('/download/:fileName', (req, res) => {
  const safeName = path.basename(req.params.fileName);
  res.sendFile(path.resolve('app/backend/output/backups', safeName));
});

module.exports = router;
