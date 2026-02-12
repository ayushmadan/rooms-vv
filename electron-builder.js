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
        target: "nsis",
        arch: ["x64"]
      }
    ],
    artifactName: "ViraVillasRooms-${version}-Setup.${ext}"
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: false,
    // Include custom NSIS script for installing prerequisites
    include: "build/installer.nsh",
    // Bundle MongoDB installer as extra resource
    installerLanguages: ["en_US"],
    deleteAppDataOnUninstall: false
  },
  extraResources: [
    {
      from: "build/installers",
      to: "installers",
      filter: ["**/*"]
    }
  ],
  mac: {
    target: ["dmg"]
  },
  // Before build hook to download prerequisites
  beforeBuild: async (context) => {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    if (context.platform.name === 'windows') {
      // Ensure build/installers directory exists
      const installersDir = path.join(context.projectDir, 'build', 'installers');
      fs.mkdirSync(installersDir, { recursive: true });

      console.log('Downloading prerequisites for bundled installer...');

      const downloadScript = path.join(context.projectDir, 'scripts', 'windows', 'download-prerequisites.ps1');

      // Check if download script exists
      if (!fs.existsSync(downloadScript)) {
        console.log('⚠ Download script not found, skipping prerequisite download');
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const ps = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', downloadScript
        ], {
          stdio: 'inherit',
          cwd: context.projectDir
        });

        ps.on('close', (code) => {
          if (code === 0) {
            console.log('✓ Prerequisites downloaded successfully');
          } else {
            console.log('⚠ Failed to download prerequisites (continuing anyway)');
          }
          resolve();
        });

        ps.on('error', (err) => {
          console.log('⚠ Error running download script:', err.message);
          resolve();
        });
      });
    }
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

BUNDLED INSTALLER (NSIS):
The installer bundles MongoDB and installs it automatically during setup.
This is similar to how games bundle DirectX or Visual C++ Runtime.

AUTOMATIC SETUP:
The installer will automatically:
1. Install MongoDB (if not already present) - takes 2-3 minutes
2. Configure MongoDB service to start automatically
3. Create the .env configuration file
4. Set up desktop and start menu shortcuts

INSTALLATION PROCESS:
1. Run the installer (requires administrator privileges)
2. Choose installation directory
3. Wait for MongoDB installation (if needed)
4. Application will be ready to use!

MANUAL MONGODB INSTALLATION (if needed):
If MongoDB installation fails during setup:
1. Install MongoDB from: https://www.mongodb.com/try/download/community
2. Ensure MongoDB service is running
3. Start the application from desktop shortcut

TROUBLESHOOTING:
- If the app doesn't start, check if MongoDB service is running
- Check Windows Services for "MongoDB" or "MongoDBServer"
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
