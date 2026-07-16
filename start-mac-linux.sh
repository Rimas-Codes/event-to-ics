#!/bin/bash
# Event-to-ICS - One-Click Installer (macOS / Linux)

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   Event to ICS - AI Event Extractor Installer   ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js is not installed!"
    echo "  Please install it from https://nodejs.org/"
    exit 1
fi
echo "  [OK] Node.js $(node -v)"

# Clean old files
echo "  [1/3] Cleaning old files..."
rm -rf .next node_modules package-lock.json

# Install
echo "  [2/3] Installing dependencies..."
npm install || { echo "  [ERROR] npm install failed!"; exit 1; }

# Setup DB
echo "  [3/3] Setting up database..."
npx prisma db push --skip-generate && npx prisma generate || { echo "  [ERROR] DB setup failed!"; exit 1; }

echo ""
echo "  Setup complete! Starting app..."
echo "  Open: http://localhost:3000"
echo ""
npm run dev
