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
  extraResources: [
    {
      from: "build/installers",
      to: "installers",
      filter: ["**/*"]
    }
  ],
  win: {
    target: "msi"
  },
  msi: {
    oneClick: false,
    perMachine: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true  // This will trigger our setup script
  },
  // Before build: Download MongoDB installer
  beforeBuild: async (context) => {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    if (context.platform.name === 'windows') {
      // Use process.cwd() instead of context.projectDir
      const projectDir = process.cwd();

      // Ensure build/installers directory exists
      const installersDir = path.join(projectDir, 'build', 'installers');
      fs.mkdirSync(installersDir, { recursive: true });

      console.log('📥 Downloading MongoDB installer...');

      const downloadScript = path.join(projectDir, 'scripts', 'windows', 'download-prerequisites.ps1');

      if (!fs.existsSync(downloadScript)) {
        console.log('⚠ Download script not found, skipping');
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const ps = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', downloadScript
        ], {
          stdio: 'inherit',
          cwd: projectDir
        });

        ps.on('close', (code) => {
          if (code === 0) {
            console.log('✓ MongoDB installer downloaded');
          } else {
            console.log('⚠ Download failed (continuing without bundled installer)');
          }
          resolve();
        });

        ps.on('error', (err) => {
          console.log('⚠ Error downloading:', err.message);
          resolve();
        });
      });
    }
  },
  // After pack: Set up automatic MongoDB installation
  afterPack: async (context) => {
    const fs = require('fs');
    const path = require('path');

    if (context.electronPlatformName === 'win32') {
      const projectDir = process.cwd();
      const appOutDir = context.appOutDir;
      const resourcesDir = path.join(appOutDir, 'resources');

      fs.mkdirSync(resourcesDir, { recursive: true });

      // Copy post-install script
      const postInstallSrc = path.join(projectDir, 'scripts', 'windows', 'post-install.ps1');
      const postInstallDest = path.join(resourcesDir, 'post-install.ps1');

      if (fs.existsSync(postInstallSrc)) {
        fs.copyFileSync(postInstallSrc, postInstallDest);
        console.log('✓ Copied post-install.ps1');
      }

      // Create first-run setup script
      const setupScript = path.join(resourcesDir, 'first-run-setup.bat');
      const setupContent = `@echo off
echo.
echo ===============================================
echo   Vira Villas Rooms - First Time Setup
echo ===============================================
echo.
echo Setting up MongoDB and configuring system...
echo This may take a few minutes.
echo.

REM Run post-install script
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0post-install.ps1" -InstallDir "%~dp0.."

echo.
echo Setup complete! Starting application...
echo.
start "" "%~dp0..\\Vira Villas Rooms.exe"
`;
      fs.writeFileSync(setupScript, setupContent);
      console.log('✓ Created first-run-setup.bat');
    }
  },
  // After build: Create installation notes
  afterAllArtifactBuild: async (buildResult) => {
    const fs = require('fs');
    const path = require('path');

    const readmePath = path.join(buildResult.outDir, 'INSTALLATION_NOTES.txt');
    const readmeContent = `Vira Villas Rooms - Installation Notes

BUNDLED INSTALLER WITH MONGODB:
The MSI includes MongoDB installer and will set it up automatically.

INSTALLATION PROCESS:
1. Run the MSI installer
2. On first launch, a setup wizard will:
   - Install MongoDB (if not present)
   - Configure MongoDB to start automatically
   - Create .env configuration file
   - Set up the application

This process takes 2-3 minutes on first run.

MANUAL SETUP (if needed):
If automatic setup doesn't run, you can trigger it manually:
1. Navigate to: C:\\Program Files\\Vira Villas Rooms\\resources
2. Run: first-run-setup.bat

TROUBLESHOOTING:
- If app doesn't start, check if MongoDB service is running
- Check Windows Services for "MongoDB" or "MongoDBServer"
- Default MongoDB URI: mongodb://127.0.0.1:27017/roomsvv
- Default Admin PIN: 5597

For support: https://github.com/ayushmadan/rooms-vv
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log('✓ Created INSTALLATION_NOTES.txt');

    return buildResult.artifactPaths;
  }
};
