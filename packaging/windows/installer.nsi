; node-hp-scan-to - dual mode Windows installer (NSIS 3.x)
;
; Build (from packaging/windows/):
;   makensis -DVERSION=1.2.3 installer.nsi
;
; Expected staging layout next to this script:
;   staging\node-hp-scan-to.exe      (bun compiled binary)
;   staging\WinSW-x64.exe            (https://github.com/winsw/winsw)

Unicode true
ManifestDPIAware true
RequestExecutionLevel highest
SetCompressor /SOLID lzma

!define APPNAME "node-hp-scan-to"
; no branding beyond the project name: "HP ..." would look like an
; HP Inc. product - nominative/descriptive use only stays safe
!define DISPLAY "${APPNAME}"
!define PUBLISHER "Emmanuel Counasse"

!ifndef VERSION
  !define VERSION "0.0.0-dev"
!endif

Name "${DISPLAY}"
OutFile "..\..\release\setup-${APPNAME}-v${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"

!define MUI_ICON "..\..\assets\icon.ico"
!define MUI_UNICON "..\..\assets\icon.ico"

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"

${StrRep}
${StrLoc}


!ifndef WS_GROUP
  !define WS_GROUP 0x00020000
!endif

Var Mode              ; "user" | "system"
Var CmdlineSystemMode ; set when relaunched elevated with /SYSTEM_MODE
Var ConfigDir
Var ScansDir
Var RadioUser
Var RadioSystem

; device selection page state
Var DeviceChoice      ; "name" | "ip" | "skip"
Var DevName
Var DevIp
Var DeviceRaw         ; raw stdout of the discover run
Var DeviceCount       ; number of parsed devices
Var DeviceShown       ; number of rendered device radios
Var RadioTmp          ; scratch handle holder for NSD_GetState
Var YPos              ; dynamic vertical layout cursor
Var Status            ; outcome of the discovery, shown at the top of the page
Var DiscDir           ; LOCALAPPDATA dir hosting the discovery binary
Var RadioByName
Var RadioByIp
Var RadioOther
Var RadioLater
Var EditOther
Var EditIp

; startup behaviour
Var RunArgs           ; arguments passed to node-hp-scan-to at boot
Var RadioListen
Var RadioAdf

!define MUI_ABORTWARNING

; documentation opened from the Finish page (swap for a dedicated docs site when available)
!define DOC_URL "https://manuc66.github.io/node-hp-scan-to/"

; non-endorsement / trademark / license notice, shown on the welcome page
!define MUI_WELCOMEPAGE_TEXT \
  "This wizard installs node-hp-scan-to, a free (MIT) community tool$\n\
   that scans documents from your network printer to this computer.$\n$\n\
   This is an independent project: it is NOT built by, endorsed by or$\n\
   affiliated with HP Inc. $\"HP$\" and related marks are trademarks of their$\n\
   respective owners, referenced here descriptively only.$\n$\n\
   By continuing you accept the MIT license terms shown next."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\..\LICENSE"

; Finish page: link to the docs plus an optional "edit the config" shortcut
; (notepad.exe is used as a plain text editor, safe everywhere)
!define MUI_FINISHPAGE_LINK "Open the node-hp-scan-to documentation"
!define MUI_FINISHPAGE_LINK_LOCATION "${DOC_URL}"
!define MUI_FINISHPAGE_RUN "notepad.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "$\"$ConfigDir\default.json$\""
!define MUI_FINISHPAGE_RUN_TEXT "Open the configuration file for editing"
!define MUI_FINISHPAGE_RUN_CHECKED
Page custom ModePageCreate ModePageLeave
Page custom DevicePageCreate DevicePageLeave
Page custom StartupPageCreate StartupPageLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------------------
; mode presets

!macro _InitUserMode
  StrCpy $Mode "user"
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${APPNAME}"
  StrCpy $ConfigDir "$APPDATA\${APPNAME}\config"
  ; resolved while shell context is still "current": follows Documents
  ; redirection (e.g. OneDrive)
  StrCpy $ScansDir "$DOCUMENTS\hp-scan"
!macroend

!macro _InitSystemMode
  StrCpy $Mode "system"
  StrCpy $INSTDIR "$PROGRAMFILES64\${APPNAME}"
  StrCpy $ConfigDir "$COMMONPROGRAMDATA\${APPNAME}\config"
  StrCpy $ScansDir "$COMMONPROGRAMDATA\${APPNAME}\scans"
!macroend

; convert backslashes to forward slashes (top of stack), so paths are valid JSON
Function _ToJsonPath
  Pop $R0
  ${StrRep} $R0 "$R0" "\" "/"
  Push $R0
FunctionEnd

Function .onInit
  StrCpy $CmdlineSystemMode ""
  ${GetOptions} "$CMDLINE" "/SYSTEM_MODE" $R0
  ${IfNot} ${Errors}
    StrCpy $CmdlineSystemMode "1"
  ${EndIf}
  StrCpy $DeviceChoice "skip"
  StrCpy $DevName ""
  StrCpy $DevIp ""
  StrCpy $RunArgs "listen --health-check"
  ; /ADF switches the startup behaviour in silent installs
  ${GetOptions} "$CMDLINE" "/ADF" $R0
  ${IfNot} ${Errors}
    StrCpy $RunArgs "adf-autoscan --health-check"
  ${EndIf}
  ; silent installs skip pages entirely, so the preset must be decided here
  ${If} $CmdlineSystemMode == "1"
    !insertmacro _InitSystemMode
  ${Else}
    !insertmacro _InitUserMode
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; mode selection page

Function ModePageCreate
  ${If} $CmdlineSystemMode == "1"
    Abort ; skip selection, we relaunched elevated ourselves (preset already applied)
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT \
    "Choose installation type" \
    "How should HP Scan to Computer be installed?"

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 32u \
    "Recommended: install for the current user. Scans land in your own profile folder$\nand scanning starts automatically when you log in."
  Pop $0

  ${NSD_CreateRadioButton} 8u 40u 90% 12u \
    "For me (no administrator rights required)"
  Pop $RadioUser
  ${NSD_AddStyle} $RadioUser ${WS_GROUP}
  ${NSD_SetState} $RadioUser ${BST_CHECKED}

  ${NSD_CreateRadioButton} 8u 60u 90% 12u \
    "Windows service for all users (requires administrator rights)"
  Pop $RadioSystem

  nsDialogs::Show
FunctionEnd

Function ModePageLeave
  ${NSD_GetState} $RadioSystem $0
  ${If} $0 == ${BST_CHECKED}
    !insertmacro _InitSystemMode
  ${Else}
    !insertmacro _InitUserMode
  ${EndIf}

  ${If} $Mode == "system"
    ; verify we can write outside protected locations, i.e. we are elevated;
    ; otherwise relaunch ourselves elevated and bail out of this instance
    ClearErrors
    CreateDirectory "$INSTDIR"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Administrator rights are required for the Windows service mode.$\nThe installer will now restart elevated."
      StrCpy $0 "/SYSTEM_MODE"
      ${If} $RunArgs == "adf-autoscan --health-check"
        StrCpy $0 "/SYSTEM_MODE /ADF"
      ${EndIf}
      ExecShell "runas" "$EXEPATH" "$0"
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; startup behaviour page (after the printer is known)

Function StartupPageCreate
  !insertmacro MUI_HEADER_TEXT \
    "Startup behaviour" \
    "What should node-hp-scan-to do once running?"

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 20u \
    "Both options keep watching the selected printer until stopped."
  Pop $0

  ${NSD_CreateRadioButton} 8u 28u 90% 10u \
    "Wait for scan jobs started from the printer panel"
  Pop $RadioListen
  ${NSD_AddStyle} $RadioListen ${WS_GROUP}
  ${NSD_SetState} $RadioListen ${BST_CHECKED}

  ${NSD_CreateRadioButton} 8u 44u 90% 10u \
    "Scan automatically when paper is loaded in the feeder (adf-autoscan)"
  Pop $RadioAdf

  ; reflect the preset (silent /ADF flag survives elevated relaunches)
  ${If} $RunArgs == "adf-autoscan --health-check"
    ${NSD_SetState} $RadioAdf ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function StartupPageLeave
  ${NSD_GetState} $RadioAdf $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $RunArgs "adf-autoscan --health-check"
  ${Else}
    StrCpy $RunArgs "listen --health-check"
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; device selection page

!macro _CtrlEnable CTRL ENABLE
  System::Call "user32::EnableWindow(p${CTRL}, i${ENABLE})"
!macroend

; The compiled binary listens for mDNS answers, which trips the Windows
; Firewall "allow access" dialog over the installer UI while nsExec waits -
; experienced as a freeze, and skipping it silently kills discovery.
; While elevated, whitelist the scratch copy for a moment; best effort only
; (a non-elevated user install simply keeps the native prompt).
!define FW_TEMP_RULE "node-hp-scan-to-setup-discovery"

Function _FwDiscoveryAllow
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${FW_TEMP_RULE}"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="${FW_TEMP_RULE}" dir=in action=allow program="$DiscDir\node-hp-scan-to.exe" enable=yes profile=private'
  Pop $0
FunctionEnd

Function _FwDiscoveryRemove
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${FW_TEMP_RULE}"'
  Pop $0
FunctionEnd

; parse $DeviceRaw ("name\tip" lines, \r\n separated) into
; $DiscDir\devices.ini ([d] <index> = <ip>|<display>) and set $DeviceCount
Function _ParseDevices
  StrCpy $DeviceCount 0
  Delete "$DiscDir\devices.ini"
  StrCpy $R2 "$DeviceRaw"
  ${Do}
    ${If} "$R2" == ""
      ${Break}
    ${EndIf}
    ; cut the first line off (handle both \n and \r\n endings)
    ${StrLoc} "$R3" "$R2" "$\n" "0"
    ${If} "$R3" == ""
      StrCpy $R1 "$R2"
      StrCpy $R2 ""
    ${Else}
      ${If} $R3 > 0
        StrCpy $R1 "$R2" $R3
      ${Else}
        StrCpy $R1 ""
      ${EndIf}
      IntOp $R4 "$R3" + 1
      StrCpy $R2 "$R2" "" $R4
    ${EndIf}
    ${StrRep} "$R1" "$R1" "$\r" ""

    ; split "name<TAB>ip", skip malformed lines
    StrCpy $R9 0                  ; 1 = valid entry
    ${StrLoc} "$R5" "$R1" "$\t" "0"
    ${If} "$R5" != ""
      ${If} $R5 > 0
        StrCpy $R9 1
        StrCpy $R6 "$R1" $R5      ; device name
        IntOp $R7 "$R5" + 1
        StrCpy $R8 "$R1" "" $R7   ; ip
      ${EndIf}
    ${EndIf}

    ${If} $R9 == 1
      WriteIniStr "$DiscDir\devices.ini" "d" "$DeviceCount" "$R8|$R6 ($R8)"
      IntOp $DeviceCount "$DeviceCount" + 1
    ${EndIf}
  ${Loop}
FunctionEnd

Function OnOtherClick
  ${NSD_GetState} $RadioOther $0
  ${If} $0 == ${BST_CHECKED}
    !insertmacro _CtrlEnable $EditOther 1
  ${Else}
    !insertmacro _CtrlEnable $EditOther 0
  ${EndIf}
FunctionEnd

; -------------------------------------------------------------------
; device selection page (synchronous discovery)

Function _RunDiscovery
  ; Extract to LOCALAPPDATA, not PLUGINSDIR (%TEMP%): WDAC/Device Guard
  ; policies on managed machines typically block execution from Temp but
  ; allow the user profile, so discovery keeps working on such hosts.
  StrCpy $DiscDir "$LOCALAPPDATA\node-hp-scan-to-setup"
  CreateDirectory "$DiscDir"
  ; use a private extraction dir to avoid clobbering a running instance
  SetOutPath "$DiscDir"
  File "/oname=node-hp-scan-to.exe" "staging\node-hp-scan-to.exe"
  Call _FwDiscoveryAllow
  nsExec::ExecToStack '"$DiscDir\node-hp-scan-to.exe" discover --timeout 5'
  Call _FwDiscoveryRemove
FunctionEnd

; read a whole text file onto the stack (path in, contents out)
Function _SlurpFile
  Pop $R8
  ClearErrors
  FileOpen $R7 "$R8" r
  ${If} ${Errors}
    Push ""
    Return
  ${EndIf}
  StrCpy $R9 ""
  ${Do}
    FileRead $R7 $R6
    ${If} ${Errors}
      ${Break}
    ${EndIf}
    StrCpy $R9 "$R9$R6"
  ${Loop}
  FileClose $R7
  Push $R9
FunctionEnd

Function DevicePageCreate
  !insertmacro MUI_HEADER_TEXT \
    "Select your printer" \
    "The printer can be located by name (recommended) or by fixed IP address."

  ; discovery happens up-front; the wizard progress bar covers the wait
  Call _RunDiscovery
  Pop $R0                       ; exit code
  Pop $DeviceRaw                ; stdout

  ; on failure, persist what we have to a temp log the user can attach
  Push "$DeviceRaw"
  Call _SlurpFile
  Pop $R1
  ${If} $R0 != 0
    FileOpen $1 "$TEMP\node-hp-scan-to-discovery.log" w
    FileWrite $1 "exit code: $R0$\r$\n$\r$\n--- stdout ---$\r$\n"
    FileWrite $1 "$R1$\r$\n"
    FileWrite $1 "--- end ---$\r$\n"
    FileClose $1
  ${EndIf}

  ${If} $R0 == 0
    Call _ParseDevices
  ${Else}
    StrCpy $DeviceCount 0
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 18u \
    "Detected printers are listed below. Locating the printer by name keeps working even when its IP address changes."
  Pop $0

  ; status line - shows the outcome of the discovery and, on failure,
  ; the path to the diagnostic log written for support
  ${NSD_CreateLabel} 8u 22u 96% 36u \
    "Detection finished - select your printer below or pick another option."
  Pop $Status
  ${If} $R0 == 0
    ${If} $DeviceCount == 0
      ${NSD_SetText} $Status \
        "No scan-capable printer was detected. Configure it manually below."
    ${Else}
      ${NSD_SetText} $Status \
        "Detection finished - select your printer among those found below."
    ${EndIf}
  ${Else}
    ${NSD_SetText} $Status \
      "Printer detection failed (code $R0). You can configure the printer manually below or pick Configure later.$\n$\nDiagnostic log: $TEMP\node-hp-scan-to-discovery.log"
  ${EndIf}

  ; one radio button per discovered device (first four)
  StrCpy $DeviceShown 0
  StrCpy $R9 0
  ${Do}
    ${If} $R9 >= $DeviceCount
      ${Break}
    ${EndIf}
    ${If} $R9 >= 4
      ${Break}
    ${EndIf}
    ReadIniStr $R8 "$DiscDir\devices.ini" "d" "$R9"
    ${StrLoc} "$R5" "$R8" "|" "0"
    ${If} "$R5" != ""
      IntOp $R7 "$R5" + 1
      StrCpy $R6 "$R8" "" $R7          ; display part
      IntOp $0 "$R9" * 11
      IntOp $0 "$0" + 68               ; vertical position in dialog units
      StrCpy $1 "$0"
      StrCpy $1 "$1u"
      ${NSD_CreateRadioButton} 8u "$1" 90% 10u "$R6"
      Pop $RadioTmp
      WriteIniStr "$DiscDir\devices.ini" "h" "$R9" "$RadioTmp"
      ${If} $R9 == 0
        ${NSD_AddStyle} $RadioTmp ${WS_GROUP}
        ${NSD_SetState} $RadioTmp ${BST_CHECKED}
      ${EndIf}
      IntOp $DeviceShown "$DeviceShown" + 1
    ${EndIf}
    IntOp $R9 "$R9" + 1
  ${Loop}

  ; fixed controls below the device list: positions are computed from the
  ; actual number of devices so the gap stays small
  IntOp $YPos "$DeviceShown" * 11
  IntOp $YPos "$YPos" + 68

  StrCpy $1 "$YPos"
  StrCpy $1 "$1u"
  ${NSD_CreateRadioButton} 8u "$1" 90% 10u \
    "Use the selected printer by name (recommended)"
  Pop $RadioByName
  ; WS_GROUP opens a second radio group: name/ip is an attribute of the
  ; device picked above, it must not unselect it (and vice versa)
  ${NSD_AddStyle} $RadioByName ${WS_GROUP}
  ${NSD_SetState} $RadioByName ${BST_CHECKED}

  IntOp $YPos "$YPos" + 11
  StrCpy $1 "$YPos"
  StrCpy $1 "$1u"
  ${NSD_CreateRadioButton} 8u "$1" 60% 10u \
    "Pin by fixed IP address (manual):"
  Pop $RadioByIp
  ${NSD_CreateText} 68% "$1" 28% 12u ""
  Pop $EditIp

  IntOp $YPos "$YPos" + 12
  StrCpy $1 "$YPos"
  StrCpy $1 "$1u"
  ${NSD_CreateRadioButton} 8u "$1" 90% 10u \
    "Other - enter it manually:"
  Pop $RadioOther
  ${NSD_OnClick} $RadioOther OnOtherClick

  IntOp $YPos "$YPos" + 11
  StrCpy $1 "$YPos"
  StrCpy $1 "$1u"
  ${NSD_CreateText} 24u "$1" 74% 12u ""
  Pop $EditOther
  !insertmacro _CtrlEnable $EditOther 0

  IntOp $YPos "$YPos" + 16
  StrCpy $1 "$YPos"
  StrCpy $1 "$1u"
  ${NSD_CreateRadioButton} 8u "$1" 90% 10u \
    "Configure later (you will have to edit config\\default.json yourself)"
  Pop $RadioLater
  ${NSD_AddStyle} $RadioLater ${WS_GROUP}

  ${If} $DeviceShown == 0
    ${NSD_SetState} $RadioLater ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function DevicePageLeave
  ${NSD_GetState} $RadioLater $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DeviceChoice "skip"
    Return
  ${EndIf}

  ; "Pin by fixed IP" - standalone, no device selection required
  ${NSD_GetState} $RadioByIp $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_GetText} $EditIp $DevIp
    ${If} "$DevIp" == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Please enter the printer's IP address (IPv4 or IPv6)."
      Abort
    ${EndIf}
    Call _FwDiscoveryAllow
    nsExec::ExecToStack '"$DiscDir\node-hp-scan-to.exe" discover --timeout 4 --ip "$DevIp"'
    Call _FwDiscoveryRemove
    Pop $0
    Pop $R1                       ; discard captured stdout
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "No HP scan-capable device answered at $\"$DevIp$\".$\nCheck that the printer is powered on and connected to this network."
      Abort
    ${EndIf}
    StrCpy $DeviceChoice "ip"
    StrCpy $DevName ""            ; no mDNS name
    Return
  ${EndIf}

  ${NSD_GetState} $RadioOther $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_GetText} $EditOther $DevName
    ${If} "$DevName" == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "Please enter a device name or an IP address."
      Abort
    ${EndIf}

    ${StrRep} "$1" "$DevName" "." ""
    ${StrRep} "$1" "$1" "0" ""
    ${StrRep} "$1" "$1" "1" ""
    ${StrRep} "$1" "$1" "2" ""
    ${StrRep} "$1" "$1" "3" ""
    ${StrRep} "$1" "$1" "4" ""
    ${StrRep} "$1" "$1" "5" ""
    ${StrRep} "$1" "$1" "6" ""
    ${StrRep} "$1" "$1" "7" ""
    ${StrRep} "$1" "$1" "8" ""
    ${StrRep} "$1" "$1" "9" ""
    ${If} "$1" == ""
      StrCpy $DeviceChoice "ip"
      StrCpy $DevIp "$DevName"
      Call _FwDiscoveryAllow
