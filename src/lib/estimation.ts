import { DEFAULT_SPEED_KMH } from "@/lib/config";
import { clampNumber, getRouteLengthKm, interpolatePositionAlongRoute, roundTo } from "@/lib/geo";
import type { Checkpoint, ConfidenceLevel, RouteFeature, SightingRecord, StorageMode, TrackerSnapshot } from "@/lib/types";

function buildStartAssumption(checkpoints: Checkpoint[], paradeStartIso: string, baselineSpeedKmh: number): SightingRecord {
  const startCheckpoint = checkpoints[0];

  return {
    id: "start-assumption",
    checkpointId: startCheckpoint.id,
    checkpointName: startCheckpoint.name,
    latitude: startCheckpoint.latitude,
    longitude: startCheckpoint.longitude,
    distanceAlongRouteKm: startCheckpoint.distanceAlongRouteKm,
    sightingTimeIso: paradeStartIso,
    sourceNote: "Using the scheduled parade start as the initial estimate.",
    confidence: "medium",
    estimatedAverageSpeedKmh: baselineSpeedKmh,
    observedSegmentSpeedKmh: null,
    distanceFromPreviousKm: 0,
    minutesFromPrevious: 0,
    createdAtIso: paradeStartIso
  };
}

export function calculateSegmentMetrics(previous: SightingRecord, latest: SightingRecord) {
  const elapsedHours =
    (new Date(latest.sightingTimeIso).getTime() - new Date(previous.sightingTimeIso).getTime()) / 3_600_000;

  if (elapsedHours <= 0) {
    throw new Error("The new sighting time must be later than the previous sighting time.");
  }

  const distanceDeltaKm = latest.distanceAlongRouteKm - previous.distanceAlongRouteKm;

  if (distanceDeltaKm < 0) {
    throw new Error("The new checkpoint must be at or ahead of the previous checkpoint along the route.");
  }

  return {
    elapsedHours,
    elapsedMinutes: roundTo(elapsedHours * 60, 1),
    distanceDeltaKm: roundTo(distanceDeltaKm, 3),
    observedSpeedKmh: roundTo(clampNumber(distanceDeltaKm / elapsedHours, 0, 20), 2)
  };
}

export function blendEstimatedSpeed({
  previousEstimatedSpeedKmh,
  observedSpeedKmh,
  confidence,
  distanceDeltaKm,
  elapsedHours,
  isFirstConfirmedSighting
}: {
  previousEstimatedSpeedKmh: number;
  observedSpeedKmh: number;
  confidence: ConfidenceLevel;
  distanceDeltaKm: number;
  elapsedHours: number;
  isFirstConfirmedSighting: boolean;
}) {
  const baseWeight = {
    low: 0.3,
    medium: 0.5,
    high: 0.68
  }[confidence];
  const distanceBoost = clampNumber(distanceDeltaKm / 2.5, 0, 0.2);
  const timeBoost = clampNumber(elapsedHours / 1.5, 0, 0.12);
  const firstSightingBoost = isFirstConfirmedSighting ? 0.14 : 0;
  const observationWeight = clampNumber(baseWeight + distanceBoost + timeBoost + firstSightingBoost, 0.3, 0.92);

  return roundTo(
    clampNumber(
      previousEstimatedSpeedKmh * (1 - observationWeight) + observedSpeedKmh * observationWeight,
      0,
      20
    ),
    2
  );
}

export function shouldUpdateEstimatedSpeed(distanceDeltaKm: number, elapsedMinutes: number) {
  return distanceDeltaKm >= 0.15 && elapsedMinutes >= 1;
}

function deriveConfidence(confidence: ConfidenceLevel, ageMinutes: number) {
  if (ageMinutes <= 10) {
    return {
      level: confidence,
      reason: "Fresh sighting update."
    };
  }

  if (ageMinutes <= 25) {
    if (confidence === "high") {
      return {
        level: "medium" as const,
        reason: "Reliable sighting, but it is beginning to age."
      };
    }

    return {
      level: confidence === "medium" ? ("medium" as const) : ("low" as const),
      reason: "Estimate is still reasonable, but the last public confirmation is no longer fresh."
    };
  }

  return {
    level: "low" as const,
    reason: "The latest public confirmation is old enough that the estimate may drift."
  };
}

