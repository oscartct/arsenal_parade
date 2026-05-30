"use client";

import Link from "next/link";
import type { TrackerApiPayload } from "@/lib/types";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(2)} km`;
}

type TrackerPanelProps = {
  payload: TrackerApiPayload;
  simulationModeLabel: string;
  draftSimulationNow: string;
  onDraftSimulationNowChange: (value: string) => void;
  onApplySimulationNow: () => void;
  onClearSimulationNow: () => void;
};

export function TrackerPanel({
  payload,
  simulationModeLabel,
  draftSimulationNow,
  onDraftSimulationNowChange,
  onApplySimulationNow,
  onClearSimulationNow
}: TrackerPanelProps) {
  const { snapshot } = payload;

  return (
    <aside className="panel-card">
      <div className="panel-header">
        <div>
          <p className="metric-label">Public tracker</p>
          <h2 className="panel-title">Current estimate</h2>
        </div>
        <div className="status-pill">{simulationModeLabel}</div>
      </div>

      <div className="metric-list">
        <div className="metric">
          <p className="metric-label">Latest confirmed sighting</p>
          <p className="metric-value">
            {snapshot.latestConfirmedSighting?.checkpointName ?? "Awaiting first public sighting"}
          </p>
          <p className="metric-subtle">
            {snapshot.latestConfirmedSighting
              ? formatDateTime(snapshot.latestConfirmedSighting.sightingTimeIso)
              : `Using parade start assumption from ${formatDateTime(snapshot.paradeStartIso)}`}
          </p>
        </div>

        <div className="metric">
          <p className="metric-label">Estimated current position</p>
          <p className="metric-value">{snapshot.estimatedPositionLabel}</p>
          <p className="metric-subtle">{formatDistance(snapshot.estimatedDistanceKm)} along the route</p>
        </div>

        <div className="metric">
          <p className="metric-label">Estimated average speed</p>
          <p className="metric-value">{snapshot.estimatedAverageSpeedKmh.toFixed(2)} km/h</p>
          <p className="metric-subtle">
            Based on the latest confirmed checkpoint timing and the current route estimate
          </p>
        </div>

        <div className="metric">
          <p className="metric-label">Confidence level</p>
          <p className="metric-value">{snapshot.confidenceLevel}</p>
          <p className="metric-subtle">{snapshot.confidenceReason}</p>
        </div>

        <div className="metric">
          <p className="metric-label">Latest source note</p>
          <p className="metric-value">{snapshot.latestSourceNote}</p>
          <p className="metric-subtle">
            Last refreshed at {formatDateTime(snapshot.evaluatedAtIso)} • storage mode: {snapshot.storageMode}
          </p>
        </div>
      </div>

      <div className="sim-card">
        <p className="metric-label">Simulation time override</p>
        <div className="field-grid">
          <div className="field-row">
            <label htmlFor="simulation-now">Preview tracker at a custom current time</label>
            <input
              id="simulation-now"
              type="datetime-local"
              value={draftSimulationNow}
              onChange={(event) => onDraftSimulationNowChange(event.target.value)}
            />
          </div>
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={onApplySimulationNow}>
              Apply simulation time
            </button>
            <button className="secondary-button" type="button" onClick={onClearSimulationNow}>
              Reset to live time
            </button>
          </div>
          <p className="helper-text">
            Try `2026-05-31 14:00` to simulate the parade start, then save sightings from{" "}
            <Link className="inline-link" href="/admin">
              the admin page
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="disclaimer">
        Unofficial approximate tracker. Not affiliated with Arsenal, Islington Council, or TfL.
      </div>
    </aside>
  );
}
