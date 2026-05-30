"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { snapPointToRoute } from "@/lib/geo";
import type { AdminApiPayload, ConfidenceLevel, RouteSnap, SightingInput } from "@/lib/types";

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
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [adminPassword, setAdminPassword] = useState("");
  const [sightingTimeLocal, setSightingTimeLocal] = useState(toDatetimeLocalValue(new Date()));
  const [sourceNote, setSourceNote] = useState("Instagram story");
  const [confidence, setConfidence] = useState<ConfidenceLevel>("medium");
  const [draftSelection, setDraftSelection] = useState<RouteSnap | null>(null);

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

  const handleMapClick = (latitude: number, longitude: number) => {
    if (!payload) {
      return;
    }

    setDraftSelection(snapPointToRoute(payload.route, payload.checkpoints, latitude, longitude));
    setFeedback(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draftSelection) {
      setFeedback({
        type: "error",
        message: "Click the map first to place the next confirmed sighting."
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const body: SightingInput & { adminPassword: string } = {
      adminPassword,
      latitude: draftSelection.latitude,
      longitude: draftSelection.longitude,
      sightingTimeIso: new Date(sightingTimeLocal).toISOString(),
      sourceNote,
      confidence
    };

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
      setSubmitting(false);
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
            draftSelection
              ? {
                  latitude: draftSelection.latitude,
                  longitude: draftSelection.longitude,
                  label: draftSelection.label
                }
              : null
          }
          onMapClick={handleMapClick}
        />
      </section>

      <section className="admin-card">
        <div className="admin-header">
          <div>
            <p className="metric-label">Tester controls</p>
            <h2 className="admin-title">Save a manual sighting</h2>
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
            <p className="metric-label">Draft sighting</p>
            <p className="metric-value">{draftSelection?.label ?? "Click the map to place a sighting"}</p>
            <p className="metric-subtle">
              {draftSelection ? `${draftSelection.distanceAlongRouteKm.toFixed(2)} km along the route` : "The click will snap onto the route line automatically."}
            </p>
          </div>
        </div>

        <form className="field-grid" onSubmit={handleSubmit}>
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
            <label htmlFor="sighting-time">Sighting time</label>
            <input
              id="sighting-time"
              type="datetime-local"
              value={sightingTimeLocal}
              onChange={(event) => setSightingTimeLocal(event.target.value)}
              required
            />
          </div>

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
            <button className="primary-button" type="submit" disabled={submitting || loading}>
              {submitting ? "Saving..." : "Save clicked sighting"}
            </button>
          </div>
        </form>

        {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}

        <div className="history-list">
          {payload.sightings.slice().reverse().map((sighting) => (
            <div className="history-item" key={sighting.id}>
              <p>
                <strong>{sighting.checkpointName}</strong> at {formatDateTime(sighting.sightingTimeIso)}
              </p>
              <p>
                {sighting.sourceNote} • confidence {sighting.confidence} • speed {sighting.estimatedAverageSpeedKmh.toFixed(2)} km/h
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
