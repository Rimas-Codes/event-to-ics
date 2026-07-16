@echo off
:: Event-to-ICS One-Click Installer for Windows
::
:: HOW TO USE:
::   1. Extract this ENTIRE folder from the ZIP first (do NOT run from inside the ZIP)
::   2. Double-click this install.bat file
::
:: If the window closes instantly, right-click this file -> "Run as administrator"

:: Force working directory to this file's location
cd /d "%~dp0"

title Event-to-ICS Installer

echo.
echo  ================================================
echo    Event to ICS - One-Click Installer
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please download it from: https://nodejs.org/
    echo  Choose the LTS version, install it, then run this script again.
    echo.
    pause
    exit /b 1
)
echo  Node.js: 
node -v
echo  npm:
call npm -v
echo.

echo  Step 1 of 3: Cleaning old files...
if exist .next (
    rmdir /s /q .next 2>nul
    echo  - Removed .next cache
)
if exist node_modules (
    rmdir /s /q node_modules 2>nul
    echo  - Removed old node_modules
)
if exist package-lock.json (
    del /q package-lock.json 2>nul
)
echo.

echo  Step 2 of 3: Installing packages (1-2 min)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [FAILED] npm install failed. Check internet and try again.
    echo.
    pause
    exit /b 1
)
echo  Done.
echo.

echo  Step 3 of 3: Setting up database...
call npx prisma db push --skip-generate
if %errorlevel% neq 0 (
    echo  [FAILED] Database setup failed.
    pause
    exit /b 1
)
call npx prisma generate
if %errorlevel% neq 0 (
    echo  [FAILED] Prisma generate failed.
    pause
    exit /b 1
)
echo  Done.
echo.

echo  ================================================
echo    Setup complete!
echo  ================================================
echo.

:: Show success popup via VBS (no terminal needed)
echo Set WshShell = CreateObject("WScript.Shell") > "%TEMP%\ics_done.vbs"
echo WshShell.Popup "Setup complete!" ^& vbCrLf ^& vbCrLf ^& "Double-click  start.vbs  in the folder to launch the app.", 0, "Event to ICS", 64 >> "%TEMP%\ics_done.vbs"
cscript //nologo "%TEMP%\ics_done.vbs"
del "%TEMP%\ics_done.vbs" >nul 2>&1

exit