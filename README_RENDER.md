# Deploy 4sat on Render

## What is ready

- `npm run build` creates the frontend in `dist`.
- `npm start` runs `server.mjs`, serves the API, and serves the built frontend.
- SQLite uses local storage by default on the free Render plan.
- For permanent user accounts, upgrade the service and add a persistent disk with `DATA_DIR=/var/data`.

## Render setup

1. Push this project to GitHub.
2. In Render, create a new Blueprint from this repo, or create a Web Service manually.
3. Use:
   - Build Command: `npm install --include=dev && npm run build`
   - Start Command: `npm start`
4. Deploy and open the Render URL.

On the free plan, registered users and Arena rooms can reset when the service restarts.
For permanent storage, add:

- Environment Variable: `DATA_DIR=/var/data`
- Persistent Disk Mount Path: `/var/data`
- Persistent Disk Size: `1 GB`
