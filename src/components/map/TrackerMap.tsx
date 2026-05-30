"use client";

import { useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
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
  routeDraftPoints?: {
    latitude: number;
    longitude: number;
  }[];
  routeEditMode?: boolean;
  onMapClick?: (latitude: number, longitude: number) => void;
};

const busIcon = L.divIcon({
  html: '<div class="bus-pin" aria-hidden="true"><img src="/arsenal-bus.png" alt="" /></div>',
  className: "",
  iconSize: [76, 56],
  iconAnchor: [38, 28]
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
  routeDraftPoints = [],
  routeEditMode = false,
  onMapClick
}: TrackerMapProps) {
  const routeLatLngs = useMemo(
    () => route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    [route.geometry.coordinates]
  );
  const routeDraftLatLngs = useMemo(
    () => routeDraftPoints.map((point) => [point.latitude, point.longitude] as [number, number]),
    [routeDraftPoints]
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
          color: routeEditMode ? "rgba(216, 25, 42, 0.35)" : "#d8192a",
          weight: routeEditMode ? 6 : 8,
          opacity: 0.95
        }}
      />

      {routeDraftLatLngs.length > 0 ? (
        <Polyline
          positions={routeDraftLatLngs}
          pathOptions={{
            color: "#d8192a",
            weight: 6,
            opacity: 0.92
          }}
        />
      ) : null}

      {routeDraftPoints.map((point, index) => (
        <CircleMarker
          key={`${point.latitude}-${point.longitude}-${index}`}
          center={[point.latitude, point.longitude]}
          radius={routeEditMode ? 6 : 4}
          pathOptions={{
            color: "#fff7f0",
            weight: 2,
            fillColor: routeEditMode ? "#d8192a" : "#8a101c",
            fillOpacity: 1
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            Route point {index + 1}
          </Tooltip>
        </CircleMarker>
      ))}

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
