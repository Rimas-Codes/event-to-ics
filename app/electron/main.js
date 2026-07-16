/**
 * Electron main process for Event to ICS desktop app.
 *
 * Responsibilities:
 * 1. Set up the SQLite database in the user's app-data directory (so it
 *    survives app updates and is writable on Windows).
 * 2. Spawn the Next.js standalone production server as a child process.
 * 3. Wait for the server to be ready, then open a BrowserWindow.
 * 4. Clean up the child process when the window is closed.
 */

const { app, BrowserWindow, shell } = require('electron')
const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

// Use an uncommon port to avoid conflicts with dev servers on 3000.
const PORT = 18739

/** How long to wait for the Next.js server before showing a timeout error. */
const SERVER_STARTUP_TIMEOUT_MS = 30_000

let mainWindow = null
let nextServer = null
let serverStartTime = 0

// -------------------------------------------------------------------------- //
// Path helpers                                                                //
// -------------------------------------------------------------------------- //

/**
 * In development (running `electron .`), the standalone server is at
 * `.next/standalone/server.js` relative to the project root.
 *
 * In production (packaged app), it's at
 * `resources/standalone/server.js` (placed there by electron-builder's
 * extraResources config).
 */
function getProjectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app')
  }
  return path.join(__dirname, '..')
}

function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'standalone', 'server.js')
  }
  return path.join(__dirname, '..', '.next', 'standalone', 'server.js')
}

function getEmptyDbPath() {
  return path.join(getProjectRoot(), 'build', 'empty-db.db')
}

function getUserDataDbPath() {
  return path.join(app.getPath('userData'), 'custom.db')
}

// -------------------------------------------------------------------------- //
// Database setup                                                              //
// -------------------------------------------------------------------------- //

/**
 * Ensures the SQLite database exists in the user's app-data directory.
 *
 * On first launch, copies a pre-built empty database (created during the
 * build process) from the app bundle. On subsequent launches, uses the
 * existing database.
 *
 * We use a pre-built empty database instead of running `prisma db push`
 * at runtime because the Prisma CLI is not bundled with the app.
 */
function ensureDatabase() {
  const dbPath = getUserDataDbPath()
  const dbDir = path.dirname(dbPath)

  // Create the user data directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // If the database doesn't exist yet, copy the empty template
  if (!fs.existsSync(dbPath)) {
    const emptyDbPath = getEmptyDbPath()
    if (fs.existsSync(emptyDbPath)) {
      console.log(`[db] Creating new database at ${dbPath}`)
      fs.copyFileSync(emptyDbPath, dbPath)
    } else {
      console.error(`[db] Empty database template not found at ${emptyDbPath}`)
      // Fallback: create an empty file — Prisma will create tables on first
      // query IF the schema is already applied. This shouldn't happen in
      // practice because the build script always creates the template.
      fs.writeFileSync(dbPath, '')
    }
  } else {
    console.log(`[db] Using existing database at ${dbPath}`)
  }

  return dbPath
}

// -------------------------------------------------------------------------- //
// Next.js server management                                                   //
// -------------------------------------------------------------------------- //

/**
 * Spawns the Next.js standalone server as a child process.
 *
 * We set ELECTRON_RUN_AS_NODE=1 so that the Electron binary acts as a
 * pure Node.js runtime (no Chromium window). This lets us reuse the
 * Node.js that's already bundled with Electron instead of shipping a
 * separate Node.js runtime.
 */
