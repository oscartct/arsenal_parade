import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SPEED_KMH, PARADE_START_ISO, ROUTE_POLL_INTERVAL_MS } from "@/lib/config";
import {
  blendEstimatedSpeed,
  buildTrackerSnapshot,
  calculateSegmentMetrics,
  shouldUpdateEstimatedSpeed
} from "@/lib/estimation";
import { buildRouteFeature, projectCheckpointsOntoRoute, snapPointToRoute } from "@/lib/geo";
import type {
  AdminApiPayload,
  Checkpoint,
  RouteCoordinate,
  RouteEditorInput,
  RouteFeature,
  SimulationState,
  SightingInput,
  SightingRecord,
  TrackerApiPayload
} from "@/lib/types";

type GlobalState = typeof globalThis & {
  __arsenalParadeRoute?: RouteFeature;
  __arsenalParadeCheckpoints?: Checkpoint[];
  __arsenalParadeSightings?: SightingRecord[];
  __arsenalParadeSimulation?: SimulationState;
  __arsenalParadeRouteStorageMode?: "file" | "memory";
  __arsenalParadeStorageMode?: "file" | "memory";
  __arsenalParadeSimulationStorageMode?: "file" | "memory";
};

const runtimeState = globalThis as GlobalState;

function dataPath(fileName: string) {
  return path.join(process.cwd(), "src", "data", fileName);
}

async function readJsonFile<T>(fileName: string): Promise<T> {
  const raw = await fs.readFile(dataPath(fileName), "utf8");
  return JSON.parse(raw) as T;
}

