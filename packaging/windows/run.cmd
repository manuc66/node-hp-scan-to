@echo off
rem node-hp-scan-to - background runner (per-user install mode).
rem Launched hidden at login by the scheduled task via run-hidden.vbs.
rem Run it manually from Explorer if you want to watch the console output.

cd /d "%~dp0"

set "LOGDIR=%APPDATA%\node-hp-scan-to\logs"
set "LOG=%LOGDIR%\scan.log"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1

rem simple rotation: around 5 MB, keep a single previous generation
if exist "%LOG%" (
    for %%F in ("%LOG%") do (
        if %%~zF GTR 5000000 (
            if exist "%LOG%.old" del "%LOG%.old" >nul 2>&1
            ren "%LOG%" "scan.log.old" >nul 2>&1
        )
    )
)

".\node-hp-scan-to.exe" listen --health-check >> "%LOG%" 2>&1
