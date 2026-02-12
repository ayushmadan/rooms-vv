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
    "scripts/**/*",
    "node_modules/**/*",
    "package.json",
    "package-lock.json",
    ".env.example"
  ],
  win: {
    target: "msi"
  },
  msi: {
    oneClick: false,
    perMachine: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
};
