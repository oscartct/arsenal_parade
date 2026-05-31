export type ConfidenceLevel = "low" | "medium" | "high";

export type StorageMode = "db" | "file" | "memory";

export type PersistenceInfo = {
  databaseConfigured: boolean;
  routeStorageMode: StorageMode;
  checkpointStorageMode: StorageMode;
  sightingsStorageMode: StorageMode;
  simulationStorageMode: StorageMode;
};

export type Checkpoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceAlongRouteKm: number;
};

export type SightingRecord = {
  id: string;
  checkpointId: string | null;
  checkpointName: string;
  latitude: number;
  longitude: number;
  distanceAlongRouteKm: number;
  sightingTimeIso: string;
  sourceNote: string;
  confidence: ConfidenceLevel;
  estimatedAverageSpeedKmh: number;
  observedSegmentSpeedKmh: number | null;
  distanceFromPreviousKm: number;
  minutesFromPrevious: number;
  createdAtIso: string;
};

export type SightingInput = {
  checkpointId?: string;
  latitude?: number;
  longitude?: number;
  sightingTimeIso?: string;
  sourceNote: string;
  confidence: ConfidenceLevel;
};

export type RouteFeature = {
  type: "Feature";
  properties: {
    name: string;
    note: string;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

export type RouteCoordinate = [number, number];

export type SimulationState = {
  isActive: boolean;
  offsetMs: number;
  anchorRealIso: string | null;
  anchorSimulatedIso: string | null;
};

export type TrackerControlState = {
  liveRunStartIso: string | null;
  manualSpeedKmh: number | null;
};

export type TrackerSnapshot = {
  paradeStartIso: string;
  evaluatedAtIso: string;
  routeLengthKm: number;
  latestConfirmedSighting: SightingRecord | null;
  latestSourceNote: string;
  estimatedAverageSpeedKmh: number;
  latestObservedSegmentSpeedKmh: number | null;
  latestSegmentDistanceKm: number | null;
  latestSegmentMinutes: number | null;
  estimatedDistanceKm: number;
  estimatedPosition: {
    latitude: number;
    longitude: number;
  };
  estimatedPositionLabel: string;
  confidenceLevel: ConfidenceLevel;
  confidenceReason: string;
  storageMode: StorageMode;
};

export type TrackerApiPayload = {
  route: RouteFeature;
  checkpoints: Checkpoint[];
  snapshot: TrackerSnapshot;
  persistence: PersistenceInfo;
  control: TrackerControlState;
  simulation: SimulationState & {
    effectiveNowIso: string;
  };
  config: {
    routePollIntervalMs: number;
  };
};

export type AdminApiPayload = {
  route: RouteFeature;
  checkpoints: Checkpoint[];
  sightings: SightingRecord[];
  snapshot: TrackerSnapshot;
  persistence: PersistenceInfo;
  control: TrackerControlState;
  simulation: SimulationState & {
    effectiveNowIso: string;
  };
};

export type RouteSnap = {
  latitude: number;
  longitude: number;
  distanceAlongRouteKm: number;
  label: string;
};

export type RouteEditorInput = {
  coordinates: RouteCoordinate[];
};