async function writeJsonFile(fileName: string, value: unknown) {
  await fs.writeFile(dataPath(fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildDefaultSimulationState(): SimulationState {
  return {
    isActive: false,
    offsetMs: 0,
    anchorRealIso: null,
    anchorSimulatedIso: null
  };
}

export async function getRoute(): Promise<RouteFeature> {
  try {
    const route = await readJsonFile<RouteFeature>("route.geojson");
    runtimeState.__arsenalParadeRoute = route;
    runtimeState.__arsenalParadeRouteStorageMode = "file";
    return route;
  } catch {
    if (runtimeState.__arsenalParadeRoute) {
      runtimeState.__arsenalParadeRouteStorageMode = "memory";
      return runtimeState.__arsenalParadeRoute;
    }

    throw new Error("Route data is unavailable.");
  }
}

export async function getCheckpoints(): Promise<Checkpoint[]> {
  try {
    const checkpoints = await readJsonFile<Checkpoint[]>("checkpoints.json");
    const sorted = checkpoints.sort((left, right) => left.distanceAlongRouteKm - right.distanceAlongRouteKm);
    runtimeState.__arsenalParadeCheckpoints = sorted;
    runtimeState.__arsenalParadeRouteStorageMode = "file";
    return sorted;
  } catch {
    if (runtimeState.__arsenalParadeCheckpoints) {
      runtimeState.__arsenalParadeRouteStorageMode = "memory";
      return runtimeState.__arsenalParadeCheckpoints;
    }

    throw new Error("Checkpoint data is unavailable.");
  }
}

async function loadSightingsFromDisk() {
  const sightings = await readJsonFile<SightingRecord[]>("sightings.json");
  runtimeState.__arsenalParadeStorageMode = "file";
  runtimeState.__arsenalParadeSightings = sightings;
  return sightings;
}

export async function getSightings() {
  try {
    return await loadSightingsFromDisk();
  } catch {
    if (runtimeState.__arsenalParadeSightings) {
      runtimeState.__arsenalParadeStorageMode = "memory";
      return runtimeState.__arsenalParadeSightings;
    }

    runtimeState.__arsenalParadeStorageMode = "memory";
    runtimeState.__arsenalParadeSightings = [];
    return [];
  }
}

async function persistSightings(sightings: SightingRecord[]) {
  runtimeState.__arsenalParadeSightings = sightings;

  try {
    await writeJsonFile("sightings.json", sightings);
    runtimeState.__arsenalParadeStorageMode = "file";
  } catch {
    runtimeState.__arsenalParadeStorageMode = "memory";
  }
}

export async function clearSightings() {
  await persistSightings([]);
  return [];
}

export async function getSimulationState() {
  try {
    const simulation = await readJsonFile<SimulationState>("simulation.json");
    runtimeState.__arsenalParadeSimulation = simulation;
    runtimeState.__arsenalParadeSimulationStorageMode = "file";
    return simulation;
  } catch {
    if (runtimeState.__arsenalParadeSimulation) {
      runtimeState.__arsenalParadeSimulationStorageMode = "memory";
      return runtimeState.__arsenalParadeSimulation;
    }

    const fallback = buildDefaultSimulationState();
    runtimeState.__arsenalParadeSimulation = fallback;
    runtimeState.__arsenalParadeSimulationStorageMode = "memory";
    return fallback;
  }
}

async function persistSimulationState(simulation: SimulationState) {
  runtimeState.__arsenalParadeSimulation = simulation;

  try {
    await writeJsonFile("simulation.json", simulation);
    runtimeState.__arsenalParadeSimulationStorageMode = "file";
  } catch {
    runtimeState.__arsenalParadeSimulationStorageMode = "memory";
  }
}

async function persistRouteAndCheckpoints(route: RouteFeature, checkpoints: Checkpoint[]) {
  runtimeState.__arsenalParadeRoute = route;
  runtimeState.__arsenalParadeCheckpoints = checkpoints;

  try {
    await writeJsonFile("route.geojson", route);
    await writeJsonFile("checkpoints.json", checkpoints);
    runtimeState.__arsenalParadeRouteStorageMode = "file";
  } catch {
    runtimeState.__arsenalParadeRouteStorageMode = "memory";
  }
}

function buildSyntheticStartSighting(checkpoints: Checkpoint[]): SightingRecord {
  const startCheckpoint = checkpoints[0];

  return {
    id: "start-assumption",
    checkpointId: startCheckpoint.id,
    checkpointName: startCheckpoint.name,
    latitude: startCheckpoint.latitude,
    longitude: startCheckpoint.longitude,
    distanceAlongRouteKm: startCheckpoint.distanceAlongRouteKm,
    sightingTimeIso: PARADE_START_ISO,
    sourceNote: "Using the scheduled parade start as the initial estimate.",
    confidence: "medium",
    estimatedAverageSpeedKmh: DEFAULT_SPEED_KMH,
    observedSegmentSpeedKmh: null,
    distanceFromPreviousKm: 0,
    minutesFromPrevious: 0,
    createdAtIso: PARADE_START_ISO
  };
}

function parseNow(nowOverride?: string) {
  if (!nowOverride) {
    return new Date();
  }

  const parsed = new Date(nowOverride);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getEffectiveNow(simulation: SimulationState, realNow: Date) {
  if (!simulation.isActive) {
    return realNow;
  }

  return new Date(realNow.getTime() + simulation.offsetMs);
}

export async function getTrackerPayload(nowOverride?: string): Promise<TrackerApiPayload> {
  const [route, checkpoints, actualSightings, simulation] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState()
  ]);
  const realNow = parseNow(nowOverride);
  const effectiveNow = getEffectiveNow(simulation, realNow);
  const snapshot = buildTrackerSnapshot({
    route,
    checkpoints,
    actualSightings,
    now: effectiveNow,
    storageMode: runtimeState.__arsenalParadeStorageMode ?? "memory"
  });

  return {
    route,
    checkpoints,
    snapshot,
    simulation: {
      ...simulation,
      effectiveNowIso: effectiveNow.toISOString()
    },
    config: {
      routePollIntervalMs: ROUTE_POLL_INTERVAL_MS
    }
  };
}

export async function getAdminPayload(): Promise<AdminApiPayload> {
  const [route, checkpoints, sightings, simulation] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState()
  ]);
  const effectiveNow = getEffectiveNow(simulation, new Date());

  return {
    route,
    checkpoints,
    sightings,
    snapshot: buildTrackerSnapshot({
      route,
      checkpoints,
      actualSightings: sightings,
      now: effectiveNow,
      storageMode: runtimeState.__arsenalParadeStorageMode ?? "memory"
    }),
    simulation: {
      ...simulation,
      effectiveNowIso: effectiveNow.toISOString()
    }
  };
}

