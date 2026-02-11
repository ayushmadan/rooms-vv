const fs = require('fs');
const { google } = require('googleapis');
const { googleServiceAccountJson, googleDriveFolderId } = require('../config/env');

function getDriveClient() {
  if (!googleServiceAccountJson || !googleDriveFolderId) return null;

  const credentials = JSON.parse(fs.readFileSync(googleServiceAccountJson, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });

  return google.drive({ version: 'v3', auth });
}

async function uploadToDrive(localPath, fileName) {
  const drive = getDriveClient();
  if (!drive) return { uploaded: false, reason: 'Drive config missing' };

  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [googleDriveFolderId]
    },
    media: {
      mimeType: 'text/csv',
      body: fs.createReadStream(localPath)
    }
  });

  return { uploaded: true };
}

module.exports = { uploadToDrive };
