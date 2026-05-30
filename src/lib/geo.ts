import type { Checkpoint, RouteCoordinate, RouteFeature, RouteSnap } from "@/lib/types";

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

export function haversineDistanceKm(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number
) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const latitudeDelta = toRadians(endLatitude - startLatitude);
  const longitudeDelta = toRadians(endLongitude - startLongitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(startLatitude)) *
      Math.cos(toRadians(endLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getRouteLengthKm(route: RouteFeature) {
  let totalDistanceKm = 0;

  for (let index = 1; index < route.geometry.coordinates.length; index += 1) {
    const [previousLongitude, previousLatitude] = route.geometry.coordinates[index - 1];
    const [currentLongitude, currentLatitude] = route.geometry.coordinates[index];

    totalDistanceKm += haversineDistanceKm(
      previousLatitude,
      previousLongitude,
      currentLatitude,
      currentLongitude
    );
  }

  return roundTo(totalDistanceKm, 3);
}

export function interpolatePositionAlongRoute(route: RouteFeature, targetDistanceKm: number) {
  if (route.geometry.coordinates.length === 0) {
    return {
      latitude: 0,
      longitude: 0
    };
  }

  if (route.geometry.coordinates.length === 1) {
    const [longitude, latitude] = route.geometry.coordinates[0];
    return { latitude, longitude };
  }

  let accumulatedDistanceKm = 0;

  for (let index = 1; index < route.geometry.coordinates.length; index += 1) {
    const [previousLongitude, previousLatitude] = route.geometry.coordinates[index - 1];
    const [currentLongitude, currentLatitude] = route.geometry.coordinates[index];

    const segmentDistanceKm = haversineDistanceKm(
      previousLatitude,
      previousLongitude,
      currentLatitude,
      currentLongitude
    );

    if (accumulatedDistanceKm + segmentDistanceKm >= targetDistanceKm) {
      const remainingDistanceKm = targetDistanceKm - accumulatedDistanceKm;
      const ratio = segmentDistanceKm === 0 ? 0 : remainingDistanceKm / segmentDistanceKm;

      return {
        latitude: previousLatitude + (currentLatitude - previousLatitude) * ratio,
        longitude: previousLongitude + (currentLongitude - previousLongitude) * ratio
      };
    }

    accumulatedDistanceKm += segmentDistanceKm;
  }

  const [lastLongitude, lastLatitude] = route.geometry.coordinates[route.geometry.coordinates.length - 1];
  return {
    latitude: lastLatitude,
    longitude: lastLongitude
  };
}

function latitudeScaleKm() {
  return 110.574;
}

function longitudeScaleKm(latitude: number) {
  return 111.32 * Math.cos((latitude * Math.PI) / 180);
}

function describeSnap(distanceKm: number, checkpoints: Checkpoint[]) {
  if (checkpoints.length === 0) {
    return "Manual sighting";
  }

  let previousCheckpoint = checkpoints[0];

  for (const checkpoint of checkpoints) {
    if (Math.abs(checkpoint.distanceAlongRouteKm - distanceKm) <= 0.15) {
      return `Near ${checkpoint.name}`;
    }

    if (checkpoint.distanceAlongRouteKm > distanceKm) {
      return `Between ${previousCheckpoint.name} and ${checkpoint.name}`;
    }

    previousCheckpoint = checkpoint;
  }

  return `Near ${checkpoints[checkpoints.length - 1]?.name ?? "the route end"}`;
}

export function snapPointToRoute(
  route: RouteFeature,
  checkpoints: Checkpoint[],
  latitude: number,
  longitude: number,
  minDistanceKm = 0
): RouteSnap {
  if (route.geometry.coordinates.length === 0) {
    return {
      latitude,
      longitude,
      distanceAlongRouteKm: 0,
      label: "Manual sighting"
    };
  }

  const originLatitude = latitude;
  const latScale = latitudeScaleKm();
  const lonScale = longitudeScaleKm(originLatitude);
  const targetX = longitude * lonScale;
  const targetY = latitude * latScale;

  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestSnap: RouteSnap = {
    latitude,
    longitude,
    distanceAlongRouteKm: 0,
    label: "Manual sighting"
  };
  let distanceBeforeSegmentKm = 0;

  for (let index = 1; index < route.geometry.coordinates.length; index += 1) {
    const [startLongitude, startLatitude] = route.geometry.coordinates[index - 1];
    const [endLongitude, endLatitude] = route.geometry.coordinates[index];

    const startX = startLongitude * lonScale;
    const startY = startLatitude * latScale;
    const endX = endLongitude * lonScale;
    const endY = endLatitude * latScale;
    const segmentDistanceKm = haversineDistanceKm(startLatitude, startLongitude, endLatitude, endLongitude);

    const segmentDx = endX - startX;
    const segmentDy = endY - startY;
    const segmentLengthSquared = segmentDx ** 2 + segmentDy ** 2;
    const segmentStartKm = distanceBeforeSegmentKm;
    const segmentEndKm = distanceBeforeSegmentKm + segmentDistanceKm;

    if (segmentEndKm < minDistanceKm) {
      distanceBeforeSegmentKm += segmentDistanceKm;
      continue;
    }

    const minimumProjection =
      segmentDistanceKm === 0 || minDistanceKm <= segmentStartKm
        ? 0
        : clampNumber((minDistanceKm - segmentStartKm) / segmentDistanceKm, 0, 1);
    const projection =
      segmentLengthSquared === 0
        ? minimumProjection
        : clampNumber(
            ((targetX - startX) * segmentDx + (targetY - startY) * segmentDy) / segmentLengthSquared,
            minimumProjection,
            1
          );

    const snappedX = startX + segmentDx * projection;
    const snappedY = startY + segmentDy * projection;
    const distanceSquared = (targetX - snappedX) ** 2 + (targetY - snappedY) ** 2;

    if (distanceSquared < bestDistanceSquared) {
      const snappedLatitude = startLatitude + (endLatitude - startLatitude) * projection;
      const snappedLongitude = startLongitude + (endLongitude - startLongitude) * projection;
      const snappedDistanceKm = roundTo(distanceBeforeSegmentKm + segmentDistanceKm * projection, 3);

      bestDistanceSquared = distanceSquared;
      bestSnap = {
        latitude: snappedLatitude,
        longitude: snappedLongitude,
        distanceAlongRouteKm: snappedDistanceKm,
        label: describeSnap(snappedDistanceKm, checkpoints)
      };
    }

    distanceBeforeSegmentKm += segmentDistanceKm;
  }

  if (bestDistanceSquared === Number.POSITIVE_INFINITY) {
    const fallbackDistanceKm = clampNumber(minDistanceKm, 0, getRouteLengthKm(route));
    const fallbackPosition = interpolatePositionAlongRoute(route, fallbackDistanceKm);

    return {
      latitude: fallbackPosition.latitude,
      longitude: fallbackPosition.longitude,
      distanceAlongRouteKm: fallbackDistanceKm,
      label: describeSnap(fallbackDistanceKm, checkpoints)
    };
  }

  return bestSnap;
}

export function buildRouteFeature(coordinates: RouteCoordinate[]): RouteFeature {
  return {
    type: "Feature",
    properties: {
      name: "Arsenal Parade Route",
      note: "Route drawn directly on the live map from the admin editor."
    },
    geometry: {
      type: "LineString",
      coordinates
    }
  };
}

export function projectCheckpointsOntoRoute(route: RouteFeature, checkpoints: Checkpoint[]) {
  let minimumDistanceKm = 0;

  return checkpoints.map((checkpoint) => {
    const snapped = snapPointToRoute(route, checkpoints, checkpoint.latitude, checkpoint.longitude, minimumDistanceKm);
    minimumDistanceKm = snapped.distanceAlongRouteKm;

    return {
      ...checkpoint,
      latitude: roundTo(snapped.latitude, 6),
      longitude: roundTo(snapped.longitude, 6),
      distanceAlongRouteKm: roundTo(snapped.distanceAlongRouteKm, 3)
    };
  });
}
