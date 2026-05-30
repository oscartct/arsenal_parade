export type ConfidenceLevel = "low" | "medium" | "high";

export type Checkpoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceAlongRouteKm: number;
};

export type SightingRecord = {
  id: string;
  checkpointId: string;
  checkpointName: string;
  latitude: number;
  longitude: number;
  distanceAlongRouteKm: number;
  sightingTimeIso: string;
  sourceNote: string;
  confidence: ConfidenceLevel;
  estimatedAverageSpeedKmh: number;
  createdAtIso: string;
};

export type SightingInput = {
  checkpointId: string;
  sightingTimeIso: string;
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

export type TrackerSnapshot = {
  paradeStartIso: string;
  evaluatedAtIso: string;
  routeLengthKm: number;
  latestConfirmedSighting: SightingRecord | null;
  latestSourceNote: string;
  estimatedAverageSpeedKmh: number;
  estimatedDistanceKm: number;
  estimatedPosition: {
    latitude: number;
    longitude: number;
  };
  estimatedPositionLabel: string;
  confidenceLevel: ConfidenceLevel;
  confidenceReason: string;
  storageMode: "file" | "memory";
};

export type TrackerApiPayload = {
  route: RouteFeature;
  checkpoints: Checkpoint[];
  snapshot: TrackerSnapshot;
  config: {
    routePollIntervalMs: number;
  };
};

export type AdminApiPayload = {
  checkpoints: Checkpoint[];
  sightings: SightingRecord[];
  snapshot: TrackerSnapshot;
};
