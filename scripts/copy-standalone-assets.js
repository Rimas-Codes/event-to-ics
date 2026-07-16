/**
 * Copies static assets into the Next.js standalone output directory.
 *
 * The standalone build at `.next/standalone/` contains the server and
 * node_modules, but NOT the static assets (.next/static, public/).
 * Next.js expects these to be copied manually.
 *
 * Run this after `next build` and before `electron-builder`.
 */

const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const standaloneDir = path.join(projectRoot, '.next', 'standalone')
const staticSrc = path.join(projectRoot, '.next', 'static')
const staticDest = path.join(standaloneDir, '.next', 'static')
const publicSrc = path.join(projectRoot, 'public')
const publicDest = path.join(standaloneDir, 'public')

/**
 * Recursively copy a directory, creating parent directories as needed.
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ! Source not found: ${src}`)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else if (entry.isSymbolicLink()) {
      // Resolve and copy the target
      const target = fs.readlinkSync(srcPath)
      copyDirSync(path.resolve(src, target), destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function main() {
  console.log('Copying static assets into standalone output...')

  if (!fs.existsSync(standaloneDir)) {
    console.error(`ERROR: Standalone directory not found: ${standaloneDir}`)
    console.error('Did you run "next build" first?')
    process.exit(1)
  }

  console.log(`  .next/static -> ${path.relative(projectRoot, staticDest)}`)
  copyDirSync(staticSrc, staticDest)

  console.log(`  public/      -> ${path.relative(projectRoot, publicDest)}`)
  copyDirSync(publicSrc, publicDest)

  // Copy the Prisma schema into the standalone output (needed if we ever
  // want to run `prisma db push` from the packaged app)
  const schemaSrc = path.join(projectRoot, 'prisma', 'schema.prisma')
  const schemaDestDir = path.join(standaloneDir, 'prisma')
  const schemaDest = path.join(schemaDestDir, 'schema.prisma')
  if (fs.existsSync(schemaSrc)) {
    fs.mkdirSync(schemaDestDir, { recursive: true })
    fs.copyFileSync(schemaSrc, schemaDest)
    console.log(`  prisma/schema.prisma -> ${path.relative(projectRoot, schemaDest)}`)
  }

  console.log('Done copying assets.')
}

main()
