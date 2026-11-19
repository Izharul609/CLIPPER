#!/usr/bin/env sh
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get it from https://nodejs.org"; exit 1; }
[ -d node_modules ] || { echo "Installing dependencies, this takes a minute..."; npm install || exit 1; }
(sleep 3; (xdg-open http://localhost:5173 || open http://localhost:5173) >/dev/null 2>&1) &
npm run dev
