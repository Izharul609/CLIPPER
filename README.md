# Clipping Studio

A personal workspace for turning long videos into short vertical clips. It runs on your own computer, so your videos never leave it.

**Status:** Stage 1 (import, project list, playback). Clipping, AI highlights, vertical crop, subtitles and MP4 export are coming.

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer. [FFmpeg](https://ffmpeg.org/download.html) is optional for now (it shows video length and resolution) and required from Stage 2. On Windows: `winget install Gyan.FFmpeg`.

1. Download this project: green **Code** button, then **Download ZIP** (or `git clone`).
2. Double-click `start.bat` (Windows) or run `./start.sh` (Mac/Linux).
   Or run `npm install` then `npm run dev` yourself.
3. Open http://localhost:5173

The first start installs dependencies and takes a minute or two.

## Why isn't there a link I can just open?

This app needs a small server on your machine to read and stream large video files. GitHub Pages only hosts static pages, so it can't run it. Everyone runs their own copy locally, and their videos stay private.

## Troubleshooting

- **"node:sqlite" or "Cannot find module":** your Node.js is too old. Run `node -v` and install 22.13 or newer.
- **Port already in use (3001 or 5173):** close the other copy of the app.
- **Video won't play:** the browser can't decode that format (often HEVC or MKV). Stage 2 adds automatic lightweight previews. MP4 (H.264) works now.
- **Length shows as "unknown":** FFmpeg isn't installed or isn't on your PATH.

## Project layout

- `server/` local API, SQLite database, video streaming
- `web/` the React interface
- `data/` created on first run: your imported videos and database (ignored by git)

## Share it with a friend (GitHub Pages)
The online version runs entirely in the visitor's browser (no server). Videos never leave their device.
1. Create a new repository on github.com (Public is simplest; free Pages requires Public unless you have a paid plan).
2. In this folder run:
   `git init`, `git add .`, `git commit -m "Clipping Studio"`, `git branch -M main`,
   `git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git`, `git push -u origin main`
3. On GitHub: Settings → Pages → Source: **GitHub Actions**.
4. Wait about 2 minutes (Actions tab shows progress). Your link is https://YOUR-NAME.github.io/YOUR-REPO/

The online version covers Stage 1 (import and playback). Server-based features (AI transcription, FFmpeg export)
need the local version: your friend can clone the repo and run `npm install` and `npm run dev`.
