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
!define DISPLAY "HP Scan to Computer"
!define PUBLISHER "Emmanuel Counasse"

!ifndef VERSION
  !define VERSION "0.0.0-dev"
!endif

Name "${DISPLAY}"
OutFile "..\..\release\setup-${APPNAME}-v${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"

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
Var DropList
Var RadioByName
Var RadioByIp
Var RadioOther
Var RadioLater
Var EditOther
Var SelDisplay

!ifndef LB_SETCURSEL
  !define LB_SETCURSEL 0x0186
!endif

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
Page custom ModePageCreate ModePageLeave
Page custom DevicePageCreate DevicePageLeave
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
  !insertmacro _InitUserMode
FunctionEnd

; ---------------------------------------------------------------------------
; mode selection page

Function ModePageCreate
  ${If} $CmdlineSystemMode == "1"
    !insertmacro _InitSystemMode
    Abort ; skip selection, we relaunched elevated ourselves
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
      ExecShell "runas" "$EXEPATH" "/SYSTEM_MODE"
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; device selection page

!macro _CtrlEnable CTRL ENABLE
  System::Call "user32::EnableWindow(p${CTRL}, i${ENABLE})"
!macroend

; parse $DeviceRaw ("name\tip" lines, \r\n separated) into
; $PLUGINSDIR\devices.ini ([d] <index> = <ip>|<display>) and set $DeviceCount
Function _ParseDevices
  StrCpy $DeviceCount 0
  Delete "$PLUGINSDIR\devices.ini"
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
      WriteIniStr "$PLUGINSDIR\devices.ini" "d" "$DeviceCount" "$R8|$R6 ($R8)"
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

Function DevicePageCreate
  !insertmacro MUI_HEADER_TEXT \
    "Select your printer" \
    "The printer can be located by name (recommended) or by fixed IP address."

  ; run discovery from a temporary copy of the binary
  File "/oname=$PLUGINSDIR\node-hp-scan-to.exe" "staging\node-hp-scan-to.exe"
  nsExec::ExecToStack '"$PLUGINSDIR\node-hp-scan-to.exe" discover --timeout 5'
  Pop $R0                       ; exit code
  Pop $DeviceRaw                ; stdout

  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 16u \
    "Detected devices are listed below. Locating the printer by name keeps working even when its IP address changes."
  Pop $0

  ${NSD_CreateListBox} 8u 22u 92% 12u ""
  Pop $DropList

  ${NSD_CreateRadioButton} 8u 42u 90% 10u \
    "Use the selected printer by name (recommended)"
  Pop $RadioByName
  ${NSD_AddStyle} $RadioByName ${WS_GROUP}

  ${NSD_CreateRadioButton} 8u 56u 90% 10u \
    "Pin this printer by IP address (only if name lookup fails on your network)"
  Pop $RadioByIp

  ${NSD_CreateRadioButton} 8u 70u 90% 10u \
    "Other - enter it manually:"
  Pop $RadioOther
  ${NSD_OnClick} $RadioOther OnOtherClick

  ${NSD_CreateText} 20u 82u 78% 12u ""
  Pop $EditOther
  !insertmacro _CtrlEnable $EditOther 0

  ${NSD_CreateRadioButton} 8u 100u 90% 10u \
    "Configure later (you will have to edit config\\default.json yourself)"
  Pop $RadioLater
  ${NSD_AddStyle} $RadioLater ${WS_GROUP}

  ; populate the list from discovery output
  ${If} $R0 == 0
    Call _ParseDevices
  ${Else}
    StrCpy $DeviceCount 0
  ${EndIf}

  StrCpy $R9 0
  ${Do}
    ${If} $R9 >= $DeviceCount
      ${Break}
    ${EndIf}
    ReadIniStr $R8 "$PLUGINSDIR\devices.ini" "d" "$R9"
    ${StrLoc} "$R5" "$R8" "|" "0"
    ${If} "$R5" != ""
      IntOp $R7 "$R5" + 1
      StrCpy $R6 "$R8" "" $R7    ; display part after "|"
      ${NSD_LB_AddItem} $DropList "$R6"
    ${EndIf}
    IntOp $R9 "$R9" + 1
  ${Loop}

  ${If} $DeviceCount > 0
    ${NSD_SetState} $RadioByName ${BST_CHECKED}
    SendMessage $DropList ${LB_SETCURSEL} 0 0
  ${Else}
    !insertmacro _CtrlEnable $RadioByName 0
    !insertmacro _CtrlEnable $RadioByIp 0
    !insertmacro _CtrlEnable $DropList 0
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
      nsExec::ExecToStack '"$PLUGINSDIR\node-hp-scan-to.exe" discover --timeout 4 --ip "$DevIp"'
    ${Else}
      StrCpy $DeviceChoice "name"
      nsExec::ExecToStack '"$PLUGINSDIR\node-hp-scan-to.exe" discover --timeout 4 --name "$DevName"'
    ${EndIf}
    Pop $0
    Pop $R1                       ; discard captured stdout
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION \
        "No HP scan-capable device answered at \"$DevName\".$\nCheck that the printer is powered on and connected to this network."
      Abort
    ${EndIf}
    Return
  ${EndIf}

  ; by-name or by-ip: require a selection in the list
  ${NSD_LB_GetSelection} $DropList $SelDisplay
  ${If} "$SelDisplay" == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please select a detected printer."
    Abort
  ${EndIf}

  ; resolve the selected display string back to its ip (and bare name)
  StrCpy $R9 0
  ${Do}
    ${If} $R9 >= $DeviceCount
      ${Break}
    ${EndIf}
    ReadIniStr $R8 "$PLUGINSDIR\devices.ini" "d" "$R9"   ; ip|display
    ${StrLoc} "$R5" "$R8" "|" "0"
    StrCpy $R4 ""                                  ; resolved flag/name
    ${If} "$R5" != ""
      ${If} $R5 > 0
        StrCpy $R6 "$R8" $R5                       ; ip
        IntOp $R7 "$R5" + 1
        StrCpy $R4 "$R8" "" $R7                    ; display
      ${EndIf}
    ${EndIf}

    ${If} "$R4" == "$SelDisplay"
      StrCpy $DevIp "$R6"
      ${NSD_GetState} $RadioByIp $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $DeviceChoice "ip"
        StrCpy $DevName "$SelDisplay"
      ${Else}
        StrCpy $DeviceChoice "name"
        ${StrRep} "$DevName" "$SelDisplay" " ($R6)" ""    ; strip " (ip)"
      ${EndIf}
      Return
    ${EndIf}

    IntOp $R9 "$R9" + 1
  ${Loop}

  MessageBox MB_OK|MB_ICONEXCLAMATION "Internal error: selected device not found."
  Abort
