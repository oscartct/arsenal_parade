"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { TrackerApiPayload } from "@/lib/types";

const TrackerMap = dynamic(() => import("@/components/map/TrackerMap"), {
  ssr: false,
  loading: () => <div className="map-shell" />
});

export function PublicTracker() {
  const [payload, setPayload] = useState<TrackerApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalMs = payload?.config.routePollIntervalMs ?? 30000;

  useEffect(() => {
    let isActive = true;

    const fetchTracker = async () => {
      try {
        const response = await fetch("/api/tracker", { cache: "no-store" });
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
  }, [pollIntervalMs]);

  return (
    <section className="public-map-card">
      {payload ? (
        <TrackerMap
          route={payload.route}
          estimatedPosition={payload.snapshot.estimatedPosition}
          estimatedPositionLabel={payload.snapshot.estimatedPositionLabel}
        />
      ) : (
        <div className="map-shell public-map-loading">
          <p>{error ?? "Loading tracker map..."}</p>
        </div>
      )}
    </section>
  );
}
