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
!define PUBLISHER "manuc66"

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
Var DeviceChoice      ; "skip" | "ip"
Var DevIp
Var DevLabel
Var EditIp
Var EditLabel
Var RadioLater
Var RadioLater2

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

; ---------------------------------------------------------------------------
; printer configuration page (manual IP entry - no network discovery)

Function DevicePageCreate
  !insertmacro MUI_HEADER_TEXT \
    "Configure your printer" \
    "IP address + destination name shown on the printer."

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 14u \
    "IP address: shown in the printer's Wi-Fi settings.$\nDestination name: displayed on the printer's screen if it has one."
  Pop $0

  ${NSD_CreateRadioButton} 8u 22u 90% 10u \
    "Enter the printer IP address:"
  Pop $RadioLater
  ${NSD_AddStyle} $RadioLater ${WS_GROUP}
  ${NSD_SetState} $RadioLater ${BST_CHECKED}

  ${NSD_CreateText} 8u 34u 88% 12u ""
  Pop $EditIp

  ${NSD_CreateLabel} 8u 52u 100% 8u "Destination name:"
  Pop $0
  ${NSD_CreateText} 8u 62u 88% 12u ""
  Pop $EditLabel
  ; prefill with the computer hostname (the app default)
  StrCpy $R0 ${NSIS_MAX_STRLEN}
  System::Call "kernel32::GetComputerNameW(w .r1, *i r0r0) i.r2"
  ${NSD_SetText} $EditLabel "$R1"

  ${NSD_CreateRadioButton} 8u 80u 90% 10u \
    "Configure later (edit config\\default.json yourself)"
  Pop $RadioLater2
  ${NSD_AddStyle} $RadioLater2 ${WS_GROUP}

  nsDialogs::Show
FunctionEnd

Function DevicePageLeave
  ${NSD_GetState} $RadioLater2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DeviceChoice "skip"
    Return
  ${EndIf}

  ${NSD_GetText} $EditIp $DevIp
  ${If} "$DevIp" == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Please enter the printer's IP address (for example 192.168.1.53)."
    Abort
  ${EndIf}
  ${NSD_GetText} $EditLabel $DevLabel
  ${If} "$DevLabel" == ""
    StrCpy $R0 ${NSIS_MAX_STRLEN}
    System::Call "kernel32::GetComputerNameW(w .r1, *i r0r0) i.r2"
    StrCpy $DevLabel "$R1"
  ${EndIf}
  StrCpy $DeviceChoice "ip"
FunctionEnd

; ---------------------------------------------------------------------------
; install

Section "Install"
  ${If} $Mode == "system"
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}

  ; stop any running instance before overwriting the binary: the scheduled
  ; task / service holds a lock on node-hp-scan-to.exe and would otherwise
  ; make the File instruction fail with "Error opening file for writing"
  ${If} $Mode == "system"
    ; stop the existing WinSW service (if present) so the binary is released;
    ; the service is re-created below on `install`
    nsExec::ExecToLog '"$INSTDIR\${APPNAME}-service.exe" stop'
    Pop $0
  ${Else}
    nsExec::ExecToLog 'schtasks /End /TN "${APPNAME}"'
    Pop $0
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\${APPNAME}.exe"
    nsExec::ExecToLog 'taskkill /F /IM "${APPNAME}.exe"'
    Pop $0
  ${EndIf}
  ; give the OS a moment to release the handle
  Sleep 1500

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
  ${If} $DeviceChoice == "ip"
    FileWrite $0 '  "ip": "$DevIp",$\r$\n'
  ${EndIf}
  ${If} "$DevLabel" != ""
    FileWrite $0 '  "label": "$DevLabel",$\r$\n'
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
