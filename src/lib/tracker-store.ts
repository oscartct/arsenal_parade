import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SPEED_KMH, PARADE_START_ISO, ROUTE_POLL_INTERVAL_MS } from "@/lib/config";
import { hasDatabaseConnection, readDatabaseState, writeDatabaseState } from "@/lib/database";
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
  StorageMode,
  TrackerControlState,
  TrackerApiPayload
} from "@/lib/types";

type GlobalState = typeof globalThis & {
  __arsenalParadeRoute?: RouteFeature;
  __arsenalParadeCheckpoints?: Checkpoint[];
  __arsenalParadeSightings?: SightingRecord[];
  __arsenalParadeSimulation?: SimulationState;
  __arsenalParadeControl?: TrackerControlState;
  __arsenalParadeRouteStorageMode?: StorageMode;
  __arsenalParadeStorageMode?: StorageMode;
  __arsenalParadeSimulationStorageMode?: StorageMode;
  __arsenalParadeControlStorageMode?: StorageMode;
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

async function loadStoredValue<T>({
  key,
  fileName,
  cacheKey,
  storageModeKey,
  fallbackFactory
}: {
  key: string;
  fileName: string;
  cacheKey:
    | "__arsenalParadeRoute"
    | "__arsenalParadeCheckpoints"
    | "__arsenalParadeSightings"
    | "__arsenalParadeSimulation"
    | "__arsenalParadeControl";
  storageModeKey:
    | "__arsenalParadeRouteStorageMode"
    | "__arsenalParadeStorageMode"
    | "__arsenalParadeSimulationStorageMode"
    | "__arsenalParadeControlStorageMode";
  fallbackFactory?: () => T;
}): Promise<T> {
  if (hasDatabaseConnection()) {
    const databaseValue = await readDatabaseState<T>(key);

    if (databaseValue !== null) {
      runtimeState[cacheKey] = databaseValue as never;
      runtimeState[storageModeKey] = "db";
      return databaseValue;
    }

    let seededValue: T;

    try {
      seededValue = await readJsonFile<T>(fileName);
    } catch {
      if (!fallbackFactory) {
        throw new Error(`${key} data is unavailable.`);
      }

      seededValue = fallbackFactory();
    }

    await writeDatabaseState(key, seededValue);
    runtimeState[cacheKey] = seededValue as never;
    runtimeState[storageModeKey] = "db";
    return seededValue;
  }

  try {
    const fileValue = await readJsonFile<T>(fileName);
    runtimeState[cacheKey] = fileValue as never;
    runtimeState[storageModeKey] = "file";
    return fileValue;
  } catch {
    const cachedValue = runtimeState[cacheKey];

    if (cachedValue !== undefined) {
      runtimeState[storageModeKey] = "memory";
      return cachedValue as T;
    }

    if (fallbackFactory) {
      const fallbackValue = fallbackFactory();
      runtimeState[cacheKey] = fallbackValue as never;
      runtimeState[storageModeKey] = "memory";
      return fallbackValue;
    }

    throw new Error(`${key} data is unavailable.`);
  }
}

async function persistStoredValue<T>({
  key,
  fileName,
  value,
  cacheKey,
  storageModeKey
}: {
  key: string;
  fileName: string;
  value: T;
  cacheKey:
    | "__arsenalParadeRoute"
    | "__arsenalParadeCheckpoints"
    | "__arsenalParadeSightings"
    | "__arsenalParadeSimulation"
    | "__arsenalParadeControl";
  storageModeKey:
    | "__arsenalParadeRouteStorageMode"
    | "__arsenalParadeStorageMode"
    | "__arsenalParadeSimulationStorageMode"
    | "__arsenalParadeControlStorageMode";
}) {
  runtimeState[cacheKey] = value as never;

  if (hasDatabaseConnection()) {
    await writeDatabaseState(key, value);
    runtimeState[storageModeKey] = "db";
    return;
  }

  if (isProductionRuntime()) {
    throw new Error("Persistent Postgres storage is not configured on the live app. Check DATABASE_URL in Railway.");
  }

  try {
    await writeJsonFile(fileName, value);
    runtimeState[storageModeKey] = "file";
  } catch {
    runtimeState[storageModeKey] = "memory";
  }
}

function buildDefaultSimulationState(): SimulationState {
  return {
    isActive: false,
    offsetMs: 0,
    anchorRealIso: null,
    anchorSimulatedIso: null
  };
}

function buildDefaultControlState(): TrackerControlState {
  return {
    liveRunStartIso: null,
    manualSpeedKmh: null
  };
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function buildPersistenceInfo() {
  return {
    databaseConfigured: hasDatabaseConnection(),
    routeStorageMode: runtimeState.__arsenalParadeRouteStorageMode ?? "memory",
    checkpointStorageMode: runtimeState.__arsenalParadeRouteStorageMode ?? "memory",
    sightingsStorageMode: runtimeState.__arsenalParadeStorageMode ?? "memory",
    simulationStorageMode: runtimeState.__arsenalParadeSimulationStorageMode ?? "memory"
  };
}

function getEffectiveParadeStartIso(control: TrackerControlState) {
  return control.liveRunStartIso ?? PARADE_START_ISO;
}

export async function getRoute(): Promise<RouteFeature> {
  return loadStoredValue<RouteFeature>({
    key: "route",
    fileName: "route.geojson",
    cacheKey: "__arsenalParadeRoute",
    storageModeKey: "__arsenalParadeRouteStorageMode"
  });
}

export async function getCheckpoints(): Promise<Checkpoint[]> {
  const checkpoints = await loadStoredValue<Checkpoint[]>({
    key: "checkpoints",
    fileName: "checkpoints.json",
    cacheKey: "__arsenalParadeCheckpoints",
    storageModeKey: "__arsenalParadeRouteStorageMode"
  });

  const sorted = [...checkpoints].sort((left, right) => left.distanceAlongRouteKm - right.distanceAlongRouteKm);
  runtimeState.__arsenalParadeCheckpoints = sorted;
  return sorted;
}

export async function getSightings() {
  return loadStoredValue<SightingRecord[]>({
    key: "sightings",
    fileName: "sightings.json",
    cacheKey: "__arsenalParadeSightings",
    storageModeKey: "__arsenalParadeStorageMode",
    fallbackFactory: () => []
  });
}

async function persistSightings(sightings: SightingRecord[]) {
  await persistStoredValue({
    key: "sightings",
    fileName: "sightings.json",
    value: sightings,
    cacheKey: "__arsenalParadeSightings",
    storageModeKey: "__arsenalParadeStorageMode"
  });
}

export async function clearSightings() {
  await persistSightings([]);
  return [];
}

export async function getSimulationState() {
  return loadStoredValue<SimulationState>({
    key: "simulation",
    fileName: "simulation.json",
    cacheKey: "__arsenalParadeSimulation",
    storageModeKey: "__arsenalParadeSimulationStorageMode",
    fallbackFactory: buildDefaultSimulationState
  });
}

export async function getControlState() {
  return loadStoredValue<TrackerControlState>({
    key: "control",
    fileName: "control.json",
    cacheKey: "__arsenalParadeControl",
    storageModeKey: "__arsenalParadeControlStorageMode",
    fallbackFactory: buildDefaultControlState
  });
}

async function persistSimulationState(simulation: SimulationState) {
  await persistStoredValue({
    key: "simulation",
    fileName: "simulation.json",
    value: simulation,
    cacheKey: "__arsenalParadeSimulation",
    storageModeKey: "__arsenalParadeSimulationStorageMode"
  });
}

async function persistControlState(control: TrackerControlState) {
  await persistStoredValue({
    key: "control",
    fileName: "control.json",
    value: control,
    cacheKey: "__arsenalParadeControl",
    storageModeKey: "__arsenalParadeControlStorageMode"
  });
}

async function persistRouteAndCheckpoints(route: RouteFeature, checkpoints: Checkpoint[]) {
  await Promise.all([
    persistStoredValue({
      key: "route",
      fileName: "route.geojson",
      value: route,
      cacheKey: "__arsenalParadeRoute",
      storageModeKey: "__arsenalParadeRouteStorageMode"
    }),
    persistStoredValue({
      key: "checkpoints",
      fileName: "checkpoints.json",
      value: checkpoints,
      cacheKey: "__arsenalParadeCheckpoints",
      storageModeKey: "__arsenalParadeRouteStorageMode"
    })
  ]);
}

function buildSyntheticStartSighting(
  route: RouteFeature,
  checkpoints: Checkpoint[],
  paradeStartIso: string,
  baselineSpeedKmh: number
): SightingRecord {
  const startCheckpoint = checkpoints[0];
  const [startLongitude, startLatitude] = route.geometry.coordinates[0] ?? [
    startCheckpoint?.longitude ?? 0,
    startCheckpoint?.latitude ?? 0
  ];

  return {
    id: "start-assumption",
    checkpointId: null,
    checkpointName: startCheckpoint?.name ?? "Route start",
    latitude: startLatitude,
    longitude: startLongitude,
    distanceAlongRouteKm: 0,
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
  const [route, checkpoints, actualSightings, simulation, control] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState(),
    getControlState()
  ]);
  const realNow = parseNow(nowOverride);
  const effectiveNow = getEffectiveNow(simulation, realNow);
  const effectiveParadeStartIso = getEffectiveParadeStartIso(control);
  const holdAtStartUntilLiveRun = control.liveRunStartIso === null && actualSightings.length === 0 && !simulation.isActive;
  const snapshot = buildTrackerSnapshot({
    route,
    checkpoints,
    actualSightings,
    now: effectiveNow,
    storageMode: runtimeState.__arsenalParadeStorageMode ?? "memory",
    paradeStartIso: effectiveParadeStartIso,
    manualSpeedKmh: control.manualSpeedKmh,
    holdAtStartUntilLiveRun
  });

  return {
    route,
    checkpoints,
    snapshot,
    control,
    persistence: buildPersistenceInfo(),
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
  const [route, checkpoints, sightings, simulation, control] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState(),
    getControlState()
  ]);
  const effectiveNow = getEffectiveNow(simulation, new Date());
  const effectiveParadeStartIso = getEffectiveParadeStartIso(control);
  const holdAtStartUntilLiveRun = control.liveRunStartIso === null && sightings.length === 0 && !simulation.isActive;

  return {
    route,
    checkpoints,
    sightings,
    snapshot: buildTrackerSnapshot({
      route,
      checkpoints,
      actualSightings: sightings,
      now: effectiveNow,
      storageMode: runtimeState.__arsenalParadeStorageMode ?? "memory",
      paradeStartIso: effectiveParadeStartIso,
      manualSpeedKmh: control.manualSpeedKmh,
      holdAtStartUntilLiveRun
    }),
    control,
    persistence: buildPersistenceInfo(),
    simulation: {
      ...simulation,
      effectiveNowIso: effectiveNow.toISOString()
    }
  };
}

