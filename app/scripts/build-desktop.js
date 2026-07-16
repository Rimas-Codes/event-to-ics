/**
 * Full desktop build orchestrator for Event to ICS.
 *
 * Steps:
 *   1. Generate the Windows app icon (.ico)
 *   2. Build the Next.js production app (standalone output)
 *   3. Copy static assets + Prisma binaries into the standalone directory
 *   4. Create an empty SQLite database template (for first-run setup)
 *   5. Run electron-builder to produce the Windows NSIS installer
 *
 * Usage:
 *   node scripts/build-desktop.js              # Build for current platform
 *   node scripts/build-desktop.js --target win # Build for Windows (cross-compile)
 *
 * Output:
 *   dist/Event to ICS Setup 1.0.0.exe  (the installer)
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const args = process.argv.slice(2)
const targetWin = args.includes('--target') && args[args.indexOf('--target') + 1] === 'win'
const isWindows = process.platform === 'win32'

/** Run a command and stream output to the console. */
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`)
  execSync(cmd, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...opts,
  })
}

/** Run a command and return its stdout as a string. */
function runQuiet(cmd) {
  return execSync(cmd, { cwd: projectRoot, encoding: 'utf8' }).trim()
}

function step(name, fn) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  STEP: ${name}`)
  console.log(`${'='.repeat(60)}\n`)
  fn()
}

function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║     Event to ICS — Desktop App Build                     ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`  Platform:  ${process.platform}`)
  console.log(`  Target:    ${targetWin ? 'Windows (NSIS)' : 'current platform'}`)
  console.log(`  Node:      ${process.version}`)
  console.log('')

  // ---------------------------------------------------------------- //
  // Step 1: Install dependencies (including electron)               //
  // ---------------------------------------------------------------- //
  if (!fs.existsSync(path.join(projectRoot, 'node_modules', 'electron'))) {
    step('Install dependencies', () => {
      run('npm install --no-audit --no-fund')
    })
  } else {
    console.log('Skipping npm install (node_modules already present)')
  }

  // ---------------------------------------------------------------- //
  // Step 1b: Verify icon exists (generate if missing)               //
  // ---------------------------------------------------------------- //
  step('Verify app icon', () => {
    const iconIco = path.join(projectRoot, 'build', 'icon.ico')
    const iconPng = path.join(projectRoot, 'build', 'icon.png')
    if (!fs.existsSync(iconIco) || !fs.existsSync(iconPng)) {
      console.log('  Icon missing, attempting to generate...')
      try {
        run('python3 scripts/generate-icon.py')
      } catch {
        try {
          run('python scripts/generate-icon.py')
        } catch {
          console.warn('  ⚠ Could not generate icon (Python/Pillow not available)')
          console.warn('  The build will use a default Electron icon.')
        }
      }
    } else {
      console.log('  ✓ Icon files present')
    }
  })

  // ---------------------------------------------------------------- //
  // Step 2: Generate Prisma client                                  //
  // ---------------------------------------------------------------- //
  step('Generate Prisma client', () => {
    run('npx prisma generate')
  })

  // ---------------------------------------------------------------- //
  // Step 3: Build the Next.js production app                        //
  // ---------------------------------------------------------------- //
  step('Build Next.js app (standalone)', () => {
    // Clean previous build
    const nextDir = path.join(projectRoot, '.next')
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true })
    }
    run('npx next build')
  })

  // ---------------------------------------------------------------- //
  // Step 4: Copy static assets into standalone output               //
  // ---------------------------------------------------------------- //
  step('Copy static assets', () => {
    run('node scripts/copy-standalone-assets.js')
  })

  // ---------------------------------------------------------------- //
  // Step 5: Copy Prisma engine binaries (safety net)               //
  // ---------------------------------------------------------------- //
  step('Copy Prisma engine binaries', () => {
    copyPrismaBinaries()
  })

  // ---------------------------------------------------------------- //
  // Step 6: Create empty database template                          //
  // ---------------------------------------------------------------- //
  step('Create empty database template', () => {
    createEmptyDatabase()
  })

  // ---------------------------------------------------------------- //
  // Step 7: Pre-populate winCodeSign cache (Windows only)           //
  // ---------------------------------------------------------------- //
  if (isWindows || (targetWin && isWindows)) {
    step('Fix winCodeSign cache (Windows symlink bug)', () => {
      // electron-builder downloads a winCodeSign archive that contains
      // macOS symbolic links. On Windows without Developer Mode, 7-Zip
      // fails to extract them. We pre-extract the archive ourselves,
      // ignoring the macOS symlink errors (we only need win32/).
      try {
        run('node scripts/fix-wincodesign.js')
      } catch {
        console.warn('  ⚠ fix-wincodesign.js failed — continuing anyway')
        console.warn('  If the build fails with "Cannot create symbolic link",')
        console.warn('  enable Windows Developer Mode or run as Administrator.')
      }
    })
  }

  // ---------------------------------------------------------------- //
  // Step 8: Run electron-builder                                    //
  // ---------------------------------------------------------------- //
  step('Build desktop installer (electron-builder)', () => {
    const distDir = path.join(projectRoot, 'dist')
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true })
    }

    if (targetWin && !isWindows) {
      // Cross-compiling from Mac/Linux to Windows
      // electron-builder needs Wine for this
      console.log('Cross-compiling to Windows (requires Wine)...')
      run('npx electron-builder --win --x64')
    } else if (targetWin && isWindows) {
      run('npx electron-builder --win --x64')
    } else {
      // Build for current platform
      run('npx electron-builder')
    }
  })

  // ---------------------------------------------------------------- //
  // Done!                                                           //
  // ---------------------------------------------------------------- //
  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  ✅  Build complete!                                       ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('')

  const distDir = path.join(projectRoot, 'dist')
  if (fs.existsSync(distDir)) {
    console.log('Output files:')
    for (const file of fs.readdirSync(distDir)) {
      const filePath = path.join(distDir, file)
      const stat = fs.statSync(filePath)
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1)
      console.log(`  ${file} (${sizeMB} MB)`)
    }
  }
  console.log('')
  console.log('Double-click the Setup .exe to install.')
  console.log('A desktop shortcut will be created automatically.')
}