function startNextServer() {
  const serverPath = getServerPath()
  const dbPath = getUserDataDbPath()

  console.log(`[server] Starting Next.js server at ${serverPath}`)
  console.log(`[server] Database: ${dbPath}`)
  console.log(`[server] Port: ${PORT}`)

  // Determine the working directory for the server.
  // The standalone server.js expects to be run from its own directory
  // so it can find .next/static and public.
  const serverCwd = path.dirname(serverPath)

  nextServer = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      DATABASE_URL: `file:${dbPath}`,
      NODE_ENV: 'production',
      // Prevent the server from opening a browser itself
      BROWSER: 'none',
    },
    cwd: serverCwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  nextServer.stdout.on('data', (data) => {
    const text = data.toString().trim()
    if (text) console.log(`[next] ${text}`)
  })

  nextServer.stderr.on('data', (data) => {
    const text = data.toString().trim()
    if (text) console.error(`[next] ${text}`)
  })

  nextServer.on('error', (err) => {
    console.error(`[server] Failed to start: ${err.message}`)
  })

  nextServer.on('exit', (code, signal) => {
    console.log(`[server] Exited with code ${code}, signal ${signal}`)
    nextServer = null
  })

  serverStartTime = Date.now()
}

/**
 * Polls the server URL until it responds, then calls callback.
 * Shows an error dialog if the server doesn't start within the timeout.
 */
function waitForServer(callback) {
  const tryConnect = () => {
    if (!nextServer) {
      // Server crashed
      showFatalError(
        'Server failed to start',
        'The Next.js server process exited unexpectedly. Check the console for details.',
      )
      return
    }

    if (Date.now() - serverStartTime > SERVER_STARTUP_TIMEOUT_MS) {
      showFatalError(
        'Server startup timeout',
        `The server did not respond within ${SERVER_STARTUP_TIMEOUT_MS / 1000} seconds.`,
      )
      return
    }

    const req = http.get(
      `http://localhost:${PORT}/`,
      { timeout: 2000 },
      (res) => {
        // Any HTTP response means the server is up
        res.destroy()
        callback()
      },
    )

    req.on('error', () => {
      setTimeout(tryConnect, 300)
    })

    req.on('timeout', () => {
      req.destroy()
      setTimeout(tryConnect, 300)
    })
  }

  // Give the server a moment to start before first check
  setTimeout(tryConnect, 500)
}

/**
 * Gracefully shuts down the Next.js server.
 */
function stopNextServer() {
  if (nextServer) {
    console.log('[server] Shutting down...')
    nextServer.kill('SIGTERM')
    // Force kill after 3 seconds if still running
    setTimeout(() => {
      if (nextServer) {
        nextServer.kill('SIGKILL')
      }
    }, 3000)
    nextServer = null
  }
}

// -------------------------------------------------------------------------- //
// Window management                                                           //
// -------------------------------------------------------------------------- //

const { dialog } = require('electron')

function showFatalError(title, message) {
  dialog.showErrorBox(title, message)
  app.quit()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 600,
    minHeight: 500,
    icon: path.join(getProjectRoot(), 'build', 'icon.ico'),
    title: 'Event to ICS',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the Next.js dev tools in development
      devTools: !app.isPackaged,
    },
    autoHideMenuBar: true,
    show: false, // Show when ready to prevent flash
  })

  // Load the Next.js app
  mainWindow.loadURL(`http://localhost:${PORT}`)

  // Show window when content is ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links (http/https) in the system browser, not in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Prevent navigation away from the app URL
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// -------------------------------------------------------------------------- //
// App lifecycle                                                               //
// -------------------------------------------------------------------------- //

// Prevent multiple instances of the app
const gotSingleLock = app.requestSingleInstanceLock()
if (!gotSingleLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  console.log('[app] Starting Event to ICS desktop app...')

  // 1. Set up the database
  ensureDatabase()

  // 2. Start the Next.js server
  startNextServer()

  // 3. Wait for it to be ready, then open the window
  waitForServer(() => {
    console.log('[app] Server ready, opening window...')
    createWindow()
  })
})

app.on('window-all-closed', () => {
  console.log('[app] All windows closed, quitting...')
  stopNextServer()
  app.quit()
})

app.on('before-quit', () => {
  stopNextServer()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  stopNextServer()
  app.quit()
})

process.on('SIGTERM', () => {
  stopNextServer()
  app.quit()
})