nsExec::ExecToStack '"$DiscDir\node-hp-scan-to.exe" discover --timeout 4 --ip "$DevIp"'
      Call _FwDiscoveryRemove
    ${Else}
      StrCpy $DeviceChoice "name"
      Call _FwDiscoveryAllow
      nsExec::ExecToStack '"$DiscDir\node-hp-scan-to.exe" discover --timeout 4 --name "$DevName"'
      Call _FwDiscoveryRemove
    ${EndIf}
    Pop $0
    Pop $R1                       ; discard captured stdout
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "No HP scan-capable device answered at $\"$DevName$\".$\nCheck that the printer is powered on and connected to this network."
      Abort
    ${EndIf}
    Return
  ${EndIf}

  ; a discovered device radio is checked -> use its name (only "by name"
  ; remains in this group: pinning by IP is the dedicated radio above)
  StrCpy $R9 0
  ${Do}
    ${If} $R9 >= $DeviceShown
      ${Break}
    ${EndIf}
    ReadIniStr $RadioTmp "$DiscDir\devices.ini" "h" "$R9"
    ${NSD_GetState} $RadioTmp $0
    ${If} $0 == ${BST_CHECKED}
      ReadIniStr $R8 "$DiscDir\devices.ini" "d" "$R9"   ; ip|display
      ${StrLoc} "$R5" "$R8" "|" "0"
      ${If} "$R5" == ""
        MessageBox MB_OK|MB_ICONEXCLAMATION "Internal error: malformed device entry."
        Abort
      ${EndIf}
      StrCpy $R6 "$R8" $R5                                 ; ip
      IntOp $R7 "$R5" + 1
      StrCpy $R4 "$R8" "" $R7                              ; display
      StrCpy $DeviceChoice "name"
      StrCpy $DevIp "$R6"
      ${StrRep} "$DevName" "$R4" " ($R6)" ""               ; strip " (ip)"
      Return
    ${EndIf}
    IntOp $R9 "$R9" + 1
  ${Loop}

  MessageBox MB_OK|MB_ICONEXCLAMATION \
    "Please select a detected printer, pick Pin by IP, Other, or Configure later."
  Abort
