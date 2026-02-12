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
    target: [
      {
        target: "msi",
        arch: ["x64"]
      }
    ],
    artifactName: "ViraVillasRooms-${version}-Setup.${ext}"
  },
  msi: {
    oneClick: false,
    perMachine: true,
    runAfterFinish: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    menuCategory: true,
    warningsAsErrors: false
  },
  mac: {
    target: ["dmg"]
  },
  // After pack hook to prepare installation scripts
  afterPack: async (context) => {
    const fs = require('fs');
    const path = require('path');

    if (context.electronPlatformName === 'win32') {
      const appOutDir = context.appOutDir;
      const scriptsDir = path.join(appOutDir, 'scripts', 'windows');
      const resourcesDir = path.join(appOutDir, 'resources');

      // Ensure scripts directory exists in output
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(resourcesDir, { recursive: true });

      // Copy post-install script to resources
      const postInstallSrc = path.join(context.projectDir, 'scripts', 'windows', 'post-install.ps1');
      const postInstallDest = path.join(resourcesDir, 'post-install.ps1');

      if (fs.existsSync(postInstallSrc)) {
        fs.copyFileSync(postInstallSrc, postInstallDest);
        console.log('✓ Copied post-install.ps1 to resources');
      }

      // Create setup-launcher.bat in resources
      const launcherBat = path.join(resourcesDir, 'setup-launcher.bat');
      const batContent = `@echo off
echo Setting up Vira Villas Rooms...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0post-install.ps1" -InstallDir "%~dp0.."
if %ERRORLEVEL% NEQ 0 (
  echo Warning: Setup script encountered errors
  pause
)
`;
      fs.writeFileSync(launcherBat, batContent);
      console.log('✓ Created setup-launcher.bat');
    }
  },
  // After all artifacts are built
  afterAllArtifactBuild: async (buildResult) => {
    const fs = require('fs');
    const path = require('path');

    // Create a README for manual setup if needed
    const readmePath = path.join(buildResult.outDir, 'INSTALLATION_NOTES.txt');
    const readmeContent = `Vira Villas Rooms - Installation Notes

AUTOMATIC SETUP:
The installer will automatically:
1. Download and install MongoDB (if not present)
2. Configure MongoDB to start automatically
3. Create the .env configuration file
4. Set up the application to run at startup

MANUAL SETUP (if automatic setup fails):
1. Install MongoDB from: https://www.mongodb.com/try/download/community
2. Ensure MongoDB service is running
3. Navigate to the installation directory (usually C:\\Program Files\\Vira Villas Rooms)
4. Run the setup manually:
   powershell -ExecutionPolicy Bypass -File resources\\post-install.ps1

TROUBLESHOOTING:
- If the app doesn't start, check if MongoDB service is running
- Check the .env file in the installation directory
- Default MongoDB URI: mongodb://127.0.0.1:27017/roomsvv
- Default Admin PIN: 5597

For support, visit: https://github.com/ayushmadan/rooms-vv
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log('✓ Created INSTALLATION_NOTES.txt');

    return buildResult.artifactPaths;
  }
};
