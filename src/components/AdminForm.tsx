"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { snapPointToRoute } from "@/lib/geo";
import type { AdminApiPayload, ConfidenceLevel, RouteEditorInput, RouteSnap, SightingInput } from "@/lib/types";

const TrackerMap = dynamic(() => import("@/components/map/TrackerMap"), {
  ssr: false,
  loading: () => <div className="map-shell" />
});

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const confidenceOptions: ConfidenceLevel[] = ["low", "medium", "high"];

export function AdminForm() {
  const [payload, setPayload] = useState<AdminApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sightingSubmitting, setSightingSubmitting] = useState(false);
  const [routeSubmitting, setRouteSubmitting] = useState(false);
  const [simulationSubmitting, setSimulationSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [adminPassword, setAdminPassword] = useState("");
  const [sightingTimeLocal, setSightingTimeLocal] = useState(toDatetimeLocalValue(new Date()));
  const [useCurrentTrackerTime, setUseCurrentTrackerTime] = useState(true);
  const [sourceNote, setSourceNote] = useState("Instagram story");
  const [confidence, setConfidence] = useState<ConfidenceLevel>("high");
  const [draftSelection, setDraftSelection] = useState<RouteSnap | null>(null);
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [routeDraftPoints, setRouteDraftPoints] = useState<{ latitude: number; longitude: number }[]>([]);

  const refreshAdminData = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/sighting", { cache: "no-store" });
      const data = (await response.json()) as AdminApiPayload;

      if (!response.ok) {
        throw new Error("Unable to load admin tracker state.");
      }

      setPayload(data);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to load admin tracker state."
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAdminData();
  }, []);

  const latestSummary = useMemo(() => payload?.snapshot.latestConfirmedSighting ?? null, [payload]);
  const currentRoutePointCount = payload?.route.geometry.coordinates.length ?? 0;
  const effectiveNowLabel = payload
    ? formatDateTime(payload.simulation.effectiveNowIso)
    : "Loading...";

  const handleMapClick = (latitude: number, longitude: number) => {
    if (!payload) {
      return;
    }

    if (routeEditMode) {
      setRouteDraftPoints((current) => [...current, { latitude, longitude }]);
      setFeedback(null);
      return;
    }

    setDraftSelection(
      snapPointToRoute(
        payload.route,
        payload.checkpoints,
        latitude,
        longitude,
        latestSummary?.distanceAlongRouteKm ?? 0
      )
    );
    setFeedback(null);
  };

  const startRouteEdit = () => {
    if (!payload) {
      return;
    }

    setRouteDraftPoints(
      payload.route.geometry.coordinates.map(([longitude, latitude]) => ({
        latitude,
        longitude
      }))
    );
    setRouteEditMode(true);
    setDraftSelection(null);
    setFeedback(null);
  };

  const clearRouteDraft = () => {
    setRouteDraftPoints([]);
    setFeedback(null);
  };

  const undoRoutePoint = () => {
    setRouteDraftPoints((current) => current.slice(0, -1));
    setFeedback(null);
  };

  const cancelRouteEdit = () => {
    setRouteEditMode(false);
    setRouteDraftPoints([]);
    setFeedback(null);
  };

  const handleSaveRoute = async () => {
    if (routeDraftPoints.length < 2) {
      setFeedback({
        type: "error",
        message: "Add at least two route points before saving."
      });
      return;
    }

    setRouteSubmitting(true);
    setFeedback(null);

    const body: RouteEditorInput & { adminPassword: string } = {
      adminPassword,
      coordinates: routeDraftPoints.map((point) => [point.longitude, point.latitude])
    };

    try {
      const response = await fetch("/api/admin/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save route.");
      }

      setFeedback({
        type: "success",
        message: "Route saved. The public map and admin tools are now using the newly drawn path."
      });
      setRouteEditMode(false);
      setRouteDraftPoints([]);
      setDraftSelection(null);
      await refreshAdminData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save route."
      });
    } finally {
      setRouteSubmitting(false);
    }
  };

  const handleSaveSighting = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draftSelection) {
      setFeedback({
        type: "error",
        message: "Click the map first to place the next confirmed sighting."
      });
      return;
    }

    setSightingSubmitting(true);
    setFeedback(null);

    const body: SightingInput & { adminPassword: string } = {
      adminPassword,
      latitude: draftSelection.latitude,
      longitude: draftSelection.longitude,
      sourceNote,
      confidence
    };

    if (!useCurrentTrackerTime) {
      body.sightingTimeIso = new Date(sightingTimeLocal).toISOString();
    }

    try {
      const response = await fetch("/api/admin/sighting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save sighting.");
      }

      setFeedback({
        type: "success",
        message: "Sighting saved. The public tracker will pick up the new estimate automatically."
      });
      setDraftSelection(null);
      await refreshAdminData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save sighting."
      });
    } finally {
      setSightingSubmitting(false);
    }
  };

  const handleSimulationAction = async (action: "start" | "stop") => {
    setSimulationSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/simulation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          adminPassword,
          action,
          simulatedStartIso: payload?.snapshot.paradeStartIso,
          resetSightings: action === "start"
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update simulation state.");
      }

      setFeedback({
        type: "success",
        message:
          action === "start"
            ? "Fresh simulation started. The tracker now treats the current moment as parade time and previous sightings were cleared."
            : "Simulation stopped. The tracker is back on real time."
      });
      await refreshAdminData();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update simulation state."
      });
    } finally {
      setSimulationSubmitting(false);
    }
  };

  if (!payload) {
    return (
      <div className="field-grid">
        <p className="helper-text">{feedback?.message ?? "Loading admin tools..."}</p>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <section className="map-card">
        <TrackerMap
          route={payload.route}
          estimatedPosition={payload.snapshot.estimatedPosition}
          estimatedPositionLabel={payload.snapshot.estimatedPositionLabel}
          draftPosition={
            !routeEditMode && draftSelection
              ? {
                  latitude: draftSelection.latitude,
                  longitude: draftSelection.longitude,
                  label: draftSelection.label
                }
              : null
          }
          routeDraftPoints={routeEditMode ? routeDraftPoints : []}
          routeEditMode={routeEditMode}
          onMapClick={handleMapClick}
        />
      </section>

      <section className="admin-card">
        <div className="admin-header">
          <div>
            <p className="metric-label">Admin console</p>
            <h2 className="admin-title">{routeEditMode ? "Route editor" : "Route and sighting tools"}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={() => void refreshAdminData()} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="metric-list">
          <div className="metric">
            <p className="metric-label">Current live marker</p>
            <p className="metric-value">{payload.snapshot.estimatedPositionLabel}</p>
            <p className="metric-subtle">
              Latest confirmed: {latestSummary ? latestSummary.checkpointName : "No manual sighting yet"}
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Tracker clock</p>
            <p className="metric-value">{payload.simulation.isActive ? "Simulation active" : "Real time"}</p>
            <p className="metric-subtle">
              Effective tracker time: {effectiveNowLabel}
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Persistence status</p>
            <p className="metric-value">
              {payload.persistence.databaseConfigured ? "Postgres configured" : "Postgres not configured"}
            </p>
            <p className="metric-subtle">
              Route: {payload.persistence.routeStorageMode} • Sightings: {payload.persistence.sightingsStorageMode} •
              Simulation: {payload.persistence.simulationStorageMode}
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Estimated bus speed</p>
            <p className="metric-value">{payload.snapshot.estimatedAverageSpeedKmh.toFixed(2)} km/h</p>
            <p className="metric-subtle">
              {payload.snapshot.latestObservedSegmentSpeedKmh !== null
                ? `Latest raw segment speed: ${payload.snapshot.latestObservedSegmentSpeedKmh.toFixed(2)} km/h`
                : "Using the initial fallback speed until the first confirmed sighting."}
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Last measured segment</p>
            <p className="metric-value">
              {payload.snapshot.latestSegmentDistanceKm !== null && payload.snapshot.latestSegmentMinutes !== null
                ? `${payload.snapshot.latestSegmentDistanceKm.toFixed(2)} km in ${payload.snapshot.latestSegmentMinutes.toFixed(0)} min`
                : "No measured segment yet"}
            </p>
            <p className="metric-subtle">
              Distance is measured along the saved route line, not as straight-line click distance.
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Route editor status</p>
            <p className="metric-value">{routeEditMode ? "Editing route on live map" : "Locked to current saved route"}</p>
            <p className="metric-subtle">
              Saved route points: {currentRoutePointCount} • draft route points: {routeDraftPoints.length}
            </p>
          </div>

          <div className="metric">
            <p className="metric-label">Draft sighting</p>
            <p className="metric-value">{draftSelection?.label ?? "Click the map to place a sighting"}</p>
            <p className="metric-subtle">
              {draftSelection && !routeEditMode
                ? `${draftSelection.distanceAlongRouteKm.toFixed(2)} km along the route`
                : "When route edit mode is off, map clicks create the next sighting draft."}
            </p>
          </div>
        </div>

        <div className="editor-card">
          <p className="metric-label">Simulation controls</p>
          <p className="helper-text">
            Start simulation to treat the current moment as the parade start time, then let the tracker advance in real time from there.
          </p>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleSimulationAction("start")}
              disabled={simulationSubmitting}
            >
              {simulationSubmitting && !payload.simulation.isActive ? "Starting..." : "Start fresh simulation now"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleSimulationAction("stop")}
              disabled={simulationSubmitting || !payload.simulation.isActive}
            >
              {simulationSubmitting && payload.simulation.isActive ? "Stopping..." : "Stop simulation"}
            </button>
          </div>
          <p className="helper-text">
            Parade start target: {formatDateTime(payload.snapshot.paradeStartIso)}
          </p>
        </div>

        <div className="editor-card">
          <p className="metric-label">Clean reset route editor</p>
          <p className="helper-text">
            Turn on route edit mode, then click directly on the visible map roads to redraw the parade line.
            Save when the line sits correctly on the basemap.
          </p>
          <div className="action-row">
            {routeEditMode ? (
              <>
                <button className="secondary-button" type="button" onClick={undoRoutePoint} disabled={routeDraftPoints.length === 0 || routeSubmitting}>
                  Undo last point
                </button>
                <button className="secondary-button" type="button" onClick={clearRouteDraft} disabled={routeSubmitting}>
                  Clear draft
                </button>
                <button className="secondary-button" type="button" onClick={cancelRouteEdit} disabled={routeSubmitting}>
                  Cancel edit
                </button>
                <button className="primary-button" type="button" onClick={() => void handleSaveRoute()} disabled={routeSubmitting}>
                  {routeSubmitting ? "Saving route..." : "Save route"}
                </button>
              </>
            ) : (
              <button className="primary-button" type="button" onClick={startRouteEdit} disabled={loading}>
                Edit route on map
              </button>
            )}
          </div>
          {routeEditMode ? (
            <p className="helper-text">
              Click the map in travel order from Holloway Road / Drayton Park start all the way back to the same finish point.
            </p>
          ) : null}
        </div>

        <form className="field-grid" onSubmit={handleSaveSighting}>
          <div className="field-row">
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Leave blank only if ADMIN_PASSWORD is empty"
            />
          </div>

          <div className="field-row">
            <label htmlFor="use-current-time">Timing mode</label>
            <select
              id="use-current-time"
              value={useCurrentTrackerTime ? "live" : "manual"}
              onChange={(event) => setUseCurrentTrackerTime(event.target.value === "live")}
            >
              <option value="live">Use current tracker time</option>
              <option value="manual">Enter manual time</option>
            </select>
          </div>

          {useCurrentTrackerTime ? (
            <div className="metric">
              <p className="metric-label">Sighting time</p>
              <p className="metric-value">{effectiveNowLabel}</p>
              <p className="metric-subtle">
                This click will be treated as a live sighting at the tracker’s current effective time.
              </p>
            </div>
          ) : (
            <div className="field-row">
              <label htmlFor="sighting-time">Manual sighting time</label>
              <input
                id="sighting-time"
                type="datetime-local"
                value={sightingTimeLocal}
                onChange={(event) => setSightingTimeLocal(event.target.value)}
                required
              />
            </div>
          )}

          <div className="field-row">
            <label htmlFor="source-note">Source note</label>
            <textarea
              id="source-note"
              value={sourceNote}
              onChange={(event) => setSourceNote(event.target.value)}
              placeholder="Instagram story, Arsenal livestream, friend report..."
              required
            />
          </div>

          <div className="field-row">
            <label htmlFor="confidence">Confidence</label>
            <select id="confidence" value={confidence} onChange={(event) => setConfidence(event.target.value as ConfidenceLevel)} required>
              {confidenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              type="submit"
              disabled={sightingSubmitting || loading || routeEditMode}
            >
              {sightingSubmitting ? "Saving..." : "Save clicked sighting"}
            </button>
          </div>
        </form>

        <p className="helper-text">
          Sighting flow: keep route edit mode off, click the current route, then save the confirmed sighting.
        </p>
        <p className="helper-text">
          Speed model: each new sighting measures distance along the saved route between the last two confirmed
          points, calculates a raw segment speed, then blends that into the current estimate so one odd update
          does not swing the bus speed too hard.
        </p>
        {latestSummary ? (
          <p className="helper-text">
            Latest saved sighting: {latestSummary.checkpointName} at {formatDateTime(latestSummary.sightingTimeIso)}.
            Your next sighting should be later than that time and further along the route.
          </p>
        ) : null}

        {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}
      </section>
    </div>
  );
}
