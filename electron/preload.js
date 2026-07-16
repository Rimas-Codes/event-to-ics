/**
 * Electron preload script.
 *
 * Runs in the renderer process before the web page loads, with access to
 * a limited subset of Node.js APIs. We use it to expose a minimal API
 * to the renderer in case we need app-specific functionality later.
 *
 * Currently this is a no-op — the Next.js app is fully self-contained
 * and doesn't need any Electron-specific APIs.
 */

// Example: expose the app version to the renderer
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  version: process.env.npm_package_version || '1.0.0',
  isElectron: true,
})