// -------------------------------------------------------------------------- //
// Helpers                                                                     //
// -------------------------------------------------------------------------- //

/**
 * Copies Prisma engine binaries into the standalone output.
 *
 * Next.js file tracing should handle this automatically via
 * outputFileTracingIncludes in next.config.ts, but we do it manually
 * as a safety net.
 */
function copyPrismaBinaries() {
  const standaloneDir = path.join(projectRoot, '.next', 'standalone')
  const standaloneNodeModules = path.join(standaloneDir, 'node_modules')

  // Copy @prisma/engines
  const enginesSrc = path.join(projectRoot, 'node_modules', '@prisma', 'engines')
  const enginesDest = path.join(standaloneNodeModules, '@prisma', 'engines')
  if (fs.existsSync(enginesSrc)) {
    console.log('  Copying @prisma/engines...')
    copyDirSync(enginesSrc, enginesDest)
  }

  // Copy .prisma/client (generated client + engine)
  const prismaClientSrc = path.join(projectRoot, 'node_modules', '.prisma')
  const prismaClientDest = path.join(standaloneNodeModules, '.prisma')
  if (fs.existsSync(prismaClientSrc)) {
    console.log('  Copying .prisma/client...')
    copyDirSync(prismaClientSrc, prismaClientDest)
  }

  // Verify engine binaries are present
  const engineFiles = findFiles(enginesDest, /\.node$/)
  const clientEngineFiles = findFiles(prismaClientDest, /\.node$/)
  console.log(`  Found ${engineFiles.length} engine binaries in @prisma/engines`)
  console.log(`  Found ${clientEngineFiles.length} engine binaries in .prisma/client`)
}

/**
 * Creates an empty SQLite database with the Prisma schema applied.
 * This file is bundled with the app and copied to the user's app-data
 * directory on first launch.
 */
function createEmptyDatabase() {
  const buildDir = path.join(projectRoot, 'build')
  fs.mkdirSync(buildDir, { recursive: true })

  const dbPath = path.join(buildDir, 'empty-db.db')
  const schemaPath = path.join(projectRoot, 'prisma', 'schema.prisma')

  // Remove old template
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  // Create a fresh database by running prisma db push
  // This creates the database file and applies the schema
  console.log(`  Creating empty database at ${dbPath}...`)
  try {
    execSync('npx prisma db push --skip-generate', {
      cwd: projectRoot,
      stdio: 'pipe', // Suppress output
      env: {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`,
      },
    })
  } catch (e) {
    console.error('  Failed to create empty database:')
    console.error(e.stderr?.toString() || e.message)
    process.exit(1)
  }

  if (fs.existsSync(dbPath)) {
    const sizeKB = (fs.statSync(dbPath).size / 1024).toFixed(1)
    console.log(`  ✅ Empty database created (${sizeKB} KB)`)
  } else {
    console.error('  ❌ Database file was not created')
    process.exit(1)
  }
}

/**
 * Recursively copies a directory.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Finds all files matching a regex pattern in a directory tree.
 */
function findFiles(dir, pattern) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern))
    } else if (pattern.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

main()