function describeEstimatedPosition(distanceKm: number, checkpoints: Checkpoint[], routeLengthKm: number) {
  if (distanceKm >= routeLengthKm) {
    return `End of route near ${checkpoints[checkpoints.length - 1]?.name ?? "final checkpoint"}`;
  }

  let previousCheckpoint = checkpoints[0];

  for (const checkpoint of checkpoints) {
    const gapKm = Math.abs(checkpoint.distanceAlongRouteKm - distanceKm);

    if (gapKm <= 0.15) {
      return `Near ${checkpoint.name}`;
    }

    if (checkpoint.distanceAlongRouteKm > distanceKm) {
      return `Between ${previousCheckpoint.name} and ${checkpoint.name}`;
    }

    previousCheckpoint = checkpoint;
  }

  return `Near ${checkpoints[checkpoints.length - 1]?.name ?? "the route end"}`;
}

export function buildTrackerSnapshot({
  route,
  checkpoints,
  actualSightings,
  now,
  storageMode,
  paradeStartIso,
  manualSpeedKmh,
  holdAtStartUntilLiveRun
}: {
  route: RouteFeature;
  checkpoints: Checkpoint[];
  actualSightings: SightingRecord[];
  now: Date;
  storageMode: StorageMode;
  paradeStartIso: string;
  manualSpeedKmh: number | null;
  holdAtStartUntilLiveRun: boolean;
}): TrackerSnapshot {
  const routeLengthKm = getRouteLengthKm(route);
  const baselineSighting = buildStartAssumption(checkpoints, paradeStartIso, manualSpeedKmh ?? DEFAULT_SPEED_KMH);
  const latestConfirmedSighting = actualSightings.length > 0 ? actualSightings[actualSightings.length - 1] : null;
  const estimationBaseSighting = latestConfirmedSighting ?? baselineSighting;
  const estimatedAverageSpeedKmh =
    manualSpeedKmh ?? latestConfirmedSighting?.estimatedAverageSpeedKmh ?? baselineSighting.estimatedAverageSpeedKmh;
  const hoursSinceLatestUpdate = holdAtStartUntilLiveRun
    ? 0
    : Math.max(0, (now.getTime() - new Date(estimationBaseSighting.sightingTimeIso).getTime()) / 3_600_000);
  const estimatedDistanceKm = clampNumber(
    roundTo(
      estimationBaseSighting.distanceAlongRouteKm + hoursSinceLatestUpdate * estimatedAverageSpeedKmh,
      3
    ),
    0,
    routeLengthKm
  );
  const estimatedPosition = interpolatePositionAlongRoute(route, estimatedDistanceKm);
  const confidenceDetails = deriveConfidence(
    latestConfirmedSighting?.confidence ?? baselineSighting.confidence,
    Math.max(0, (now.getTime() - new Date(estimationBaseSighting.sightingTimeIso).getTime()) / 60_000)
  );
  const fallbackConfidenceReason =
    holdAtStartUntilLiveRun
      ? "Tracker is waiting for the admin to start the live public run, so the bus is pinned at the route start."
      : now.getTime() < new Date(paradeStartIso).getTime()
      ? "Parade has not started yet, so the tracker is pinned to the planned start checkpoint."
      : "No confirmed public sighting yet, so the estimate is still using the scheduled start assumption.";

  return {
    paradeStartIso,
    evaluatedAtIso: now.toISOString(),
    routeLengthKm,
    latestConfirmedSighting,
    latestSourceNote: latestConfirmedSighting?.sourceNote ?? baselineSighting.sourceNote,
    estimatedAverageSpeedKmh,
    latestObservedSegmentSpeedKmh: latestConfirmedSighting?.observedSegmentSpeedKmh ?? null,
    latestSegmentDistanceKm: latestConfirmedSighting?.distanceFromPreviousKm ?? null,
    latestSegmentMinutes: latestConfirmedSighting?.minutesFromPrevious ?? null,
    estimatedDistanceKm,
    estimatedPosition,
    estimatedPositionLabel: describeEstimatedPosition(estimatedDistanceKm, checkpoints, routeLengthKm),
    confidenceLevel: latestConfirmedSighting ? confidenceDetails.level : baselineSighting.confidence,
    confidenceReason: latestConfirmedSighting ? confidenceDetails.reason : fallbackConfidenceReason,
    storageMode
  };
}
