# Personal Clipping Studio

## One-time setup
1. Install Node.js 22.13 or newer (https://nodejs.org, choose "LTS" or newer).
2. Install FFmpeg (needed from Stage 2; ffprobe is used now to read video length). Windows: `winget install Gyan.FFmpeg`.
3. In this folder run: `npm install`

## Run
`npm run dev`, then open http://localhost:5173

## Common problems
- "node:sqlite" or "Cannot find module": your Node is too old. Run `node -v` and upgrade to 22.13+.
- Port already in use (3001 or 5173): close the other copy of the app.
- Video won't play: the browser can't decode that format (often HEVC/MKV). Stage 2 adds automatic lightweight previews.
- Length/resolution show as unknown: FFmpeg isn't installed or isn't on your PATH.
