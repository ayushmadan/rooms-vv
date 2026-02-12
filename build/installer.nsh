; Custom NSIS script for Vira Villas Rooms
; Interactive installer with MongoDB setup and backup/restore functionality
; Similar to professional game installers (Steam, Epic Games, etc.)

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

; Variables for custom pages
Var Dialog
Var StatusLabel
Var ProgressBar
Var ChecklistLabel
Var RestoreCheckbox
Var RestorePath
Var RestorePathText
Var BackupPath
Var BackupCheckbox
Var ShouldRestore
Var ShouldBackup

; MongoDB configuration
!define MONGO_VERSION "8.0.4"
!define MONGO_DOWNLOAD_URL "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGO_VERSION}-signed.msi"
!define MONGO_INSTALLER "$TEMP\mongodb-installer.msi"
!define MONGO_URI "mongodb://127.0.0.1:27017/roomsvv"

; ============================================================================
; Restore Page - Ask user if they want to restore from backup
; ============================================================================
Function RestoreBackupPage
  nsDialogs::Create 1018
  Pop $Dialog

  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Title
  ${NSD_CreateLabel} 0 0 100% 20u "Database Restore"
  Pop $0
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0

  ; Description
  ${NSD_CreateLabel} 0 25u 100% 20u "Do you want to restore from a previous backup?"
  Pop $0

  ; Checkbox
  ${NSD_CreateCheckbox} 0 50u 100% 12u "Restore from backup"
  Pop $RestoreCheckbox
  ${NSD_OnClick} $RestoreCheckbox RestoreCheckboxClick

  ; Path label
  ${NSD_CreateLabel} 10u 70u 80u 12u "Backup directory:"
  Pop $0

  ; Path text box
  ${NSD_CreateText} 90u 70u 150u 12u ""
  Pop $RestorePathText
  EnableWindow $RestorePathText 0

  ; Browse button
  ${NSD_CreateButton} 245u 69u 50u 14u "Browse..."
  Pop $0
  ${NSD_OnClick} $0 BrowseRestoreDir
  EnableWindow $0 0
  StrCpy $R9 $0  ; Store button handle

  nsDialogs::Show
FunctionEnd

; Handle restore checkbox click
Function RestoreCheckboxClick
  Pop $0
  ${NSD_GetState} $RestoreCheckbox $1
  ${If} $1 == ${BST_CHECKED}
    EnableWindow $RestorePathText 1
    EnableWindow $R9 1  ; Enable browse button
  ${Else}
    EnableWindow $RestorePathText 0
    EnableWindow $R9 0
    ${NSD_SetText} $RestorePathText ""
  ${EndIf}
FunctionEnd

; Browse for restore directory
Function BrowseRestoreDir
  nsDialogs::SelectFolderDialog "Select backup directory" ""
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $RestorePathText $0
    StrCpy $RestorePath $0
  ${EndIf}
FunctionEnd

; Save restore page data
Function RestoreBackupPageLeave
  ${NSD_GetState} $RestoreCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_GetText} $RestorePathText $RestorePath
    ${If} $RestorePath == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please select a backup directory or uncheck the restore option."
      Abort
    ${EndIf}
    ${If} ${FileExists} "$RestorePath\backup-manifest.json"
      StrCpy $ShouldRestore "1"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Invalid backup directory. Could not find backup-manifest.json."
      Abort
    ${EndIf}
  ${Else}
    StrCpy $ShouldRestore "0"
  ${EndIf}
FunctionEnd

; ============================================================================
; Setup Prerequisites Page - Shows real-time progress
; ============================================================================
Function SetupPrerequisitesPage
  nsDialogs::Create 1018
  Pop $Dialog

  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Title label
  ${NSD_CreateLabel} 0 0 100% 20u "Setting up prerequisites..."
  Pop $0
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0

  ; Status label
  ${NSD_CreateLabel} 0 30u 100% 12u "Preparing installation..."
  Pop $StatusLabel

  ; Progress bar
  ${NSD_CreateProgressBar} 0 50u 100% 12u ""
  Pop $ProgressBar

  ; Checklist label
  ${NSD_CreateLabel} 0 70u 100% 80u "Setup Steps:$\r$\n☐ Checking MongoDB installation$\r$\n☐ Downloading MongoDB (if needed)$\r$\n☐ Installing MongoDB$\r$\n☐ Configuring services$\r$\n☐ Setting up environment$\r$\n☐ Restoring backup (if selected)"
  Pop $ChecklistLabel
  CreateFont $2 "Consolas" 9 400
  SendMessage $ChecklistLabel ${WM_SETFONT} $2 0

  nsDialogs::Show
FunctionEnd

; Update checklist status
!macro UpdateChecklistItem itemNum status
  DetailPrint "Step ${itemNum}: ${status}"
!macroend

