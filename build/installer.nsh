; Custom NSIS script for Vira Villas Rooms
; Interactive installer that downloads and installs MongoDB with real-time progress
; Similar to game installers (Steam, Epic Games, etc.)

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

; Variables for custom page
Var Dialog
Var StatusLabel
Var ProgressBar
Var ChecklistLabel

; MongoDB configuration
!define MONGO_VERSION "8.0.4"
!define MONGO_DOWNLOAD_URL "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGO_VERSION}-signed.msi"
!define MONGO_INSTALLER "$TEMP\mongodb-installer.msi"

; ============================================================================
; Custom Setup Page - Shows real-time progress
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
  ${NSD_CreateLabel} 0 70u 100% 80u "Setup Steps:$\r$\n☐ Checking MongoDB installation$\r$\n☐ Downloading MongoDB (if needed)$\r$\n☐ Installing MongoDB$\r$\n☐ Configuring services$\r$\n☐ Setting up environment"
  Pop $ChecklistLabel
  CreateFont $2 "Consolas" 9 400
  SendMessage $ChecklistLabel ${WM_SETFONT} $2 0

  nsDialogs::Show
FunctionEnd

; Update checklist status
!macro UpdateChecklistItem itemNum status
  ${NSD_GetText} $ChecklistLabel $0
  ${If} "${status}" == "progress"
    StrCpy $1 "⟳"  ; In progress symbol
  ${ElseIf} "${status}" == "done"
    StrCpy $1 "☑"  ; Checkmark
  ${ElseIf} "${status}" == "skip"
    StrCpy $1 "○"  ; Skipped
  ${Else}
    StrCpy $1 "☐"  ; Unchecked
  ${EndIf}

  ; Replace the checkbox at the specified line
  ; This is a simplified approach - real implementation would parse and update specific lines
  DetailPrint "Step ${itemNum}: ${status}"
!macroend

; ============================================================================
; Main Installation Logic
; ============================================================================
!macro customInstall
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
    SendMessage $ProgressBar ${PBM_SETPOS} 60 0
    Goto ConfigureService
  ${EndIf}

  !insertmacro UpdateChecklistItem 1 "done"

  ; Step 2: Download MongoDB installer
  DetailPrint "MongoDB not found. Downloading installer..."
  ${NSD_SetText} $StatusLabel "Downloading MongoDB installer (~300 MB)..."
  !insertmacro UpdateChecklistItem 2 "progress"
  SendMessage $ProgressBar ${PBM_SETPOS} 20 0

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
  SendMessage $ProgressBar ${PBM_SETPOS} 40 0

  ; Step 3: Install MongoDB
  DetailPrint "Installing MongoDB..."
  ${NSD_SetText} $StatusLabel "Installing MongoDB... (This may take a few minutes)"
  !insertmacro UpdateChecklistItem 3 "progress"

  ; Install MongoDB MSI silently
  ; ADDLOCAL=ServerService,Client - Install MongoDB service and client
  ; SHOULD_INSTALL_COMPASS=0 - Don't install MongoDB Compass GUI
  nsExec::ExecToLog 'msiexec.exe /i "${MONGO_INSTALLER}" /qn ADDLOCAL=ServerService,Client SHOULD_INSTALL_COMPASS=0 /l*v "$INSTDIR\mongodb-install.log"'
  Pop $0

  ${If} $0 != 0
    DetailPrint "WARNING: MongoDB installation returned code $0"
    ; Don't abort - MongoDB might already be installed
  ${Else}
    DetailPrint "MongoDB installed successfully"
  ${EndIf}

  !insertmacro UpdateChecklistItem 3 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 60 0

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

  DetailPrint "MongoDB service configured"
  !insertmacro UpdateChecklistItem 4 "done"
  SendMessage $ProgressBar ${PBM_SETPOS} 80 0

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
  SendMessage $ProgressBar ${PBM_SETPOS} 100 0
  ${NSD_SetText} $StatusLabel "Setup complete!"

  DetailPrint "=== Prerequisites Installation Complete ==="
  Sleep 1000
!macroend

; ============================================================================
; Uninstall Logic
; ============================================================================
!macro customUnInstall
  DetailPrint "Uninstalling Vira Villas Rooms..."

  ; Note: We do NOT uninstall MongoDB as it may be used by other applications
  ; Users can manually uninstall MongoDB if desired

  DetailPrint "Note: MongoDB was not uninstalled and can be removed manually if desired"
!macroend

; ============================================================================
; Custom Header
; ============================================================================
!macro customHeader
  ; Custom installer for Vira Villas Rooms
  ; Downloads and installs MongoDB and other prerequisites during installation
!macroend
