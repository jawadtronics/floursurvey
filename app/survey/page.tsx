"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { MapView, type MapPin } from "@/components/MapView";
import { PhotoCapture, type Photo } from "@/components/PhotoCapture";
import { ageSince } from "@/lib/format";
import type { PendingShop } from "@/lib/types";

export default function SurveyPendingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<PendingShop[]>([]);
  const [view, setView] = useState<"list" | "map">("list");
  const [active, setActive] = useState<PendingShop | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("v_survey_pending")
      .select("*")
      .order("pending_since", { ascending: true });
    setShops((data as PendingShop[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    // live-ish refresh: the list is driven by shopkeeper RECEIVED taps
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const pins: MapPin[] = shops
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.shopkeeper_id,
      lat: s.latitude as number,
      lng: s.longitude as number,
      title: s.shop_name ?? s.shopkeeper_name,
      subtitle: `${s.shopkeeper_name} · pending ${ageSince(s.pending_since)}`,
    }));

  return (
    <div>
      <PageHeader
        title="Pending Shops in My Zone"
        subtitle="Visit each shop and record what the shopkeeper reports. You never see the system figures."
      >
        <div className="flex rounded-lg border border-gray-300 p-0.5">
          <button
            onClick={() => setView("list")}
            className={
              "rounded-md px-3 py-1 text-sm font-medium " +
              (view === "list" ? "bg-emerald-600 text-white" : "text-gray-600")
            }
          >
            List
          </button>
          <button
            onClick={() => setView("map")}
            className={
              "rounded-md px-3 py-1 text-sm font-medium " +
              (view === "map" ? "bg-emerald-600 text-white" : "text-gray-600")
            }
          >
            Map
          </button>
        </div>
      </PageHeader>

      {banner && (
        <div className="mb-4">
          <Alert tone="success">{banner}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : shops.length === 0 ? (
        <EmptyState>
          No shops are waiting for a survey right now. Shops appear here the moment a
          shopkeeper acknowledges a delivery.
        </EmptyState>
      ) : view === "map" ? (
        <Card className="p-3">
          <MapView pins={pins} height="h-[60vh]" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((s) => (
            <Card key={s.shopkeeper_id} className="flex flex-col p-4">
              <div className="flex-1">
                <div className="font-semibold text-gray-900">
                  {s.shop_name ?? "—"}
                </div>
                <div className="text-sm text-gray-600">{s.shopkeeper_name}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5">{s.zone}</span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">
                    pending {ageSince(s.pending_since)}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {s.latitude != null && s.longitude != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View on Map
                  </a>
                )}
                <Button className="flex-1" size="sm" onClick={() => setActive(s)}>
                  Survey
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SurveyForm
        shop={active}
        onClose={() => setActive(null)}
        onDone={(name) => {
          setActive(null);
          setBanner(`Survey submitted for ${name}.`);
          load();
        }}
      />
    </div>
  );
}

function SurveyForm({
  shop,
  onClose,
  onDone,
}: {
  shop: PendingShop | null;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setB10("");
    setB15("");
    setB20("");
    setNotes("");
    setPhoto(null);
    setConfirm(false);
    setErr(null);
  }, [shop]);

  if (!shop) return null;
  const total = (Number(b10) || 0) + (Number(b15) || 0) + (Number(b20) || 0);

  async function submit() {
    setSaving(true);
    setErr(null);
    const { error } = await supabase.rpc("submit_survey", {
      p_shopkeeper: shop!.shopkeeper_id,
      p_b10: Number(b10) || 0,
      p_b15: Number(b15) || 0,
      p_b20: Number(b20) || 0,
      p_notes: notes || null,
      p_photo_url: photo?.url ?? null,
      p_photo_lat: photo?.lat ?? null,
      p_photo_lng: photo?.lng ?? null,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      setConfirm(false);
      return;
    }
    onDone(shop!.shop_name ?? shop!.shopkeeper_name);
  }

  return (
    <Modal open={!!shop} onClose={onClose} title={`Survey — ${shop.shop_name ?? ""}`}>
      <p className="mb-4 text-sm text-gray-500">
        Ask the shopkeeper how many bags of each size are on hand and enter their
        answer. Figures are recorded blind.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="10 kg bags">
          <Input type="number" min={0} value={b10} onChange={(e) => setB10(e.target.value)} />
        </Field>
        <Field label="15 kg bags">
          <Input type="number" min={0} value={b15} onChange={(e) => setB15(e.target.value)} />
        </Field>
        <Field label="20 kg bags">
          <Input type="number" min={0} value={b20} onChange={(e) => setB20(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Notes" hint="Optional">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3">
        <PhotoCapture folder="surveys" value={photo} onChange={setPhoto} label="Visit photo" allowGallery />
      </div>
      {err && (
        <div className="mt-3">
          <Alert tone="error">{err}</Alert>
        </div>
      )}

      {!confirm ? (
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => setConfirm(true)} disabled={!photo}>Submit ({total} bags)</Button>
        </div>
      ) : (
        <div className="mt-5 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            Submit <strong>{total} bags</strong> for{" "}
            <strong>{shop.shop_name}</strong>? This record is final.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={saving}>
              Back
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Submitting…" : "Confirm submit"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
