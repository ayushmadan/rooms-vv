module.exports = {
  appId: "com.viravillas.rooms",
  productName: "Vira Villas Rooms",
  icon: "build/icon.png",
  directories: {
    output: "dist"
  },
  files: [
    "electron/**/*",
    "app/**/*",
    "scripts/windows/backup-database.ps1",
    "scripts/windows/restore-backup.ps1",
    "node_modules/**/*",
    "package.json",
    "package-lock.json",
    ".env.example"
  ],
  win: {
    target: "nsis"
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    // Use custom NSIS script for MongoDB installation and backup/restore
    include: "build/installer.nsh"
  }
};
