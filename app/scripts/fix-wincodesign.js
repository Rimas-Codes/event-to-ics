/**
 * Pre-populates the electron-builder winCodeSign cache, working around a
 * Windows permission error where 7-Zip cannot extract the macOS symbolic
 * links included in the winCodeSign-2.6.0.7z archive.
 *
 * The error looks like:
 *   ERROR: Cannot create symbolic link : A required privilege is not held
 *   by the client. : ...\darwin\10.12\lib\libcrypto.dylib
 *
 * This script does TWO things:
 * 1. Tries to extract the archive manually, ignoring symlink errors
 * 2. If that fails, tells the user to enable Developer Mode
 *
 * Run this BEFORE `electron-builder --win`.
 *
 * ALTERNATIVE FIX (recommended):
 * Enable Windows Developer Mode:
 *   Settings → Privacy & Security → For developers → Developer Mode: On
 * This allows creating symbolic links without admin privileges, which
 * fixes the root cause.
 */

const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const os = require('os')

const WINCODESIGN_VERSION = '2.6.0'
const WINCODESIGN_URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${WINCODESIGN_VERSION}/winCodeSign-${WINCODESIGN_VERSION}.7z`

/** Path where electron-builder expects the extracted winCodeSign cache. */
function getCacheBaseDir() {
  return path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
}

/** Path to the 7-Zip binary bundled with electron-builder. */
function get7zipPath() {
  const projectRoot = path.join(__dirname, '..')
  const platform = process.platform
  const platformDir = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'
  const candidate = path.join(projectRoot, 'node_modules', '7zip-bin', platformDir, 'x64', '7za')
  const exeName = platform === 'win32' ? '7za.exe' : '7za'
  const fullPath = candidate.replace(/7za$/, exeName)
  if (fs.existsSync(fullPath)) return fullPath
  // Try without .exe extension
  if (fs.existsSync(candidate)) return candidate
  return null
}

function downloadFile(url, destPath) {
  console.log(`  Downloading ${url}`)
  if (process.platform === 'win32') {
    // Use PowerShell's Invoke-WebRequest on Windows (curl might not be available)
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}'"`, {
      stdio: 'inherit',
    })
  } else {
    execSync(`curl --location --fail --output "${destPath}" "${url}"`, {
      stdio: 'inherit',
    })
  }
}

/**
 * Extracts the 7z archive, ignoring symlink errors.
 * Returns true if the win32/ folder was extracted successfully.
 */
function extract7z(archivePath, destDir, sevenZipPath) {
  console.log(`  Extracting to ${destDir}`)
  fs.mkdirSync(destDir, { recursive: true })

  // Extract with -y (yes to all) — symlink errors are non-fatal warnings
  const result = spawnSync(
    sevenZipPath,
    ['x', '-y', '-bd', `-o${destDir}`, archivePath],
    { stdio: 'pipe', encoding: 'utf8' }
  )

  // 7-Zip exit codes: 0 = OK, 1 = OK with warnings (symlink errors), 2 = fatal
  if (result.status === 0 || result.status === 1) {
    const win32Dir = path.join(destDir, 'win32')
    if (fs.existsSync(win32Dir)) {
      console.log('  ✓ Extraction succeeded (win32/ folder present)')
      if (result.stderr && result.stderr.includes('Cannot create symbolic link')) {
        console.log('    (macOS symlink warnings ignored — not needed for Windows builds)')
      }
      return true
    }
  }

  console.error('  ✗ Extraction failed')
  if (result.stderr) console.error('  stderr:', result.stderr.slice(0, 500))
  return false
}

/** Checks if any existing cache directory has the win32/ folder. */
function findValidCache(cacheBaseDir) {
  if (!fs.existsSync(cacheBaseDir)) return null
  for (const entry of fs.readdirSync(cacheBaseDir)) {
    const win32Dir = path.join(cacheBaseDir, entry, 'win32')
    if (fs.existsSync(win32Dir)) {
      return path.join(cacheBaseDir, entry)
    }
  }
  return null
}

function main() {
  console.log('\n=== Pre-populating winCodeSign cache ===\n')

  if (process.platform !== 'win32') {
    console.log('  Not Windows — skipping (this fix is only for Windows builds)')
    return
  }

  const cacheBaseDir = getCacheBaseDir()
  const sevenZipPath = get7zipPath()

  if (!sevenZipPath) {
    console.error('  ✗ Could not find 7-Zip binary in node_modules/7zip-bin/')
    console.error('    Make sure you ran "npm install" first.')
    suggestDeveloperMode()
    return
  }

  console.log(`  Cache dir:  ${cacheBaseDir}`)
  console.log(`  7-Zip:      ${sevenZipPath}`)

  // Check if a valid cache already exists
  const existingCache = findValidCache(cacheBaseDir)
  if (existingCache) {
    console.log(`  ✓ Valid cache already exists at ${existingCache}`)
    return
  }

  // Clear any partial cache
  if (fs.existsSync(cacheBaseDir)) {
    console.log('  Clearing partial cache...')
    fs.rmSync(cacheBaseDir, { recursive: true })
  }
  fs.mkdirSync(cacheBaseDir, { recursive: true })

  // Download the 7z archive
  const archivePath = path.join(cacheBaseDir, `winCodeSign-${WINCODESIGN_VERSION}.7z`)
  try {
    downloadFile(WINCODESIGN_URL, archivePath)
  } catch (e) {
    console.error('  ✗ Failed to download winCodeSign archive')
    console.error('  ', e.message)
    suggestDeveloperMode()
    return
  }

  // Extract to a temp directory
  const extractDir = path.join(cacheBaseDir, '_extracting')
  const success = extract7z(archivePath, extractDir, sevenZipPath)

  if (!success) {
    console.error('  ✗ Could not extract winCodeSign archive')
    // Clean up
    try { fs.unlinkSync(archivePath) } catch {}
    try { fs.rmSync(extractDir, { recursive: true }) } catch {}
    suggestDeveloperMode()
    return
  }

  // Move extracted contents to a directory named after the version
  // electron-builder looks for winCodeSign-<version>/ pattern
  const finalDir = path.join(cacheBaseDir, `winCodeSign-${WINCODESIGN_VERSION}`)
  if (fs.existsSync(finalDir)) {
    fs.rmSync(finalDir, { recursive: true })
  }
  fs.renameSync(extractDir, finalDir)

  // Clean up the archive
  try { fs.unlinkSync(archivePath) } catch {}

  // Verify
  const win32Dir = path.join(finalDir, 'win32')
  if (fs.existsSync(win32Dir)) {
    console.log(`  ✓ winCodeSign cache populated at ${finalDir}`)
    console.log('  electron-builder will use this cache instead of downloading.')
  } else {
    console.error('  ✗ Cache validation failed — win32/ folder not found')
    suggestDeveloperMode()
  }
}

function suggestDeveloperMode() {
  console.log('')
  console.log('  ─────────────────────────────────────────────────────')
  console.log('  ALTERNATIVE FIX: Enable Windows Developer Mode')
  console.log('  ─────────────────────────────────────────────────────')
  console.log('  1. Open Windows Settings')
  console.log('  2. Go to: Privacy & Security → For developers')
  console.log('  3. Turn ON "Developer Mode"')
  console.log('  4. Re-run the build')
  console.log('')
  console.log('  OR: Run build-desktop.bat as Administrator')
  console.log('  (right-click → "Run as administrator")')
  console.log('  ─────────────────────────────────────────────────────')
  console.log('')
}

main()
