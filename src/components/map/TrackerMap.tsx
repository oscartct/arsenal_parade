"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { TrackerApiPayload } from "@/lib/types";

type TrackerMapProps = {
  payload: TrackerApiPayload;
};

const busIcon = L.divIcon({
  html: '<div class="bus-pin" aria-hidden="true">🚌</div>',
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

export default function TrackerMap({ payload }: TrackerMapProps) {
  const routeLatLngs = useMemo(
    () => payload.route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    [payload.route.geometry.coordinates]
  );

  const estimatedPosition = useMemo<[number, number]>(
    () => [payload.snapshot.estimatedPosition.latitude, payload.snapshot.estimatedPosition.longitude],
    [payload.snapshot.estimatedPosition.latitude, payload.snapshot.estimatedPosition.longitude]
  );

  return (
    <MapContainer className="tracker-map" bounds={routeLatLngs} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Polyline
        positions={routeLatLngs}
        pathOptions={{
          color: "#a98a2b",
          weight: 8,
          opacity: 0.95
        }}
      />

      <Marker position={estimatedPosition} icon={busIcon}>
        <Tooltip direction="top" offset={[0, -18]} opacity={1}>
          {payload.snapshot.estimatedPositionLabel}
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
