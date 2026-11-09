"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui";

export interface Photo {
  url: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Photo evidence capture.
 *
 * By default this is camera-only (`capture="environment"` opens the rear camera
 * directly on mobile). With `allowGallery`, the user may instead pick an existing
 * image — but the location is still read live from the device at upload time,
 * never from the file's EXIF, so the pin always reflects where the upload
 * happened rather than where the picture was originally taken.
 */
export function PhotoCapture({
  folder,
  value,
  onChange,
  label = "Photo (camera only)",
  allowGallery = false,
}: {
  folder: string;
  value: Photo | null;
  onChange: (p: Photo | null) => void;
  label?: string;
  allowGallery?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
      lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
    } catch {
      // location denied/unavailable — the photo still uploads
    }

    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const rand = Math.random().toString(36).slice(2);
    const path = `${folder}/${Date.now()}-${rand}.${ext}`;
    const { error } = await supabase.storage
      .from("evidence")
      .upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
    e.target.value = "";
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from("evidence").getPublicUrl(path);
    onChange({ url: data.publicUrl, lat, lng });
    setBusy(false);
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </span>

      {value ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt="captured"
            className="h-40 w-full rounded-lg border border-gray-200 object-cover"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {value.lat != null && value.lng != null
                ? `📍 ${value.lat}, ${value.lng}`
                : "⚠️ location not captured"}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="font-medium text-red-600 hover:underline"
            >
              {allowGallery ? "Replace" : "Retake"}
            </button>
          </div>
        </div>
      ) : allowGallery ? (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
            >
              <span className="text-2xl">📷</span>
              <span>{busy ? "Uploading…" : "Take photo"}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
            >
              <span className="text-2xl">🖼️</span>
              <span>{busy ? "Uploading…" : "Upload from gallery"}</span>
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Your current location is recorded either way — it is taken from this device
            now, not from the image file.
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 hover:border-emerald-400 hover:bg-emerald-50">
          <span className="text-2xl">📷</span>
          <span>{busy ? "Uploading…" : "Tap to open camera"}</span>
          <span className="text-xs text-gray-400">Live camera only — gallery is disabled</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={onFile}
          />
        </label>
      )}

      {err && (
        <div className="mt-2">
          <Alert tone="error">{err}</Alert>
        </div>
      )}
    </div>
  );
}