; ============================================================================
; Main Installation Logic
; ============================================================================
!macro customInstall
  ; Show restore page first
  Call RestoreBackupPage
  Call RestoreBackupPageLeave

  ; Show the custom setup page
  Call SetupPrerequisitesPage

  DetailPrint "=== Starting Prerequisites Installation ==="
  ${NSD_SetText} $StatusLabel "Checking for MongoDB..."
  SendMessage $ProgressBar ${PBM_SETPOS} 10 0

  ; Step 1: Check if MongoDB is already installed
  !insertmacro UpdateChecklistItem 1 "progress"
  nsExec::ExecToStack 'sc query MongoDB'
  Pop $0
  ${If} $0 != 0
    nsExec::ExecToStack 'sc query MongoDBServer'
    Pop $0
  ${EndIf}

  ${If} $0 == 0
    ; MongoDB already installed
    DetailPrint "MongoDB service found - skipping installation"
    ${NSD_SetText} $StatusLabel "MongoDB already installed"
    !insertmacro UpdateChecklistItem 1 "done"
    !insertmacro UpdateChecklistItem 2 "skip"
    !insertmacro UpdateChecklistItem 3 "skip"
    SendMessage $ProgressBar ${PBM_SETPOS} 50 0
    Goto ConfigureService
  ${EndIf}

  !insertmacro UpdateChecklistItem 1 "done"

  ; Step 2: Download MongoDB installer
  DetailPrint "MongoDB not found. Downloading installer..."
  ${NSD_SetText} $StatusLabel "Downloading MongoDB installer (~300 MB)..."
  !insertmacro UpdateChecklistItem 2 "progress"
  SendMessage $ProgressBar ${PBM_SETPOS} 15 0

  ; Download using PowerShell with progress
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = ''SilentlyContinue''; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host ''Downloading MongoDB...''; try { Invoke-WebRequest -Uri ''${MONGO_DOWNLOAD_URL}'' -OutFile ''${MONGO_INSTALLER}'' -UseBasicParsing; Write-Host ''Download complete''; exit 0 } catch { Write-Host ''Download failed: $($_)''; exit 1 }"'
  Pop $0

  ${If} $0 != 0
    DetailPrint "ERROR: Failed to download MongoDB installer"
    ${NSD_SetText} $StatusLabel "Failed to download MongoDB. Please check your internet connection."
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Failed to download MongoDB installer.$\r$\n$\r$\nThe application requires MongoDB to function.$\r$\n$\r$\nClick OK to continue without MongoDB (you'll need to install it manually later),$\r$\nor Cancel to abort the installation." IDOK SkipMongo
    Abort "Installation cancelled"

    SkipMongo:
    !insertmacro UpdateChecklistItem 2 "skip"
    !insertmacro UpdateChecklistItem 3 "skip"
    !insertmacro UpdateChecklistItem 4 "skip"
    Goto CreateEnv
  ${EndIf}

  !insertmacro UpdateChecklistItem 2 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 30 0

  ; Step 3: Install MongoDB
  DetailPrint "Installing MongoDB..."
  ${NSD_SetText} $StatusLabel "Installing MongoDB... (This may take a few minutes)"
  !insertmacro UpdateChecklistItem 3 "progress"

  ; Install MongoDB MSI silently
  nsExec::ExecToLog 'msiexec.exe /i "${MONGO_INSTALLER}" /qn ADDLOCAL=ServerService,Client SHOULD_INSTALL_COMPASS=0 /l*v "$INSTDIR\mongodb-install.log"'
  Pop $0

  ${If} $0 != 0
    DetailPrint "WARNING: MongoDB installation returned code $0"
  ${Else}
    DetailPrint "MongoDB installed successfully"
  ${EndIf}

  !insertmacro UpdateChecklistItem 3 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 50 0

  ; Clean up installer
  Delete "${MONGO_INSTALLER}"

  ; Wait for service to register
  Sleep 3000

  ConfigureService:
  ; Step 4: Configure MongoDB service
  DetailPrint "Configuring MongoDB service..."
  ${NSD_SetText} $StatusLabel "Configuring MongoDB service..."
  !insertmacro UpdateChecklistItem 4 "progress"

  ; Set MongoDB service to start automatically and start it
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | ForEach-Object { Set-Service $_.Name -StartupType Automatic; Start-Service $_.Name -ErrorAction SilentlyContinue }"'

  ; Set service recovery options (auto-restart on failure)
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$svc = Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | Select-Object -First 1; if ($svc) { sc.exe failure $svc.Name reset= 86400 actions= restart/5000/restart/5000/restart/5000 }"'

  ; Wait for MongoDB to start
  Sleep 2000

  DetailPrint "MongoDB service configured"
  !insertmacro UpdateChecklistItem 4 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 70 0

  CreateEnv:
  ; Step 5: Create .env file from .env.example
  DetailPrint "Setting up environment configuration..."
  ${NSD_SetText} $StatusLabel "Setting up environment..."
  !insertmacro UpdateChecklistItem 5 "progress"

  ${If} ${FileExists} "$INSTDIR\.env.example"
    ${IfNot} ${FileExists} "$INSTDIR\.env"
      CopyFiles "$INSTDIR\.env.example" "$INSTDIR\.env"
      DetailPrint "Created .env configuration file"
    ${EndIf}
  ${EndIf}

  !insertmacro UpdateChecklistItem 5 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 85 0

  ; Step 6: Restore backup if requested
  ${If} $ShouldRestore == "1"
    DetailPrint "Restoring database from backup..."
    ${NSD_SetText} $StatusLabel "Restoring database backup..."
    !insertmacro UpdateChecklistItem 6 "progress"

    ; Copy restore script to temp and run it
    CopyFiles "$INSTDIR\scripts\windows\restore-backup.ps1" "$TEMP\restore-backup.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\restore-backup.ps1" -BackupDir "$RestorePath"'
    Pop $0
    Delete "$TEMP\restore-backup.ps1"

    ${If} $0 == 0
      DetailPrint "Database restored successfully"
      !insertmacro UpdateChecklistItem 6 "done"
    ${Else}
      DetailPrint "WARNING: Database restore failed"
      !insertmacro UpdateChecklistItem 6 "failed"
    ${EndIf}
  ${Else}
    !insertmacro UpdateChecklistItem 6 "skip"
  ${EndIf}

  SendMessage $ProgressBar ${PBM_SETPOS} 100 0
  ${NSD_SetText} $StatusLabel "Setup complete!"

  DetailPrint "=== Prerequisites Installation Complete ==="
  Sleep 1000
!macroend

; ============================================================================
; Uninstall Backup Page
; ============================================================================
Function un.BackupDatabasePage
  nsDialogs::Create 1018
  Pop $Dialog

  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Title
  ${NSD_CreateLabel} 0 0 100% 20u "Database Backup"
  Pop $0
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0

  ; Description
  ${NSD_CreateLabel} 0 25u 100% 20u "Would you like to create a backup of your database before uninstalling?"
  Pop $0

  ; Checkbox
  ${NSD_CreateCheckbox} 0 50u 100% 12u "Create database backup"
  Pop $BackupCheckbox
  ${NSD_OnClick} $BackupCheckbox un.BackupCheckboxClick

  ; Path label
  ${NSD_CreateLabel} 10u 70u 80u 12u "Backup directory:"
  Pop $0

  ; Path text box
  ${NSD_CreateText} 90u 70u 150u 12u "$DOCUMENTS\Vira Villas Rooms Backup"
  Pop $RestorePathText
  EnableWindow $RestorePathText 0

  ; Browse button
  ${NSD_CreateButton} 245u 69u 50u 14u "Browse..."
  Pop $0
  ${NSD_OnClick} $0 un.BrowseBackupDir
  EnableWindow $0 0
  StrCpy $R9 $0  ; Store button handle

  nsDialogs::Show
FunctionEnd

; Handle backup checkbox click
Function un.BackupCheckboxClick
  Pop $0
  ${NSD_GetState} $BackupCheckbox $1
  ${If} $1 == ${BST_CHECKED}
    EnableWindow $RestorePathText 1
    EnableWindow $R9 1
  ${Else}
    EnableWindow $RestorePathText 0
    EnableWindow $R9 0
  ${EndIf}
FunctionEnd

; Browse for backup directory
Function un.BrowseBackupDir
  nsDialogs::SelectFolderDialog "Select backup destination" "$DOCUMENTS"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $RestorePathText $0
    StrCpy $BackupPath $0
  ${EndIf}
FunctionEnd

; Save backup page data
Function un.BackupDatabasePageLeave
  ${NSD_GetState} $BackupCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_GetText} $RestorePathText $BackupPath
    StrCpy $ShouldBackup "1"
  ${Else}
    StrCpy $ShouldBackup "0"
  ${EndIf}
FunctionEnd

; ============================================================================
; Uninstall Logic
; ============================================================================
!macro customUnInstall
  ; Show backup page
  Call un.BackupDatabasePage
  Call un.BackupDatabasePageLeave

  ; Create backup if requested
  ${If} $ShouldBackup == "1"
    DetailPrint "Creating database backup..."
    DetailPrint "Backup location: $BackupPath"

    ; Create backup directory
    CreateDirectory "$BackupPath"

    ; Copy backup script to temp and run it
    CopyFiles "$INSTDIR\scripts\windows\backup-database.ps1" "$TEMP\backup-database.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\backup-database.ps1" -BackupDir "$BackupPath"'
    Pop $0
    Delete "$TEMP\backup-database.ps1"

    ${If} $0 == 0
      DetailPrint "Backup created successfully at: $BackupPath"
      MessageBox MB_OK|MB_ICONINFORMATION "Database backup created successfully at:$\r$\n$\r$\n$BackupPath"
    ${Else}
      DetailPrint "WARNING: Backup failed"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to create database backup.$\r$\nYou may need to backup manually."
    ${EndIf}
  ${EndIf}

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