FunctionEnd

; ---------------------------------------------------------------------------
; install

Section "Install"
  ; belt & braces: drop any discovery firewall rule left by a Back navigation
  Call _FwDiscoveryRemove

  ${If} $Mode == "system"
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}

  SetOutPath "$INSTDIR"
  File "/oname=${APPNAME}.exe" "staging\node-hp-scan-to.exe"

  ; configuration ------------------------------------------------------------
  Push $ScansDir
  Call _ToJsonPath
  Pop $R0 ; json-safe scans path

  CreateDirectory "$ConfigDir"
  CreateDirectory "$ScansDir"
  FileOpen $0 "$ConfigDir\default.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 '  "directory": "$R0",$\r$\n'
  ${If} $DeviceChoice == "name"
    FileWrite $0 '  "name": "$DevName",$\r$\n'
  ${ElseIf} $DeviceChoice == "ip"
    FileWrite $0 '  "ip": "$DevIp",$\r$\n'
  ${EndIf}
  FileWrite $0 '  "debug": false$\r$\n'
  FileWrite $0 "}$\r$\n"
  FileClose $0

  ; start menu shortcuts -----------------------------------------------------
  CreateDirectory "$SMPROGRAMS\${DISPLAY}"
  CreateShortCut "$SMPROGRAMS\${DISPLAY}\Run node-hp-scan-to now.lnk" \
    "$INSTDIR\${APPNAME}.exe" "$RunArgs"
  WriteINIStr "$SMPROGRAMS\${DISPLAY}\Project website.url" \
    "InternetShortcut" "URL" "https://github.com/manuc66/node-hp-scan-to"
  CreateShortCut "$SMPROGRAMS\${DISPLAY}\Configuration and logs.lnk" \
    "$ConfigDir\.."
  CreateShortCut "$SMPROGRAMS\${DISPLAY}\Scans folder.lnk" "$ScansDir"
  ${If} $Mode == "user"
    CreateShortCut "$SMPROGRAMS\${DISPLAY}\Start background task.lnk" \
      "$WINDIR\System32\schtasks.exe" "/Run /TN ${APPNAME}"
    CreateShortCut "$SMPROGRAMS\${DISPLAY}\Stop node-hp-scan-to.lnk" \
      "$WINDIR\System32\taskkill.exe" "/F /IM ${APPNAME}.exe"
  ${Else}
    CreateShortCut "$SMPROGRAMS\${DISPLAY}\Start service.lnk" \
      "$INSTDIR\${APPNAME}-service.exe" "start"
    CreateShortCut "$SMPROGRAMS\${DISPLAY}\Stop service.lnk" \
      "$INSTDIR\${APPNAME}-service.exe" "stop"
  ${EndIf}

  ; autostart ----------------------------------------------------------------
  ${If} $Mode == "user"
    ; logging wrapper with rotation, arguments follow the chosen behaviour
    FileOpen $0 "$INSTDIR\run.cmd" w
    FileWrite $0 "@echo off$\r$\n"
    FileWrite $0 'rem node-hp-scan-to background runner - log under %APPDATA%\node-hp-scan-to\logs$\r$\n'
    FileWrite $0 'cd /d "%~dp0"$\r$\n'
    FileWrite $0 'set "LOGDIR=%APPDATA%\node-hp-scan-to\logs"$\r$\n'
    FileWrite $0 'set "LOG=%LOGDIR%\scan.log"$\r$\n'
    FileWrite $0 'if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1$\r$\n'
    FileWrite $0 'if exist "%LOG%" ($\r$\n'
    FileWrite $0 '    for %%F in ("%LOG%") do ($\r$\n'
    FileWrite $0 '        if %%~zF GTR 5000000 ($\r$\n'
    FileWrite $0 '            if exist "%LOG%.old" del "%LOG%.old" >nul 2>&1$\r$\n'
    FileWrite $0 '            ren "%LOG%" "scan.log.old" >nul 2>&1$\r$\n'
    FileWrite $0 '        )$\r$\n'
    FileWrite $0 '    )$\r$\n'
    FileWrite $0 ')$\r$\n'
    ; single instance guard: bail out if the app is already running
    FileWrite $0 'tasklist /FI "IMAGENAME eq ${APPNAME}.exe" | find /I "${APPNAME}.exe" >nul$\r$\n'
    FileWrite $0 'if not errorlevel 1 exit /b 0$\r$\n'
    FileWrite $0 '".\node-hp-scan-to.exe" $RunArgs >> "%LOG%" 2>&1$\r$\n'
    FileClose $0

    ; hidden-console helper for the fallback task below: wscript hosts no
    ; window of its own and Run(...,0) hides the batch console entirely
    FileOpen $0 "$INSTDIR\run-hidden.vbs" w
    FileWrite $0 'CreateObject("WScript.Shell").Run """$INSTDIR\run.cmd""", 0$\r$\n'
    FileClose $0

    ; S4U task: session 0 (no window), restart-on-failure, no time limit.
    ; $$ keeps PowerShell variables away from NSIS expansion; quadrupled
    ; quotes survive argv+PS so Task Scheduler stores /c ""path"".
    nsExec::ExecToLog "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"$$ErrorActionPreference='Stop'; $$a = New-ScheduledTaskAction -Execute '$WINDIR\System32\cmd.exe' -Argument '/c $\"$\"$\"$\"$INSTDIR\run.cmd$\"$\"$\"$\"'; $$t = New-ScheduledTaskTrigger -AtLogOn -User '$USERDOMAIN\$USERNAME'; $$p = New-ScheduledTaskPrincipal -UserId '$USERDOMAIN\$USERNAME' -LogonType S4U; $$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName '${APPNAME}' -Action $$a -Trigger $$t -Principal $$p -Settings $$s -Force | Out-Null\""
    Pop $0
    ${If} $0 != 0
      DetailPrint "Scheduled task registration failed ($0) - falling back to simple ONLOGON task."
      nsExec::ExecToLog 'schtasks /Create /F /TN "${APPNAME}" /SC ONLOGON /RL LIMITED /TR "\"$WINDIR\System32\wscript.exe\" \"$INSTDIR\run-hidden.vbs\""'
    ${EndIf}

    nsExec::ExecToLog 'schtasks /Run /TN "${APPNAME}"'
  ${Else}
    File "/oname=${APPNAME}-service.exe" "staging\WinSW-x64.exe"

    FileOpen $0 "$INSTDIR\${APPNAME}-service.xml" w
    FileWrite $0 "<service>$\r$\n"
    FileWrite $0 "  <id>${APPNAME}</id>$\r$\n"
    FileWrite $0 "  <name>${DISPLAY}</name>$\r$\n"
    FileWrite $0 "  <description>Scan from the printer's panel to this computer - independent community tool, not affiliated with HP Inc.</description>$\r$\n"
    FileWrite $0 "  <executable>$INSTDIR\${APPNAME}.exe</executable>$\r$\n"
    FileWrite $0 "  <arguments>$RunArgs</arguments>$\r$\n"
    FileWrite $0 "  <workingdirectory>$INSTDIR</workingdirectory>$\r$\n"
    FileWrite $0 '  <env name=$\"NODE_CONFIG_DIR$\" value=$\"$ConfigDir$\"/>$\r$\n'
    FileWrite $0 "  <startmode>Automatic</startmode>$\r$\n"
    FileWrite $0 "  <delayedautostart>true</delayedautostart>$\r$\n"
    FileWrite $0 '  <onfailure action=$\"restart$\" delay=$\"10 sec$\"/>$\r$\n'
    FileWrite $0 '  <log mode=$\"roll-by-size$\">$\r$\n'
    FileWrite $0 "    <logpath>$INSTDIR\logs</logpath>$\r$\n"
    FileWrite $0 "    <sizeThreshold>10240</sizeThreshold>$\r$\n"
    FileWrite $0 "    <keepFiles>4</keepFiles>$\r$\n"
    FileWrite $0 "  </log>$\r$\n"
    FileWrite $0 "</service>$\r$\n"
    FileClose $0

    nsExec::ExecToLog '"$INSTDIR\${APPNAME}-service.exe" install'
    nsExec::ExecToLog '"$INSTDIR\${APPNAME}-service.exe" start'
  ${EndIf}

  ; uninstaller + add/remove programs ----------------------------------------
  WriteUninstaller "$INSTDIR\uninstall.exe"

  !define CURRENTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  ${If} $Mode == "system"
    WriteRegStr HKLM "Software\${APPNAME}" "InstallMode" "system"
    WriteRegStr HKLM "Software\${APPNAME}" "InstallDir" "$INSTDIR"
    WriteRegStr HKLM "${CURRENTKEY}" "DisplayName" "${DISPLAY}"
  ${Else}
    WriteRegStr HKCU "Software\${APPNAME}" "InstallMode" "user"
    WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "${CURRENTKEY}" "DisplayName" "${DISPLAY}"
  ${EndIf}
  !undef CURRENTKEY

