# Deploy 4sat on Render

## What is ready

- `npm run build` creates the frontend in `dist`.
- `npm start` runs `server.mjs`, serves the API, and serves the built frontend.
- SQLite uses `DATA_DIR` when provided. On Render, set it to `/var/data` with a persistent disk.

## Render setup

1. Push this project to GitHub.
2. In Render, create a new Blueprint from this repo, or create a Web Service manually.
3. Use:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variable: `DATA_DIR=/var/data`
4. Add a persistent disk:
   - Mount Path: `/var/data`
   - Size: `1 GB`
5. Deploy and open the Render URL.

Without a persistent disk, registered users and Arena rooms can reset when the service restarts.