export async function saveSighting(input: SightingInput) {
  const [route, checkpoints, currentSightings, simulation, control] = await Promise.all([
    getRoute(),
    getCheckpoints(),
    getSightings(),
    getSimulationState(),
    getControlState()
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

  const effectiveParadeStartIso = getEffectiveParadeStartIso(control);
  const previousSighting =
    currentSightings.length > 0
      ? currentSightings[currentSightings.length - 1]
      : buildSyntheticStartSighting(route, checkpoints, effectiveParadeStartIso, control.manualSpeedKmh ?? DEFAULT_SPEED_KMH);
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
        previousEstimatedSpeedKmh: control.manualSpeedKmh ?? previousSighting.estimatedAverageSpeedKmh,
        observedSpeedKmh: segmentMetrics.observedSpeedKmh,
        confidence: input.confidence,
        distanceDeltaKm: segmentMetrics.distanceDeltaKm,
        elapsedHours: segmentMetrics.elapsedHours,
        isFirstConfirmedSighting: currentSightings.length === 0
      })
    : control.manualSpeedKmh ?? previousSighting.estimatedAverageSpeedKmh;

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

export async function startLiveRunNow() {
  const [currentControl] = await Promise.all([getControlState(), clearSightings(), stopSimulation()]);
  const nextControl: TrackerControlState = {
    ...currentControl,
    liveRunStartIso: new Date().toISOString()
  };
  await persistControlState(nextControl);
  return nextControl;
}

export async function resetLiveRunStart() {
  const [currentControl] = await Promise.all([getControlState(), clearSightings(), stopSimulation()]);
  const nextControl: TrackerControlState = {
    ...currentControl,
    liveRunStartIso: null
  };
  await persistControlState(nextControl);
  return nextControl;
}

export async function setManualSpeedOverride(speedKmh: number) {
  if (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > 20) {
    throw new Error("Manual speed must be between 0 and 20 km/h.");
  }

  const currentControl = await getControlState();
  const nextControl: TrackerControlState = {
    ...currentControl,
    manualSpeedKmh: Number(speedKmh.toFixed(2))
  };
  await persistControlState(nextControl);
  return nextControl;
}

export async function clearManualSpeedOverride() {
  const currentControl = await getControlState();
  const nextControl: TrackerControlState = {
    ...currentControl,
    manualSpeedKmh: null
  };
  await persistControlState(nextControl);
  return nextControl;
}

export async function fullResetTrackerState() {
  await clearSightings();
  await stopSimulation();
  const nextControl: TrackerControlState = {
    liveRunStartIso: null,
    manualSpeedKmh: null
  };
  await persistControlState(nextControl);
  return nextControl;
}
