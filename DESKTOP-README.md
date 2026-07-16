# Event to ICS — Desktop App

Turn the web app into a Windows desktop application with an installer,
desktop shortcut, and one-click launch.

## Quick Start (Windows)

1. Make sure [Node.js LTS](https://nodejs.org/) is installed
2. Double-click **`build-desktop.bat`**
3. Wait 5–10 minutes for the first build (downloads Electron ~100 MB)
4. When done, the `dist` folder opens automatically
5. Double-click **`Event to ICS Setup 1.0.0.exe`** to install
6. A desktop shortcut is created automatically — double-click it to launch

## What You Get

After installation:

- **Desktop shortcut**: "Event to ICS" icon on your desktop
- **Start Menu shortcut**: under "Event to ICS"
- **Installed location**: `C:\Users\<you>\AppData\Local\eventtoics\`
- **Database**: `C:\Users\<you>\AppData\Roaming\Event to ICS\custom.db`
  (survives app updates; your API keys are stored here)

When you launch the app:

- A desktop window opens (not a browser tab)
- The Next.js server starts internally on port 18739
- The window loads `http://localhost:18739`
- Closing the window cleanly shuts down the server

## How It Works

The desktop app is built with **Electron** — it wraps the Next.js web app
in a Chromium-based desktop window. No browser or internet connection is
required to run the app (only for AI API calls to Groq/Gemini/etc.).

Architecture:

```
Event to ICS.exe (Electron)
  ├── Starts Next.js standalone server on port 18739
  ├── Opens a BrowserWindow → http://localhost:18739
  └── Manages the server lifecycle (start/stop with the window)
```

## Build Commands

| Command | Description |
|---------|-------------|
| `build-desktop.bat` | One-click build for Windows (double-click) |
| `npm run build:desktop` | Build for current platform |
| `npm run build:desktop:win` | Build for Windows (cross-compile) |
| `npm run electron:dev` | Run in Electron dev mode (for testing) |

## Manual Build (Command Line)

```bash
# Install dependencies (first time only)
npm install

# Build the desktop installer
npm run build:desktop:win

# Output: dist/Event to ICS Setup 1.0.0.exe
```

## Development

To test the Electron wrapper without building an installer:

```bash
# 1. Build the Next.js app
npm run build

# 2. Copy static assets into standalone output
npm run electron:copy-assets

# 3. Run in Electron
npm run electron:dev
```

## Customizing the App Icon

The icon files are in `build/`:
- `icon.ico` — Windows icon (multi-size: 16px to 256px)
- `icon.png` — 256×256 PNG (for Linux builds)
- `icon@2x.png` — 512×512 PNG (high-res)

To regenerate the icon (requires Python + Pillow):

```bash
pip install Pillow
python scripts/generate-icon.py
```

Or replace the files with your own icon (must be at least 256×256).

## Troubleshooting

### "Cannot create symbolic link" error (winCodeSign)

This is the most common build error on Windows. electron-builder downloads a
`winCodeSign-2.6.0.7z` archive that contains macOS symbolic links, and 7-Zip
can't extract them without special privileges.

**Fix Option A — Enable Developer Mode (recommended, one-time fix):**
1. Open Windows **Settings**
2. Go to **Privacy & Security → For developers**
3. Turn **ON** "Developer Mode"
4. Re-run `build-desktop.bat`

**Fix Option B — Run as Administrator (quick fix):**
1. Right-click `build-desktop.bat`
2. Select **"Run as administrator"**
3. Confirm the UAC prompt

**Fix Option C — Pre-extract the cache (automatic):**
The build script (`scripts/fix-wincodesign.js`) automatically tries to
pre-extract the archive, ignoring the macOS symlink errors. If this works,
you don't need to do anything. If it fails, use Option A or B above.

### "Port 18739 is already in use"

Another instance of the app is likely running. Check Task Manager for
"Event to ICS" or "electron" processes and end them.

### The app shows a blank white window

The Next.js server may still be starting. Wait 5–10 seconds. If it
doesn't load, check the console (open DevTools with Ctrl+Shift+I in
dev mode) for errors.

### "Failed to create empty database"

This shouldn't happen, but if it does:
1. Close the app
2. Delete `C:\Users\<you>\AppData\Roaming\Event to ICS\custom.db`
3. Relaunch the app (it will create a fresh database)

### Windows SmartScreen warning

The app is not code-signed (code signing certificates cost ~$200/year).
Click **"More info"** → **"Run anyway"** to install. This is normal for
apps from independent developers.

### The installer is large (~200 MB)

Electron bundles a full Chromium browser engine (~150 MB) plus Node.js
(~40 MB). This is the trade-off for being able to run a web app as a
desktop app without requiring the user to install anything else.

## Files Added for Desktop Support

| File | Purpose |
|------|---------|
| `electron/main.js` | Electron main process (starts server, opens window) |
| `electron/preload.js` | Preload script (bridge to renderer) |
| `electron-builder.yml` | Build config (NSIS installer, shortcuts, icon) |
| `build-desktop.bat` | One-click Windows build script |
| `scripts/build-desktop.js` | Build orchestrator (Node.js) |
| `scripts/copy-standalone-assets.js` | Copies static assets into standalone |
| `scripts/generate-icon.py` | Generates the app icon |
| `build/icon.ico` | Windows app icon |
| `build/icon.png` | Linux app icon |
| `build/empty-db.db` | Empty SQLite database template (created during build) |
