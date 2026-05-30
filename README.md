# Arsenal Parade Tracker MVP

Unofficial Arsenal parade tracker built with Next.js, React, Leaflet, GeoJSON, and a small JSON-backed data layer.

## What This MVP Does

- Displays a simple public tracker page with the route and estimated convoy/front-bus marker.
- Lets you click on the route map from `/admin` to place and save a manual sighting.
- Recalculates the estimated average speed after each sighting update.
- Keeps the public page lightweight while the admin page handles testing and updates.

## Important Limitations

- The route in `src/data/route.geojson` is a **placeholder trace** based on the PDF in this repo.
- Checkpoint distances in `src/data/checkpoints.json` are approximate and should be manually refined.
- The app does **not** use live GPS.
- JSON file writes are acceptable for local development, but **not durable on Railway**.
  Railway containers can restart or redeploy, which means file-backed updates may be lost.
- The code is structured so `src/lib/tracker-store.ts` can later be swapped to Supabase or Postgres.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

3. Start the dev server:

```bash
npm run dev
```

4. Open:

- Public tracker: `http://localhost:3000`
- Admin tester: `http://localhost:3000/admin`

## Testing Updates

- Open `/admin`
- Click on the map where the latest confirmed bus/convoy sighting was seen
- The click will snap onto the stored route line
- Enter the sighting time, source note, and confidence
- Save the sighting
- Open `/` to see the live page update

## Editing The Route

The fastest way to improve accuracy is to manually refine these two files:

- `src/data/route.geojson`
- `src/data/checkpoints.json`

### `src/data/route.geojson`

- The route is a GeoJSON `LineString`.
- Coordinates are stored in `[longitude, latitude]` order.
- Add, remove, or move route points so the line follows the PDF more closely.
- Keep the route ordered in the same direction the convoy travels.

### `src/data/checkpoints.json`

- Each checkpoint needs:
  - `id`
  - `name`
  - `latitude`
  - `longitude`
  - `distanceAlongRouteKm`
- `distanceAlongRouteKm` should increase from the start of the route to the end.
- The admin page uses these checkpoints for manual sighting updates.

## Data Files

- `src/data/route.geojson`: placeholder route line
- `src/data/checkpoints.json`: named checkpoints and distances
- `src/data/sightings.json`: saved manual sightings for local dev

## How The Estimate Works

The tracker uses:

```text
estimatedDistanceKm =
  latestConfirmedDistanceKm +
  hoursSinceLatestUpdate * currentEstimatedSpeedKmh
```

Then it:

- clamps the value so the marker cannot go past the end of the route
- interpolates a latitude/longitude along the route line
- derives a simple position label such as "Near X" or "Between X and Y"

## Admin Authentication

- Set `ADMIN_PASSWORD` in `.env`.
- If `ADMIN_PASSWORD` is empty, the admin endpoint is effectively unprotected.
- For a real public launch, move to a proper auth layer.

## GitHub Setup

1. Create a new GitHub repository.
2. In this folder:

```bash
git init
git add .
git commit -m "Initial Arsenal parade tracker MVP"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## Railway Deployment

1. Push this repo to GitHub.
2. In Railway, create a new project from GitHub.
3. Select this repository.
4. Add these environment variables in Railway:
   - `ADMIN_PASSWORD`
   - `PARADE_START_ISO`
   - `DEFAULT_SPEED_KMH`
   - `ROUTE_POLL_INTERVAL_MS`
5. Railway can use the default scripts:
   - Build: `npm run build`
   - Start: `npm run start`

## Recommended Next Upgrade

When you want persistence that survives restarts and redeploys:

- replace the JSON/file logic in `src/lib/tracker-store.ts`
- keep the API routes and UI unchanged
- store sightings in Supabase or Postgres
