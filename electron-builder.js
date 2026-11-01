// Windows installer: per-user NSIS setup, so front-desk accounts without admin rights can
// install and update it. Data lives in the user's AppData, so reinstalling or upgrading
// never touches it, and no database service is installed.
module.exports = {
  appId: 'com.viravillas.rooms',
  productName: 'Vira Villas Rooms',
  copyright: 'Vira Villas',
  icon: 'build/icon.png',
  directories: { output: 'dist' },
  files: [
    'electron/**/*',
    'app/backend/src/**/*',
    'app/frontend/**/*',
    'package.json'
  ],
  asar: true,
  compression: 'maximum',
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: 'Vira-Villas-Rooms-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'Vira Villas Rooms',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false
  },
  mac: { target: 'dmg', category: 'public.app-category.business' }
};