FunctionEnd

; ---------------------------------------------------------------------------
; install

Section "Install"
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
  FileWrite $0 '  "debug": false'$\r$\n
  FileWrite $0 "}$\r$\n"
  FileClose $0

  ; start menu shortcut ------------------------------------------------------
  CreateDirectory "$SMPROGRAMS"
  CreateShortCut "$SMPROGRAMS\${DISPLAY}.lnk" "$INSTDIR\${APPNAME}.exe" "listen"

  ; autostart ----------------------------------------------------------------
  ${If} $Mode == "user"
    ; logging wrapper (also usable manually to watch the console)
    File "run.cmd"

    ; S4U scheduled task: runs in session 0 (no window, no stored password),
    ; restarts on failure, no execution time limit. Native Task Scheduler,
    ; no scripting host involved.
    ; NB: NSIS expands $WINDIR/$INSTDIR/$USERDOMAIN/$USERNAME/${APPNAME};
    ;     lowercase $a/$t/$p/$s are unknown to NSIS and stay literal for PS.
    ;     The 4 consecutive quotes around the path survive both the argv
    ;     layer and PowerShell so that Task Scheduler stores /c ""path""
    ;     (safe when the install folder contains spaces).
    nsExec::ExecToLog "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"$ErrorActionPreference='Stop'; $a = New-ScheduledTaskAction -Execute '$WINDIR\System32\cmd.exe' -Argument '/c $\"$\"$\"$\"$INSTDIR\run.cmd$\"$\"$\"$\"'; $t = New-ScheduledTaskTrigger -AtLogOn -User '$USERDOMAIN\$USERNAME'; $p = New-ScheduledTaskPrincipal -UserId '$USERDOMAIN\$USERNAME' -LogonType S4U; $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName '${APPNAME}' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null\""
    Pop $0
    ${If} $0 != 0
      DetailPrint "Scheduled task registration failed ($0) - falling back to simple ONLOGON task."
      nsExec::ExecToLog 'schtasks /Create /F /TN "${APPNAME}" /SC ONLOGON /RL LIMITED /TR "\"$INSTDIR\run.cmd\""'
    ${EndIf}

    nsExec::ExecToLog 'schtasks /Run /TN "${APPNAME}"'
  ${Else}
    File "/oname=${APPNAME}-service.exe" "staging\WinSW-x64.exe"

    FileOpen $0 "$INSTDIR\${APPNAME}-service.xml" w
    FileWrite $0 "<service>$\r$\n"
    FileWrite $0 "  <id>${APPNAME}</id>$\r$\n"
    FileWrite $0 "  <name>${DISPLAY}</name>$\r$\n"
    FileWrite $0 "  <description>Listens for scan jobs initiated from HP All-in-One printer front panels.</description>$\r$\n"
    FileWrite $0 "  <executable>$INSTDIR\${APPNAME}.exe</executable>$\r$\n"
    FileWrite $0 "  <arguments>listen --health-check</arguments>$\r$\n"
    FileWrite $0 "  <workingdirectory>$INSTDIR</workingdirectory>$\r$\n"
    FileWrite $0 '  <env name=$"NODE_CONFIG_DIR$" value=$"$ConfigDir$"/>$\r$\n'
    FileWrite $0 "  <startmode>Automatic</startmode>$\r$\n"
    FileWrite $0 "  <delayedautostart>true</delayedautostart>$\r$\n"
    FileWrite $0 '  <onfailure action=$"restart$" delay=$"10 sec$"/>$\r$\n'
    FileWrite $0 '  <log mode=$"roll-by-size$">$\r$\n'
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

  Delete "$SMPROGRAMS\${DISPLAY}.lnk"
  RMDir /r "$INSTDIR"
  ${If} $Mode == "system"
    DetailPrint "Configuration and scanned documents were kept."
  ${Else}
    DetailPrint "Configuration, logs and scanned documents were kept:"
    DetailPrint "$APPDATA\${APPNAME} and Documents\hp-scan"
  ${EndIf}
SectionEnd
