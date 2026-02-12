# Bundled MSI Installer

This MSI installer bundles MongoDB and other prerequisites directly within the installer package, similar to how game installers bundle DirectX and other runtime dependencies.

## How It Works

The installer follows this approach:

1. **Download Phase** (during build):
   - The build process downloads MongoDB installer (~300 MB)
   - MongoDB installer is placed in `build/installers/` directory
   - Setup scripts are generated

2. **Build Phase**:
   - Electron-builder packages the app with WiX Toolset
   - Custom WiX XML template (`installer.wxs`) defines installation steps
   - MongoDB installer and scripts are bundled into the MSI

3. **Installation Phase** (when user runs the MSI):
   - MSI extracts all files including bundled MongoDB installer
   - Custom actions run MongoDB installer silently
   - MongoDB service is configured and started
   - Environment files (.env) are created
   - Application is configured for auto-start

## Building the Installer

### Prerequisites for Building

- Windows 10/11 with PowerShell
- Node.js 20+
- npm
- Internet connection (to download MongoDB installer)

### Build Commands

```powershell
# Standard build (downloads prerequisites automatically)
npm run build:msi

# Or using the pipeline script
npm run build:msi:pipeline

# To manually download prerequisites before building
npm run download:prerequisites
```

### Build Process

1. The `beforeBuild` hook in electron-builder.js runs `download-prerequisites.ps1`
2. MongoDB installer is downloaded to `build/installers/mongodb-installer.msi`
3. Setup script is created at `build/installers/setup-mongodb.ps1`
4. Electron-builder packages everything using custom WiX configuration
5. Final MSI is output to `dist/` directory

## Installation Behavior

When end users run the MSI:

1. **Files Installation**: App files are copied to installation directory
2. **MongoDB Check**: Checks if MongoDB is already installed
3. **MongoDB Installation**: If not installed, runs bundled MongoDB installer silently
4. **Service Configuration**:
   - Sets MongoDB to start automatically on boot
   - Configures service recovery (auto-restart on failure)
   - Starts MongoDB service immediately
5. **Environment Setup**: Creates `.env` file from `.env.example`
6. **Shortcuts**: Creates desktop and start menu shortcuts

## WiX Custom Actions

The installer uses these custom actions (defined in `build/installer.wxs`):

- **InstallMongoDB**: Runs MongoDB MSI installer with silent flags
- **ConfigureMongoService**: Sets MongoDB service to auto-start
- **SetMongoRecovery**: Configures service recovery options
- **CreateEnvFile**: Creates .env configuration file

## File Structure

```
build/
├── installers/              # Downloaded during build
│   ├── mongodb-installer.msi    # MongoDB installer (~300 MB)
│   └── setup-mongodb.ps1        # MongoDB configuration script
├── installer.wxs            # WiX XML template for custom actions
└── icon.png                 # Application icon

scripts/windows/
├── download-prerequisites.ps1   # Downloads MongoDB installer
├── build-msi.ps1               # Build pipeline script
├── post-install.ps1            # Legacy post-install (now mostly in WiX)
└── ensure-mongo.ps1            # MongoDB verification utility
```

## Customization

### Change MongoDB Version

Edit `scripts/windows/download-prerequisites.ps1`:

```powershell
[string]$MongoVersion = "8.0.4"  # Change to desired version
```

### Add More Prerequisites

1. Update `download-prerequisites.ps1` to download additional installers
2. Add custom actions in `build/installer.wxs`
3. Add file references in the WiX Fragment
4. Update installation sequence in `InstallExecuteSequence`

Example for adding Visual C++ Redistributable:

```xml
<Binary Id="VCRedist" SourceFile="installers\vc_redist.x64.exe" />

<CustomAction Id="InstallVCRedist"
              BinaryKey="VCRedist"
              Execute="deferred"
              Impersonate="no"
              ExeCommand="/quiet /norestart"
              Return="ignore" />
```

## Troubleshooting

### Build Issues

**Error: MongoDB installer not found**
- Run `npm run download:prerequisites` manually
- Check internet connection
- Verify MongoDB download URL is accessible

**Error: WiX compilation failed**
- Ensure WiX Toolset is installed (electron-builder includes it)
- Check `build/installer.wxs` for XML syntax errors
- Review electron-builder logs in console

### Installation Issues

**MongoDB doesn't install**
- Check if user has admin privileges
- Look in Windows Event Viewer for MSI installation logs
- MongoDB might already be installed (check Services)

**Service doesn't start automatically**
- Check Windows Services for MongoDB/MongoDBServer
- Verify service startup type is "Automatic"
- Check MongoDB logs in `C:\Program Files\MongoDB\Server\<version>\log`

## Technical Details

### MSI Package Size

- Base application: ~200 MB (includes Node.js, Electron, dependencies)
- MongoDB installer: ~300 MB
- **Total MSI size: ~500 MB**

### Installation Time

- File extraction: 10-30 seconds
- MongoDB installation: 30-60 seconds
- Service configuration: 5-10 seconds
- **Total: 1-2 minutes** (depending on hardware)

### Upgrade Behavior

The installer uses a fixed `upgradeCode` to support upgrades:
- Newer versions automatically uninstall previous versions
- User data and MongoDB database are preserved
- `.env` file is preserved across upgrades

## Comparison with Previous Approach

### Old Approach (Post-Install Script)
- ❌ Required winget to be available
- ❌ Downloaded MongoDB after installation
- ❌ Could fail if internet connection lost
- ❌ User might close installer before setup completes
- ✅ Smaller MSI download size

### New Approach (Bundled Installer)
- ✅ All prerequisites bundled in MSI
- ✅ Works offline after downloading MSI once
- ✅ Guaranteed to have MongoDB installer
- ✅ Professional installation experience
- ✅ Single-step installation
- ❌ Larger MSI download size (~500 MB vs ~200 MB)

## License Considerations

MongoDB Community Server is licensed under SSPL (Server Side Public License). Bundling and redistributing it is permitted for this use case, but ensure compliance with MongoDB's licensing terms.

## References

- [WiX Toolset Documentation](https://wixtoolset.org/docs/)
- [Electron Builder - MSI Target](https://www.electron.build/configuration/msi)
- [MongoDB Download Center](https://www.mongodb.com/try/download/community)
