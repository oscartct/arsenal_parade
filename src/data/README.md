# Route And Checkpoint Editing Notes

- `route.geojson` is the approximate traced route. Keep coordinates in `[longitude, latitude]` order.
- `checkpoints.json` powers the admin dropdown and the distance-based estimation logic.
- When you refine the route, also update checkpoint positions and `distanceAlongRouteKm` values so they still increase from start to finish.
- `sightings.json` is only a local-dev placeholder store for manual updates.
