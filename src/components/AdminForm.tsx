"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminApiPayload, ConfidenceLevel, SightingInput } from "@/lib/types";

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
  const [checkpointId, setCheckpointId] = useState("");
  const [sightingTimeLocal, setSightingTimeLocal] = useState(toDatetimeLocalValue(new Date()));
  const [sourceNote, setSourceNote] = useState("Instagram story");
  const [confidence, setConfidence] = useState<ConfidenceLevel>("medium");

  const checkpoints = payload?.checkpoints ?? [];

  const refreshAdminData = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/sighting", { cache: "no-store" });
      const data = (await response.json()) as AdminApiPayload;

      if (!response.ok) {
        throw new Error("Unable to load admin tracker state.");
      }

      setPayload(data);
      setCheckpointId((current) => current || data.checkpoints[0]?.id || "");
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const body: SightingInput & { adminPassword: string } = {
      adminPassword,
      checkpointId,
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
        message: "Sighting saved. The tracker estimate has been recalculated."
      });
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

  return (
    <div className="field-grid">
      <div className="admin-header">
        <div>
          <p className="metric-label">Admin update flow</p>
          <h2 className="admin-title">Latest tracker state</h2>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshAdminData()} disabled={loading}>
          Refresh
        </button>
      </div>

      {payload ? (
        <div className="metric-list">
          <div className="metric">
            <p className="metric-label">Latest confirmed checkpoint</p>
            <p className="metric-value">{latestSummary?.checkpointName ?? "No manual sighting saved yet"}</p>
            <p className="metric-subtle">
              {latestSummary ? formatDateTime(latestSummary.sightingTimeIso) : "The public page is still using the start assumption."}
            </p>
          </div>
        </div>
      ) : null}

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
          <label htmlFor="checkpoint">Checkpoint</label>
          <select id="checkpoint" value={checkpointId} onChange={(event) => setCheckpointId(event.target.value)} required>
            {checkpoints.map((checkpoint) => (
              <option key={checkpoint.id} value={checkpoint.id}>
                {checkpoint.name} ({checkpoint.distanceAlongRouteKm.toFixed(2)} km)
              </option>
            ))}
          </select>
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
            {submitting ? "Saving..." : "Save latest sighting"}
          </button>
        </div>
      </form>

      {feedback ? <p className={`feedback ${feedback.type}`}>{feedback.message}</p> : null}

      <p className="helper-text">
        Local JSON writes are fine for dev. On Railway, treat this as a temporary placeholder until we swap the
        store to a real database.
      </p>

      {payload ? (
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
      ) : null}
    </div>
  );
}
