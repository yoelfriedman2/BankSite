"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  role: "anchor" | "must-visit" | "accepted" | "candidate";
  addedMinutes?: number; // shown in the popup for candidates
};

const ROLE_STYLE: Record<MapPoint["role"], { color: string; radius: number; fillOpacity: number }> = {
  anchor: { color: "#d97706", radius: 10, fillOpacity: 0.95 },
  "must-visit": { color: "#2563eb", radius: 8, fillOpacity: 0.9 },
  accepted: { color: "#059669", radius: 8, fillOpacity: 0.9 },
  candidate: { color: "#64748b", radius: 6, fillOpacity: 0.85 },
};

/** No image assets (avoids the classic Leaflet-in-a-bundler broken-marker-icon
 *  issue entirely) — every point is a colored circle marker instead. */
export function RoadTripMap({
  points,
  routeLine,
  fitKey,
  onPointClick,
}: {
  points: MapPoint[];
  routeLine: { lat: number; lng: number }[];
  /** Bounds are only refit when this key changes, so toggling candidates on/off doesn't jump the map. */
  fitKey: string;
  onPointClick?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const lineRef = useRef<ReturnType<typeof import("leaflet")["polyline"]> | null>(null);
  const lastFitKey = useRef<string>("");

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([39.8, -98.6], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers + route whenever the point set or route changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const group = markersRef.current;
      if (cancelled || !map || !group) return;

      group.clearLayers();
      for (const p of points) {
        const style = ROLE_STYLE[p.role];
        const marker = L.circleMarker([p.lat, p.lng], {
          color: "#fff",
          weight: 1.5,
          fillColor: style.color,
          fillOpacity: style.fillOpacity,
          radius: style.radius,
        });
        const detour = p.addedMinutes != null ? `<div class="text-slate-500">+${Math.round(p.addedMinutes)} min detour</div>` : "";
        marker.bindPopup(
          `<div style="font:12px system-ui;min-width:140px"><div style="font-weight:600">${escapeHtml(p.name)}</div>${detour}</div>`,
        );
        if (onPointClick) marker.on("click", () => onPointClick(p.id));
        marker.addTo(group);
      }

      lineRef.current?.remove();
      if (routeLine.length > 1) {
        lineRef.current = L.polyline(
          routeLine.map((r) => [r.lat, r.lng]),
          { color: "#0f172a", weight: 2.5, opacity: 0.6, dashArray: "5,5" },
        ).addTo(map);
      }

      if (fitKey !== lastFitKey.current) {
        lastFitKey.current = fitKey;
        const boundsPoints = points.map((p) => [p.lat, p.lng] as [number, number]);
        if (boundsPoints.length) map.fitBounds(L.latLngBounds(boundsPoints), { padding: [24, 24], maxZoom: 11 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, routeLine, fitKey, onPointClick]);

  return <div ref={containerRef} className="h-full w-full rounded-xl" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
