import type { RouteFeature } from "@/lib/types";

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
