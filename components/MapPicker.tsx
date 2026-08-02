"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { Button } from "@/components/ui";

const ICON = {
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41] as [number, number],
  iconAnchor: [12, 41] as [number, number],
};

/** Draggable pin-drop map for capturing a shop's coordinates. */
export function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const start: [number, number] =
        lat != null && lng != null ? [lat, lng] : [30.3753, 69.3451];
      const map = L.map(ref.current).setView(start, lat != null ? 15 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.icon(ICON);
      const place = (la: number, ln: number) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([la, ln]);
        } else {
          const m = L.marker([la, ln], { draggable: true, icon }).addTo(map);
          m.on("dragend", () => {
            const p = m.getLatLng();
            onChangeRef.current(round(p.lat), round(p.lng));
          });
          markerRef.current = m;
        }
      };
      if (lat != null && lng != null) place(lat, lng);

      map.on("click", (e: L.LeafletMouseEvent) => {
        place(e.latlng.lat, e.latlng.lng);
        onChangeRef.current(round(e.latlng.lat), round(e.latlng.lng));
      });

      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync when coordinates are typed manually.
  useEffect(() => {
    (async () => {
      if (lat == null || lng == null || !mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else {
        const m = L.marker([lat, lng], {
          draggable: true,
          icon: L.icon(ICON),
        }).addTo(mapRef.current);
        m.on("dragend", () => {
          const p = m.getLatLng();
          onChangeRef.current(round(p.lat), round(p.lng));
        });
        markerRef.current = m;
      }
    })();
  }, [lat, lng]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = round(pos.coords.latitude);
        const ln = round(pos.coords.longitude);
        onChangeRef.current(la, ln);
        mapRef.current?.setView([la, ln], 16);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <div
        ref={ref}
        className="h-64 w-full overflow-hidden rounded-lg border border-gray-300"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Click the map or drag the pin to set the shop location.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? "Locating…" : "📍 Use my location"}
        </Button>
      </div>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
