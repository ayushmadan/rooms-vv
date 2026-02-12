; Custom NSIS script for Vira Villas Rooms
; This installs MongoDB and other prerequisites during installation
; Similar to how games install DirectX, Visual C++ Runtime, etc.

; Include required NSIS libraries
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!macro customInstall
  DetailPrint "Checking for MongoDB installation..."

  ; Check if MongoDB service exists
  nsExec::ExecToStack 'sc query MongoDB'
  Pop $0
  ${If} $0 != 0
    nsExec::ExecToStack 'sc query MongoDBServer'
    Pop $0
  ${EndIf}

  ; If MongoDB not found, install it
  ${If} $0 != 0
    DetailPrint "MongoDB not found. Installing MongoDB..."
    DetailPrint "This may take a few minutes. Please wait..."

    ; Get the path to bundled MongoDB installer
    StrCpy $1 "$INSTDIR\resources\installers\mongodb-installer.msi"

    ; Check if MongoDB installer exists
    ${If} ${FileExists} "$1"
      DetailPrint "Running MongoDB installer..."

      ; Run MongoDB MSI installer silently
      ; ADDLOCAL=ServerService,Client - Install MongoDB service and client
      ; SHOULD_INSTALL_COMPASS=0 - Don't install MongoDB Compass GUI
      nsExec::ExecToLog 'msiexec.exe /i "$1" /qn ADDLOCAL=ServerService,Client SHOULD_INSTALL_COMPASS=0 /l*v "$INSTDIR\mongodb-install.log"'
      Pop $0

      ${If} $0 == 0
        DetailPrint "MongoDB installed successfully!"
      ${Else}
        DetailPrint "MongoDB installation completed with code: $0"
        DetailPrint "MongoDB may already be installed or installation was skipped"
      ${EndIf}

      ; Wait a bit for service to register
      Sleep 3000
    ${Else}
      DetailPrint "Warning: MongoDB installer not found at: $1"
      DetailPrint "MongoDB will need to be installed manually"
    ${EndIf}
  ${Else}
    DetailPrint "MongoDB service already installed. Skipping MongoDB installation."
  ${EndIf}

  ; Configure MongoDB service to start automatically
  DetailPrint "Configuring MongoDB service..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | ForEach-Object { Set-Service $_.Name -StartupType Automatic; Start-Service $_.Name -ErrorAction SilentlyContinue }"'

  ; Set service recovery options
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$svc = Get-Service -Name MongoDB,MongoDBServer -ErrorAction SilentlyContinue | Select-Object -First 1; if ($svc) { sc.exe failure $svc.Name reset= 86400 actions= restart/5000/restart/5000/restart/5000 }"'

  ; Create .env file from .env.example if it doesn't exist
  DetailPrint "Setting up environment configuration..."
  ${If} ${FileExists} "$INSTDIR\.env.example"
    ${IfNot} ${FileExists} "$INSTDIR\.env"
      CopyFiles "$INSTDIR\.env.example" "$INSTDIR\.env"
      DetailPrint "Created .env configuration file"
    ${EndIf}
  ${EndIf}

  DetailPrint "Setup complete!"
!macroend

!macro customUnInstall
  DetailPrint "Uninstalling Vira Villas Rooms..."

  ; Note: We do NOT uninstall MongoDB as it may be used by other applications
  ; Users can manually uninstall MongoDB if desired

  DetailPrint "Note: MongoDB was not uninstalled and can be removed manually if desired"
!macroend

; Custom header for installer
!macro customHeader
  ; Custom installer for Vira Villas Rooms
  ; Bundles MongoDB and other prerequisites
!macroend