SectionEnd

; ---------------------------------------------------------------------------
; uninstaller

Function un.onInit
  StrCpy $Mode "user"
  ReadRegStr $R0 HKLM "Software\${APPNAME}" "InstallMode"
  ${If} $R0 == "system"
    StrCpy $Mode "system"
  ${EndIf}

  ${If} $Mode == "system"
    SetShellVarContext all
    ReadRegStr $INSTDIR HKLM "Software\${APPNAME}" "InstallDir"
  ${Else}
    SetShellVarContext current
    ReadRegStr $INSTDIR HKCU "Software\${APPNAME}" "InstallDir"
  ${EndIf}
FunctionEnd

Section "un.Install"
  ${If} $Mode == "system"
    nsExec::ExecToLog '"$INSTDIR\${APPNAME}-service.exe" stop'
    nsExec::ExecToLog '"$INSTDIR\${APPNAME}-service.exe" uninstall'
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
    DeleteRegKey HKLM "Software\${APPNAME}"
  ${Else}
    ; stop the hidden instance before removing its files
    nsExec::ExecToLog 'schtasks /End /TN "${APPNAME}"'
    nsExec::ExecToLog 'taskkill /F /IM "${APPNAME}.exe"'
    nsExec::ExecToLog 'schtasks /Delete /F /TN "${APPNAME}"'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
    DeleteRegKey HKCU "Software\${APPNAME}"
  ${EndIf}

  RMDir /r "$SMPROGRAMS\${DISPLAY}"
  RMDir /r "$INSTDIR"
  ${If} $Mode == "system"
    DetailPrint "Configuration and scanned documents were kept."
  ${Else}
    DetailPrint "Configuration, logs and scanned documents were kept:"
    DetailPrint "$APPDATA\${APPNAME} and Documents\hp-scan"
  ${EndIf}
SectionEnd
