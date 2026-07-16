@echo off
:: Event to ICS — Desktop App Build Script for Windows
::
:: HOW TO USE:
::   1. Extract this folder from the ZIP
::   2. Double-click this build-desktop.bat file
::   3. Wait for the build to complete (5-10 minutes on first run)
::   4. The installer will be in the "dist" folder
::
:: If the window closes instantly, right-click -> "Run as administrator"

cd /d "%~dp0"

title Event to ICS Desktop Builder

echo.
echo  ================================================
echo    Event to ICS - Desktop App Builder
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed!
    echo  Download it from: https://nodejs.org/
    echo  Choose the LTS version, install it, then run this script again.
    echo.
    pause
    exit /b 1
)

echo  Node.js:
node -v
echo.

:: Clean up any stale winCodeSign cache from previous failed builds
echo  Cleaning stale electron-builder cache...
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
    echo  - Removed stale winCodeSign cache
)

:: Run the build script
echo.
echo  Starting build...
echo  This will take 5-10 minutes on first run.
echo  (downloading Electron + building the installer)
echo.
echo  Press any key to start, or Ctrl+C to cancel...
pause >nul

node scripts/build-desktop.js --target win

if %errorlevel% neq 0 (
    echo.
    echo  ================================================
    echo  [FAILED] Build failed. See errors above.
    echo.
    echo  Common fixes:
    echo  1. Run this script as Administrator
    echo     (right-click -^> "Run as administrator")
    echo  2. Or enable Windows Developer Mode:
    echo     Settings -^> Privacy ^& Security -^> For developers
    echo     -^> Developer Mode: On
    echo  ================================================
    echo.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo  Build complete!
echo  The installer is in the "dist" folder.
echo  ================================================
echo.

:: Open the dist folder
if exist dist (
    explorer dist
)

pause