export async function saveSighting(input: SightingInput) {
  const [route, checkpoints, currentSightings, simulation] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState()
  ]);
  const sightingTime = input.sightingTimeIso
    ? new Date(input.sightingTimeIso)
    : getEffectiveNow(simulation, new Date());

  if (Number.isNaN(sightingTime.getTime())) {
    throw new Error("Invalid sighting time.");
  }

  const checkpoint = input.checkpointId
    ? checkpoints.find((entry) => entry.id === input.checkpointId)
    : undefined;
  const hasCoordinates = typeof input.latitude === "number" && typeof input.longitude === "number";

  if (!checkpoint && !hasCoordinates) {
    throw new Error("Select a checkpoint or click on the map to create a sighting.");
  }

  const previousSighting =
    currentSightings.length > 0 ? currentSightings[currentSightings.length - 1] : buildSyntheticStartSighting(checkpoints);
  const routeSelection = checkpoint
    ? {
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        distanceAlongRouteKm: checkpoint.distanceAlongRouteKm,
        label: checkpoint.name
      }
    : snapPointToRoute(
        route,
        checkpoints,
        input.latitude as number,
        input.longitude as number,
        previousSighting.distanceAlongRouteKm
      );

  const nextRecord: SightingRecord = {
    id: `${routeSelection.distanceAlongRouteKm}-${sightingTime.getTime()}`,
    checkpointId: checkpoint?.id ?? null,
    checkpointName: checkpoint?.name ?? routeSelection.label,
    latitude: routeSelection.latitude,
    longitude: routeSelection.longitude,
    distanceAlongRouteKm: routeSelection.distanceAlongRouteKm,
    sightingTimeIso: sightingTime.toISOString(),
    sourceNote: input.sourceNote.trim(),
    confidence: input.confidence,
    estimatedAverageSpeedKmh: DEFAULT_SPEED_KMH,
    observedSegmentSpeedKmh: null,
    distanceFromPreviousKm: 0,
    minutesFromPrevious: 0,
    createdAtIso: new Date().toISOString()
  };

  const segmentMetrics = calculateSegmentMetrics(previousSighting, nextRecord);
  nextRecord.distanceFromPreviousKm = segmentMetrics.distanceDeltaKm;
  nextRecord.minutesFromPrevious = segmentMetrics.elapsedMinutes;
  const shouldBlendSpeed = shouldUpdateEstimatedSpeed(
    segmentMetrics.distanceDeltaKm,
    segmentMetrics.elapsedMinutes
  );
  nextRecord.observedSegmentSpeedKmh = shouldBlendSpeed ? segmentMetrics.observedSpeedKmh : null;
  nextRecord.estimatedAverageSpeedKmh = shouldBlendSpeed
    ? blendEstimatedSpeed({
        previousEstimatedSpeedKmh: previousSighting.estimatedAverageSpeedKmh,
        observedSpeedKmh: segmentMetrics.observedSpeedKmh,
        confidence: input.confidence,
        distanceDeltaKm: segmentMetrics.distanceDeltaKm,
        elapsedHours: segmentMetrics.elapsedHours,
        isFirstConfirmedSighting: currentSightings.length === 0
      })
    : previousSighting.estimatedAverageSpeedKmh;

  const updatedSightings = [...currentSightings, nextRecord].sort(
    (left, right) => new Date(left.sightingTimeIso).getTime() - new Date(right.sightingTimeIso).getTime()
  );

  await persistSightings(updatedSightings);

  return {
    ok: true,
    sighting: nextRecord
  };
}

export async function saveRoute(input: RouteEditorInput) {
  if (input.coordinates.length < 2) {
    throw new Error("Add at least two route points before saving.");
  }

  const currentCheckpoints = await getCheckpoints();
  const cleanedCoordinates: RouteCoordinate[] = input.coordinates.map(([longitude, latitude]) => [
    Number(longitude.toFixed(6)),
    Number(latitude.toFixed(6))
  ]);
  const route = buildRouteFeature(cleanedCoordinates);
  const checkpoints = projectCheckpointsOntoRoute(route, currentCheckpoints);

  await persistRouteAndCheckpoints(route, checkpoints);

  return {
    ok: true,
    route,
    checkpoints
  };
}

export async function startSimulation(simulatedStartIso = PARADE_START_ISO) {
  const anchorReal = new Date();
  const anchorSimulated = new Date(simulatedStartIso);

  if (Number.isNaN(anchorSimulated.getTime())) {
    throw new Error("Invalid simulation start time.");
  }

  const simulation: SimulationState = {
    isActive: true,
    offsetMs: anchorSimulated.getTime() - anchorReal.getTime(),
    anchorRealIso: anchorReal.toISOString(),
    anchorSimulatedIso: anchorSimulated.toISOString()
  };

  await persistSimulationState(simulation);
  return simulation;
}

export async function stopSimulation() {
  const simulation = buildDefaultSimulationState();
  await persistSimulationState(simulation);
  return simulation;
}
