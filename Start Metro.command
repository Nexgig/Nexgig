#!/bin/bash
# Double-click to start Metro for Nexgig (dev client).
# Uses an absolute project path so it works no matter where this file lives
# (Desktop, Dock, anywhere).
PROJECT_DIR="/Users/tuurk/Desktop/Nexgig/Development/Nexgig"
cd "$PROJECT_DIR" || { echo "Project folder not found: $PROJECT_DIR"; read -n 1 -s; exit 1; }

echo "──────────────────────────────────────────"
echo "  Starting Metro for Nexgig (dev client)"
echo "  Folder: $(pwd)"
echo "──────────────────────────────────────────"

npx expo start --dev-client

# Keep the Terminal window open if Metro exits or errors.
echo ""
echo "Metro stopped. Press any key to close this window."
read -n 1 -s
