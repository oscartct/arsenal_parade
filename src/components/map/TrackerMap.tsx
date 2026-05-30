"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { RouteFeature } from "@/lib/types";

type TrackerMapProps = {
  route: RouteFeature;
  estimatedPosition: {
    latitude: number;
    longitude: number;
  };
  estimatedPositionLabel: string;
  draftPosition?: {
    latitude: number;
    longitude: number;
    label: string;
  } | null;
  onMapClick?: (latitude: number, longitude: number) => void;
};

const busIcon = L.divIcon({
  html: '<div class="bus-pin" aria-hidden="true">🚌</div>',
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const draftIcon = L.divIcon({
  html: '<div class="draft-pin" aria-hidden="true">+</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

function MapClickHandler({ onMapClick }: { onMapClick?: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    }
  });

  return null;
}

export default function TrackerMap({
  route,
  estimatedPosition,
  estimatedPositionLabel,
  draftPosition = null,
  onMapClick
}: TrackerMapProps) {
  const routeLatLngs = useMemo(
    () => route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    [route.geometry.coordinates]
  );

  const liveMarkerPosition = useMemo<[number, number]>(
    () => [estimatedPosition.latitude, estimatedPosition.longitude],
    [estimatedPosition.latitude, estimatedPosition.longitude]
  );

  return (
    <MapContainer className="tracker-map" bounds={routeLatLngs} scrollWheelZoom={true}>
      <MapClickHandler onMapClick={onMapClick} />
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

      <Marker position={liveMarkerPosition} icon={busIcon}>
        <Tooltip direction="top" offset={[0, -18]} opacity={1}>
          {estimatedPositionLabel}
        </Tooltip>
      </Marker>

      {draftPosition ? (
        <Marker position={[draftPosition.latitude, draftPosition.longitude]} icon={draftIcon}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1}>
            {draftPosition.label}
          </Tooltip>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
