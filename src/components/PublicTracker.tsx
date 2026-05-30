"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { TrackerApiPayload } from "@/lib/types";
import { TrackerPanel } from "@/components/TrackerPanel";

const TrackerMap = dynamic(() => import("@/components/map/TrackerMap"), {
  ssr: false,
  loading: () => <div className="map-shell map-card" />
});

function toLocalDatetimeValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PublicTracker() {
  const [simulationNow, setSimulationNow] = useState<string | null>(null);
  const [draftSimulationNow, setDraftSimulationNow] = useState("");
  const [payload, setPayload] = useState<TrackerApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlNow = new URL(window.location.href).searchParams.get("now");
    setSimulationNow(urlNow);
    setDraftSimulationNow(toLocalDatetimeValue(urlNow));
  }, []);

  const pollIntervalMs = payload?.config.routePollIntervalMs ?? 30000;

  useEffect(() => {
    let isActive = true;

    const fetchTracker = async () => {
      try {
        const query = simulationNow ? `?now=${encodeURIComponent(simulationNow)}` : "";
        const response = await fetch(`/api/tracker${query}`, { cache: "no-store" });
        const data = (await response.json()) as TrackerApiPayload;

        if (!response.ok) {
          throw new Error("Unable to load tracker state.");
        }

        if (isActive) {
          setPayload(data);
          setError(null);
        }
      } catch (fetchError) {
        if (isActive) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load tracker state.");
        }
      }
    };

    void fetchTracker();
    const interval = window.setInterval(() => {
      void fetchTracker();
    }, pollIntervalMs);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, simulationNow]);

  const simulationModeLabel = useMemo(() => {
    if (!simulationNow) {
      return "Live time";
    }

    const formatted = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(simulationNow));

    return `Simulation time: ${formatted}`;
  }, [simulationNow]);

  const applySimulationNow = () => {
    if (!draftSimulationNow) {
      setSimulationNow(null);
      window.history.replaceState({}, "", "/");
      return;
    }

    const nextIso = new Date(draftSimulationNow).toISOString();
    setSimulationNow(nextIso);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("now", nextIso);
    window.history.replaceState({}, "", nextUrl.toString());
  };

  const clearSimulationNow = () => {
    setDraftSimulationNow("");
    setSimulationNow(null);
    window.history.replaceState({}, "", "/");
  };

  if (!payload) {
    return (
      <section className="tracker-grid">
        <div className="map-card map-shell" />
        <aside className="panel-card">
          <div className="panel-header">
            <div>
              <p className="metric-label">Tracker status</p>
              <h2 className="panel-title">Loading estimate...</h2>
            </div>
          </div>
          <p className="helper-text">{error ?? "Fetching the current route and latest estimate."}</p>
        </aside>
      </section>
    );
  }

  return (
    <section className="tracker-grid">
      <div className="map-card">
        <div className="map-shell">
          <TrackerMap payload={payload} />
        </div>
      </div>

      <TrackerPanel
        payload={payload}
        simulationModeLabel={simulationModeLabel}
        draftSimulationNow={draftSimulationNow}
        onDraftSimulationNowChange={setDraftSimulationNow}
        onApplySimulationNow={applySimulationNow}
        onClearSimulationNow={clearSimulationNow}
      />
    </section>
  );
}
