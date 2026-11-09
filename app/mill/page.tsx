"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { PhotoCapture, type Photo } from "@/components/PhotoCapture";
import { fmtDate } from "@/lib/format";
import type { AdvanceRow, Notice } from "@/lib/types";

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-medium text-gray-900">
      {now.toLocaleString("en-GB", {
        timeZone: "Asia/Karachi",
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </span>
  );
}

function MillNoticesBanner() {
  const supabase = useMemo(() => createClient(), []);
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_notices")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      setNotices((data as Notice[]) ?? []);
    })();
  }, [supabase]);

  if (notices.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
        ⚠️ {notices.length} open notice{notices.length > 1 ? "s" : ""} from the DFC
      </div>
      <ul className="space-y-2">
        {notices.map((n) => (
          <li key={n.id} className="rounded-lg bg-white/70 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 font-medium">
                {n.kind === "variance" ? "Survey variance" : "Not received"}
              </span>
              {n.shop_name && <span>Shop: {n.shop_name}</span>}
              {n.track_number && <span>Track: {n.track_number}</span>}
              <span className="text-amber-600">{fmtDate(n.created_at)}</span>
            </div>
            <div className="mt-1 text-gray-800">{n.note}</div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-700">
        These warnings stay until the DFC marks them resolved.
      </p>
    </div>
  );
}

interface Line {
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string;
  bags_10: number;
  bags_15: number;
  bags_20: number;
}

function todayKarachi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

export default function IssueFlourPage() {
  const supabase = useMemo(() => createClient(), []);
  const [issueDate] = useState(todayKarachi());
  const [track, setTrack] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; msg: string } | null>(
    null
  );

  const totals = useMemo(() => {
    const t = { b10: 0, b15: 0, b20: 0 };
    for (const l of lines) {
      t.b10 += l.bags_10;
      t.b15 += l.bags_15;
      t.b20 += l.bags_20;
    }
    return { ...t, total: t.b10 + t.b15 + t.b20 };
  }, [lines]);

  function addLine(l: Line) {
    setLines((prev) => [...prev, l]);
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.shopkeeper_id !== id));
  }

  async function submitIssue() {
    setSubmitting(true);
    setBanner(null);
    const { error } = await supabase.rpc("create_issue", {
      p_track: track.trim(),
      p_date: issueDate,
      p_vehicle: null,
      p_lines: lines.map((l) => ({
        shopkeeper_id: l.shopkeeper_id,
        bags_10: l.bags_10,
        bags_15: l.bags_15,
        bags_20: l.bags_20,
      })),
      p_photo_url: photo?.url ?? null,
      p_photo_lat: photo?.lat ?? null,
      p_photo_lng: photo?.lng ?? null,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) {
      setBanner({ tone: "error", msg: error.message });
      return;
    }
    setBanner({
      tone: "success",
      msg: `Truck ${track} submitted — ${totals.total} bags to ${lines.length} shopkeeper(s). Each has until midnight (PKT) to acknowledge.`,
    });
    setTrack("");
    setPhoto(null);
    setLines([]);
  }

  const canSubmit = track.trim().length > 0 && lines.length > 0 && !!photo;

  return (
    <div>
      <PageHeader
        title="Issue Flour"
        subtitle="Record a dispatch trip. Shopkeepers must acknowledge the same day."
      />

      <MillNoticesBanner />

      {banner && (
        <div className="mb-4">
          <Alert tone={banner.tone}>{banner.msg}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Header + lines */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">Date &amp; time</span>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  🕒 <LiveClock />
                  <span className="block text-xs text-gray-400">Captured automatically (Pakistan time)</span>
                </div>
              </div>
              <Field label="Truck Number" required hint="Same number may be dispatched more than once — each is its own entry">
                <Input
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                  placeholder="e.g. LEA-1234"
                />
              </Field>
            </div>
            <div className="mt-4">
              <PhotoCapture folder="issues" value={photo} onChange={setPhoto} label="Dispatch photo (camera only)" />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Shopkeepers on this trip"
              subtitle={`${lines.length} added`}
              action={
                <Button size="sm" onClick={() => setModalOpen(true)}>
                  + Add Shopkeeper
                </Button>
              }
            />
            {lines.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                No shopkeepers yet. Add one by verifying their phone number.
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Shopkeeper</Th>
                    <Th>Shop</Th>
                    <Th className="text-right">10kg</Th>
                    <Th className="text-right">15kg</Th>
                    <Th className="text-right">20kg</Th>
                    <Th className="text-right">Bags</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.shopkeeper_id}>
                      <Td>{l.shopkeeper_name}</Td>
                      <Td className="text-gray-500">{l.shop_name}</Td>
                      <Td className="text-right">{l.bags_10}</Td>
                      <Td className="text-right">{l.bags_15}</Td>
                      <Td className="text-right">{l.bags_20}</Td>
                      <Td className="text-right font-semibold">
                        {l.bags_10 + l.bags_15 + l.bags_20}
                      </Td>
                      <Td>
                        <button
                          onClick={() => removeLine(l.shopkeeper_id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        {/* Totals + submit */}
        <div>
          <Card className="sticky top-20 p-5">
            <h3 className="font-semibold text-gray-900">Totals (bags)</h3>
            <table className="mt-3 w-full text-sm">
              <tbody>
                <Row label="10 kg bags" value={totals.b10} />
                <Row label="15 kg bags" value={totals.b15} />
                <Row label="20 kg bags" value={totals.b20} />
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="pt-2 font-semibold text-gray-900">Total bags</td>
                  <td className="pt-2 text-right text-lg font-bold text-emerald-700">
                    {totals.total}
                  </td>
                </tr>
              </tfoot>
            </table>
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
            >
              Submit Issue
            </Button>
            {!canSubmit && (
              <p className="mt-2 text-center text-xs text-gray-400">
                Add a truck number, a dispatch photo, and at least one shopkeeper.
              </p>
            )}
          </Card>
        </div>
      </div>

      <AddShopkeeperModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={lines.map((l) => l.shopkeeper_id)}
        issueDate={issueDate}
        onAdd={(l) => {
          addLine(l);
          setModalOpen(false);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Submit this issue?"
        message={
          <>
            You are issuing <strong>{totals.total} bags</strong> across{" "}
            <strong>{lines.length}</strong> shopkeeper(s) on truck{" "}
            <strong>{track}</strong>. This cannot be edited afterwards.
          </>
        }
        confirmLabel="Submit Issue"
        loading={submitting}
        onConfirm={submitIssue}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="py-1 text-gray-600">{label}</td>
      <td className="py-1 text-right font-medium text-gray-900">{value}</td>
    </tr>
  );
}

function AddShopkeeperModal({
  open,
  onClose,
  onAdd,
  existing,
  issueDate,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (l: Line) => void;
  existing: string[];
  issueDate: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [advance, setAdvance] = useState<AdvanceRow[] | null>(null);
  const [picked, setPicked] = useState("");
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setAdvance(null);
      const { data } = await supabase
        .from("v_advances")
        .select("*")
        .eq("supply_date", issueDate);
      setAdvance((data as AdvanceRow[]) ?? []);
    })();
  }, [supabase, open, issueDate]);

  function reset() {
    setPicked(""); setB10(""); setB15(""); setB20(""); setErr(null);
  }

  const available = (advance ?? []).filter((a) => !existing.includes(a.shopkeeper_id));
  const chosen = available.find((a) => a.shopkeeper_id === picked) ?? null;
  const total = (Number(b10) || 0) + (Number(b15) || 0) + (Number(b20) || 0);

  function add() {
    if (!chosen) return;
    if (total <= 0) { setErr("Enter at least one bag."); return; }
    onAdd({
      shopkeeper_id: chosen.shopkeeper_id,
      shopkeeper_name: chosen.shopkeeper_name,
      shop_name: chosen.shop_name ?? "",
      bags_10: Number(b10) || 0,
      bags_15: Number(b15) || 0,
      bags_20: Number(b20) || 0,
    });
    reset();
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add Shopkeeper">
      <div className="space-y-4">
        {advance === null ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading your expected advance…</p>
        ) : advance.length === 0 ? (
          <Alert tone="error">
            No Expected Advance has been submitted for {issueDate}. Submit one on the
            Expected Advance tab before issuing.
          </Alert>
        ) : available.length === 0 ? (
          <Alert tone="info">Every shopkeeper on this advance has already been added.</Alert>
        ) : (
          <>
            <Field label="Shopkeeper" required hint="Only shopkeepers on this date's expected advance">
              <Select value={picked} onChange={(e) => { setPicked(e.target.value); setErr(null); }}>
                <option value="">Select shopkeeper…</option>
                {available.map((a) => (
                  <option key={a.shopkeeper_id} value={a.shopkeeper_id}>
                    {a.shopkeeper_name} — {a.shop_name} ({a.phone})
                  </option>
                ))}
              </Select>
            </Field>

            {chosen && (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm">
                  <div className="font-semibold text-emerald-800">{chosen.shopkeeper_name}</div>
                  <div className="text-emerald-700">{chosen.shop_name}</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Expected: {chosen.bags_10}/{chosen.bags_15}/{chosen.bags_20} ({chosen.total_bags} bags)
                    {chosen.issued_bags > 0 && ` · already issued ${chosen.issued_bags}`}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="10 kg bags"><Input type="number" min={0} value={b10} onChange={(e) => setB10(e.target.value)} /></Field>
                  <Field label="15 kg bags"><Input type="number" min={0} value={b15} onChange={(e) => setB15(e.target.value)} /></Field>
                  <Field label="20 kg bags"><Input type="number" min={0} value={b20} onChange={(e) => setB20(e.target.value)} /></Field>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Total: <strong className="text-gray-900">{total} bags</strong>
                  </span>
                  <Button onClick={add} disabled={total <= 0}>Add to issue</Button>
                </div>
              </div>
            )}
          </>
        )}
        {err && <Alert tone="error">{err}</Alert>}
      </div>
    </Modal>
  );
}
