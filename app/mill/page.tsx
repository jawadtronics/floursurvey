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
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { fmtDate } from "@/lib/format";
import type { Notice } from "@/lib/types";

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

export default function IssueWheatPage() {
  const supabase = useMemo(() => createClient(), []);
  const [issueDate, setIssueDate] = useState(todayKarachi());
  const [track, setTrack] = useState("");
  const [vehicle, setVehicle] = useState("");
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
      p_vehicle: vehicle.trim() || null,
      p_lines: lines.map((l) => ({
        shopkeeper_id: l.shopkeeper_id,
        bags_10: l.bags_10,
        bags_15: l.bags_15,
        bags_20: l.bags_20,
      })),
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) {
      setBanner({ tone: "error", msg: error.message });
      return;
    }
    setBanner({
      tone: "success",
      msg: `Issue ${track} submitted — ${totals.total} bags to ${lines.length} shopkeeper(s). Each has until midnight (PKT) to acknowledge.`,
    });
    setTrack("");
    setVehicle("");
    setLines([]);
  }

  const canSubmit = track.trim().length > 0 && lines.length > 0;

  return (
    <div>
      <PageHeader
        title="Issue Wheat"
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Date" required>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="Track Number" required hint="Unique per mill">
                <Input
                  value={track}
                  onChange={(e) => setTrack(e.target.value)}
                  placeholder="e.g. TRK-1002"
                />
              </Field>
              <Field label="Vehicle / Return No." hint="Optional">
                <Input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="e.g. LEA-1234"
                />
              </Field>
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
                Add a track number and at least one shopkeeper.
              </p>
            )}
          </Card>
        </div>
      </div>

      <AddShopkeeperModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={lines.map((l) => l.shopkeeper_id)}
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
            <strong>{lines.length}</strong> shopkeeper(s) on track{" "}
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
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (l: Line) => void;
  existing: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [phone, setPhone] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [found, setFound] = useState<
    { shopkeeper_id: string; shopkeeper_name: string; shop_name: string } | null
  >(null);
  const [notFound, setNotFound] = useState(false);
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setPhone("");
    setFound(null);
    setNotFound(false);
    setB10("");
    setB15("");
    setB20("");
    setErr(null);
  }

  async function verify() {
    setErr(null);
    setNotFound(false);
    setFound(null);
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_shopkeeper", {
      p_phone: phone.trim(),
    });
    setVerifying(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (!data?.found) {
      setNotFound(true);
      return;
    }
    if (existing.includes(data.shopkeeper_id)) {
      setErr("This shopkeeper is already on this issue.");
      return;
    }
    setFound(data);
  }

  const total = (Number(b10) || 0) + (Number(b15) || 0) + (Number(b20) || 0);

  function add() {
    if (!found) return;
    if (total <= 0) {
      setErr("Enter at least one bag.");
      return;
    }
    onAdd({
      shopkeeper_id: found.shopkeeper_id,
      shopkeeper_name: found.shopkeeper_name,
      shop_name: found.shop_name,
      bags_10: Number(b10) || 0,
      bags_15: Number(b15) || 0,
      bags_20: Number(b20) || 0,
    });
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add Shopkeeper"
    >
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Phone number" required>
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setFound(null);
                  setNotFound(false);
                }}
                placeholder="03002220011"
              />
            </Field>
          </div>
          <Button onClick={verify} disabled={verifying || phone.trim().length < 6}>
            {verifying ? "Verifying…" : "Verify"}
          </Button>
        </div>

        {notFound && (
          <Alert tone="error">
            No registered shopkeeper found with this number. Contact the DFC to
            register them.
          </Alert>
        )}
        {err && <Alert tone="error">{err}</Alert>}

        {found && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm">
              <div className="font-semibold text-emerald-800">
                {found.shopkeeper_name}
              </div>
              <div className="text-emerald-700">{found.shop_name}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="10 kg bags">
                <Input
                  type="number"
                  min={0}
                  value={b10}
                  onChange={(e) => setB10(e.target.value)}
                />
              </Field>
              <Field label="15 kg bags">
                <Input
                  type="number"
                  min={0}
                  value={b15}
                  onChange={(e) => setB15(e.target.value)}
                />
              </Field>
              <Field label="20 kg bags">
                <Input
                  type="number"
                  min={0}
                  value={b20}
                  onChange={(e) => setB20(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Total: <strong className="text-gray-900">{total} bags</strong>
              </span>
              <Button onClick={add} disabled={total <= 0}>
                Add to issue
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
