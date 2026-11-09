"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";

const ICON = {
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
};

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
}

/** Read-only map of pins with a "Get directions" hand-off per pin. */
export function MapView({
  pins,
  height = "h-72",
}: {
  pins: MapPin[];
  height?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current).setView([30.3753, 69.3451], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      const icon = L.icon(ICON);
      const valid = pins.filter((p) => p.lat != null && p.lng != null);
      const latlngs: [number, number][] = [];
      for (const p of valid) {
        const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        const dir = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
        m.bindPopup(
          `<div style="min-width:150px">
             <strong>${escapeHtml(p.title)}</strong><br/>
             <span style="color:#666">${escapeHtml(p.subtitle ?? "")}</span><br/>
             <a href="${dir}" target="_blank" rel="noopener"
                style="color:#059669;font-weight:600">Get directions →</a>
           </div>`
        );
        latlngs.push([p.lat, p.lng]);
      }
      if (latlngs.length === 1) map.setView(latlngs[0], 15);
      else if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [40, 40] });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pins.map((p) => p.id))]);

  return (
    <div
      ref={ref}
      className={`${height} w-full overflow-hidden rounded-lg border border-gray-300`}
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<string, string>)[c]
  );
}
