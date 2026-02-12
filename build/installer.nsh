; Custom NSIS script for Vira Villas Rooms
; Installer with MongoDB setup and backup/restore functionality

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; MongoDB configuration
!define MONGO_VERSION "8.0.4"
!define MONGO_DOWNLOAD_URL "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGO_VERSION}-signed.msi"

; ============================================================================
; Main Installation Logic
; ============================================================================
!macro customInstall
  DetailPrint "=== Starting Prerequisites Installation ==="

  ; Ask about restore ($R0 = restore path)
  MessageBox MB_YESNO "Do you want to restore from a previous backup?" IDYES AskRestorePath IDNO SkipRestore

  AskRestorePath:
  nsDialogs::SelectFolderDialog "Select backup directory" ""
  Pop $R0
  ${If} $R0 != error
    ${If} ${FileExists} "$R0\backup-manifest.json"
      DetailPrint "Will restore from: $R0"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Invalid backup directory. Could not find backup-manifest.json.$\r$\nSkipping restore."
      StrCpy $R0 ""
    ${EndIf}
  ${Else}
    StrCpy $R0 ""
  ${EndIf}

  SkipRestore:

  ; Step 1: Check if MongoDB is already installed
  DetailPrint "Checking for MongoDB..."
  nsExec::ExecToStack 'sc query MongoDB'
  Pop $0
  ${If} $0 != 0
    nsExec::ExecToStack 'sc query MongoDBServer'
    Pop $0
  ${EndIf}

  ${If} $0 == 0
    ; MongoDB already installed
    DetailPrint "MongoDB service found - skipping installation"
    Goto ConfigureService
  ${EndIf}

  ; Step 2: Install MongoDB from bundled installer
  DetailPrint "Installing MongoDB from bundled installer..."

  ${If} ${FileExists} "$INSTDIR\build\installers\mongodb-installer.msi"
    DetailPrint "Found bundled MongoDB installer"

    ; Install MongoDB silently
    nsExec::ExecToLog 'msiexec.exe /i "$INSTDIR\build\installers\mongodb-installer.msi" /qn ADDLOCAL=ServerService,Client SHOULD_INSTALL_COMPASS=0 /l*v "$INSTDIR\mongodb-install.log"'
    Pop $0

    ${If} $0 != 0
      DetailPrint "WARNING: MongoDB installation returned code $0"
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "MongoDB installation completed with warnings (code $0).$\r$\n$\r$\nThe application may not work correctly.$\r$\n$\r$\nClick OK to continue anyway, or Cancel to abort." IDOK ContinueAfterWarning
      Abort "Installation cancelled"

      ContinueAfterWarning:
    ${Else}
      DetailPrint "MongoDB installed successfully"
    ${EndIf}
  ${Else}
    DetailPrint "ERROR: Bundled MongoDB installer not found!"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "MongoDB installer not found in package.$\r$\n$\r$\nThe application requires MongoDB to function.$\r$\n$\r$\nClick OK to continue without MongoDB (you'll need to install it manually later),$\r$\nor Cancel to abort the installation." IDOK SkipMongo
    Abort "Installation cancelled"

    SkipMongo:
    Goto CreateEnv
  ${EndIf}

  ; Wait for service to register
  Sleep 3000

  ConfigureService:
  ; Step 4: Configure MongoDB service
  DetailPrint "Configuring MongoDB service..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | ForEach-Object { Set-Service $$_.Name -StartupType Automatic; Start-Service $$_.Name -ErrorAction SilentlyContinue }"'

  ; Set service recovery options (auto-restart on failure)
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$$svc = Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$svc) { sc.exe failure $$svc.Name reset= 86400 actions= restart/5000/restart/5000/restart/5000 }"'

  ; Wait for MongoDB to start
  Sleep 2000

  DetailPrint "MongoDB service configured"

  CreateEnv:
  ; Step 5: Create .env file from .env.example
  DetailPrint "Setting up environment configuration..."

  ${If} ${FileExists} "$INSTDIR\.env.example"
    ${IfNot} ${FileExists} "$INSTDIR\.env"
      CopyFiles "$INSTDIR\.env.example" "$INSTDIR\.env"
      DetailPrint "Created .env configuration file"
    ${EndIf}
  ${EndIf}

  ; Step 6: Restore backup if requested (using $R0 from earlier)
  ${If} $R0 != ""
    DetailPrint "Restoring database from backup..."
    CopyFiles "$INSTDIR\scripts\windows\restore-backup.ps1" "$TEMP\restore-backup.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\restore-backup.ps1" -BackupDir "$R0"'
    Pop $0
    Delete "$TEMP\restore-backup.ps1"

    ${If} $0 == 0
      DetailPrint "Database restored successfully"
      MessageBox MB_OK|MB_ICONINFORMATION "Database restored successfully from:$\r$\n$R0"
    ${Else}
      DetailPrint "WARNING: Database restore failed"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to restore database backup.$\r$\nYou may need to restore manually."
    ${EndIf}
  ${EndIf}

  DetailPrint "=== Prerequisites Installation Complete ==="
!macroend

; ============================================================================
; Uninstall Logic
; ============================================================================
!macro customUnInstall
  ; Ask about backup ($R1 = backup path)
  MessageBox MB_YESNO "Would you like to create a backup of your database before uninstalling?" IDYES AskBackupPath IDNO SkipBackup

  AskBackupPath:
  nsDialogs::SelectFolderDialog "Select backup destination" "$DOCUMENTS"
  Pop $R1
  ${If} $R1 != error
    DetailPrint "Creating database backup..."
    DetailPrint "Backup location: $R1"

    ; Create backup directory
    CreateDirectory "$R1"

    ; Copy backup script to temp and run it
    CopyFiles "$INSTDIR\scripts\windows\backup-database.ps1" "$TEMP\backup-database.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\backup-database.ps1" -BackupDir "$R1"'
    Pop $0
    Delete "$TEMP\backup-database.ps1"

    ${If} $0 == 0
      DetailPrint "Backup created successfully at: $R1"
      MessageBox MB_OK|MB_ICONINFORMATION "Database backup created successfully at:$\r$\n$\r$\n$R1"
    ${Else}
      DetailPrint "WARNING: Backup failed"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to create database backup.$\r$\nYou may need to backup manually."
    ${EndIf}
  ${EndIf}

  SkipBackup:

  DetailPrint "Uninstalling Vira Villas Rooms..."

  ; Note: We do NOT uninstall MongoDB as it may be used by other applications
  DetailPrint "Note: MongoDB was not uninstalled and can be removed manually if desired"
!macroend

; ============================================================================
; Custom Header
; ============================================================================
!macro customHeader
  ; Custom installer for Vira Villas Rooms
  ; Downloads and installs MongoDB during installation with backup/restore support
!macroend
