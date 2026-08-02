"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { District, Zone } from "@/components/UserForm";

export default function DistrictsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [districts, setDistricts] = useState<District[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  // dialog state
  const [dOpen, setDOpen] = useState(false);
  const [dEdit, setDEdit] = useState<District | null>(null);
  const [zCtx, setZCtx] = useState<{ district: District; zone: Zone | null } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, z] = await Promise.all([
      supabase.from("districts").select("*").order("name"),
      supabase.from("zones").select("*").order("name"),
    ]);
    setDistricts((d.data as District[]) ?? []);
    setZones((z.data as Zone[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openDistrict(d: District | null) {
    setDEdit(d); setName(d?.name ?? ""); setErr(null); setDOpen(true);
  }
  function openZone(district: District, zone: Zone | null) {
    setZCtx({ district, zone }); setName(zone?.name ?? ""); setErr(null);
  }

  async function saveDistrict() {
    if (name.trim().length < 2) { setErr("Enter a district name."); return; }
    setBusy(true); setErr(null);
    const { error } = dEdit
      ? await supabase.rpc("admin_update_district", { p_id: dEdit.id, p_name: name.trim() })
      : await supabase.rpc("admin_create_district", { p_name: name.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDOpen(false); load();
  }

  async function saveZone() {
    if (!zCtx) return;
    if (name.trim().length < 2) { setErr("Enter a zone name."); return; }
    setBusy(true); setErr(null);
    const { error } = zCtx.zone
      ? await supabase.rpc("admin_update_zone", { p_id: zCtx.zone.id, p_name: name.trim() })
      : await supabase.rpc("admin_create_zone", { p_district_id: zCtx.district.id, p_name: name.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setZCtx(null); load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Districts & Zones" subtitle="The fixed reference list that scopes DFCs, mills, shops and surveyors.">
        <Button onClick={() => openDistrict(null)}>+ Add District</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {districts.map((d) => {
          const dz = zones.filter((z) => z.district_id === d.id);
          return (
            <Card key={d.id} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">🗺️ {d.name}</h3>
                <button onClick={() => openDistrict(d)} className="text-xs font-medium text-emerald-700 hover:underline">
                  Rename
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {dz.map((z) => (
                  <button key={z.id} onClick={() => openZone(d, z)}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50">
                    📍 {z.name}
                    <span className="text-xs text-gray-400">edit</span>
                  </button>
                ))}
                {dz.length === 0 && <span className="text-sm text-gray-400">No zones yet.</span>}
              </div>
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => openZone(d, null)}>+ Add Zone</Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* District modal */}
      <Modal open={dOpen} onClose={() => setDOpen(false)} title={dEdit ? "Rename district" : "Add district"}>
        <Field label="District name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rawalpindi" />
        </Field>
        {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={saveDistrict} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </Modal>

      {/* Zone modal */}
      <Modal open={!!zCtx} onClose={() => setZCtx(null)} title={zCtx?.zone ? "Rename zone" : `Add zone to ${zCtx?.district.name ?? ""}`}>
        <Field label="Zone name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saddar" />
        </Field>
        {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setZCtx(null)} disabled={busy}>Cancel</Button>
          <Button onClick={saveZone} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
}
