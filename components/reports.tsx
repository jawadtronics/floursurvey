"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  PhotoThumb,
  Spinner,
  StatCard,
  StatusBadge,
  Td,
  Textarea,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { downloadCsv, fmtDate, fmtDateTime, ageSince, daysSince } from "@/lib/format";
import {
  isSeriousVariance,
  type EffectiveLine,
  type LedgerRow,
  type MissedSurvey,
  type Notice,
  type PendingShop,
  type ReconRow,
  type SurveyRow,
} from "@/lib/types";

/* --------------------------- Notices (DFC) --------------------------- */
type NoticeKind = "variance" | "not_received";

function useNotices() {
  const supabase = useMemo(() => createClient(), []);
  const [byRef, setByRef] = useState<Record<string, Notice[]>>({});
  const load = useCallback(async () => {
    const data = await fetchAll<Notice>(supabase, "v_notices", ["id"]);
    const map: Record<string, Notice[]> = {};
    for (const n of data) {
      const k = `${n.kind}:${n.ref_id}`;
      (map[k] ??= []).push(n);
    }
    setByRef(map);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);
  return { byRef, reloadNotices: load };
}

/** Inline notice control shown on recon / not-received rows. */
function NoticeControl({
  kind,
  refId,
  list,
  canManage,
  onChange,
}: {
  kind: NoticeKind;
  refId: string;
  list: Notice[];
  canManage: boolean;
  onChange: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dialog, setDialog] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = list.find((n) => n.status === "open");
  const resolved = list.some((n) => n.status === "resolved");

  async function raise() {
    if (note.trim().length === 0) { setErr("Please enter a note."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("raise_notice", { p_kind: kind, p_ref: refId, p_note: note.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDialog(false); setNote("");
    onChange();
  }

  async function resolve() {
    setBusy(true);
    await supabase.rpc("resolve_ref", { p_kind: kind, p_ref: refId });
    setBusy(false);
    onChange();
  }

  if (open) {
    return (
      <div className="flex items-center gap-2">
        <span title={open.note} className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          ⚠ Notice sent
        </span>
        {canManage && (
          <button onClick={resolve} disabled={busy} className="text-xs font-medium text-emerald-700 hover:underline">
            Resolve
          </button>
        )}
      </div>
    );
  }
  if (resolved && !canManage) {
    return <Badge color="green">✓ Resolved</Badge>;
  }
  if (!canManage) return <span className="text-xs text-gray-400">—</span>;

  return (
    <>
      <div className="flex items-center gap-2">
        {resolved && <Badge color="green">✓ Resolved</Badge>}
        <button onClick={() => setDialog(true)} className="text-xs font-medium text-red-600 hover:underline">
          Raise notice
        </button>
      </div>
      <Modal open={dialog} onClose={() => setDialog(false)} title="Raise a notice to the mill">
        <p className="mb-3 text-sm text-gray-500">
          This sends a warning to the responsible flour mill(s). Explain the discrepancy.
        </p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 45 of 50 bags arrived — please explain the shortfall." />
        {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog(false)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={raise} disabled={busy}>{busy ? "Sending…" : "Send notice"}</Button>
        </div>
      </Modal>
    </>
  );
}

/** Shopkeeper name rendered as a blue link to the shop's location on Google Maps. */
function ShopLink({ name, lat, lng }: { name: string; lat: number | null; lng: number | null }) {
  if (lat == null || lng == null) return <>{name}</>;
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-600 hover:underline"
    >
      {name}
    </a>
  );
}

const PENDING_ALERT_DAYS = 3; // Q15

function useEffectiveLines() {
  const supabase = useMemo(() => createClient(), []);
  const [lines, setLines] = useState<EffectiveLine[] | null>(null);
  useEffect(() => {
    (async () => {
      const all = await fetchAll<EffectiveLine>(supabase, "v_issue_lines_effective", ["id"]);
      all.sort((a, b) => (a.issue_date < b.issue_date ? 1 : a.issue_date > b.issue_date ? -1 : 0));
      setLines(all);
    })();
  }, [supabase]);
  return lines;
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      ⬇ Export CSV
    </Button>
  );
}

/* --------------------------- Summary strip --------------------------- */
export function SummaryStrip() {
  const lines = useEffectiveLines();
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState<PendingShop[]>([]);
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [missed, setMissed] = useState<{ shopkeeper_id: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [p, r, m] = await Promise.all([
        fetchAll<PendingShop>(supabase, "v_survey_pending", ["shopkeeper_id"]),
        fetchAll<ReconRow>(supabase, "v_reconciliation", ["survey_id"]),
        fetchAll<{ shopkeeper_id: string }>(supabase, "v_missed_surveys", ["shopkeeper_id"], "shopkeeper_id"),
      ]);
      setPending(p);
      setRecon(r);
      setMissed(m);
    })();
  }, [supabase]);

  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Karachi",
  }).slice(0, 7);

  const issuedThisMonth =
    lines?.filter((l) => l.issue_date.startsWith(month)).reduce((a, l) => a + l.total_bags, 0) ?? 0;
  const serious = recon.filter((r) => isSeriousVariance(r.received_bags, r.declared_bags)).length;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Bags issued this month" value={issuedThisMonth} />
      <StatCard label="Pending surveys now" value={pending.length} tone={pending.length > 0 ? "warn" : "default"} />
      <StatCard label="Missed surveys" value={missed.length} tone={missed.length > 0 ? "danger" : "default"} />
      <StatCard label="Shops above variance threshold" value={serious} tone={serious > 0 ? "danger" : "default"} />
    </div>
  );
}

/* ----------------------------- Issues ------------------------------- */
export function IssuesReport() {
  const lines = useEffectiveLines();
  const [mill, setMill] = useState("all");
  const [status, setStatus] = useState("all");
  const [zone, setZone] = useState("all");
  const [from, setFrom] = useState("");
  const [q, setQ] = useState("");

  if (!lines) return <Spinner />;

  const mills = Array.from(new Set(lines.map((l) => l.mill_name))).sort();
  const zones = Array.from(new Set(lines.map((l) => l.shop_zone).filter(Boolean))) as string[];

  const rows = lines.filter((l) => {
    if (mill !== "all" && l.mill_name !== mill) return false;
    if (status !== "all" && l.effective_status !== status) return false;
    if (zone !== "all" && l.shop_zone !== zone) return false;
    if (from && l.issue_date < from) return false;
    if (q && !`${l.track_number} ${l.shopkeeper_name} ${l.shop_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  function exportCsv() {
    downloadCsv("issues.csv", [
      ["Date", "Track", "Vehicle", "Mill", "District", "Shopkeeper", "Shop", "Zone", "10kg", "15kg", "20kg", "Total Bags", "Status"],
      ...rows.map((l) => [
        l.issue_date, l.track_number, l.vehicle_number, l.mill_name, l.issue_district,
        l.shopkeeper_name, l.shop_name, l.shop_zone, l.bags_10, l.bags_15, l.bags_20,
        l.total_bags, l.effective_status,
      ]),
    ]);
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="track / shop" /></Field>
          <Field label="Mill">
            <Select value={mill} onChange={(e) => setMill(e.target.value)}>
              <option value="all">All</option>
              {mills.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="all">All</option>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="issued">Issued</option>
              <option value="received">Received</option>
              <option value="not_received">Not received</option>
            </Select>
          </Field>
          <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        </div>
      </Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{rows.length} lines</span>
        <ExportButton onClick={exportCsv} />
      </div>
      {rows.length === 0 ? <EmptyState>No lines match.</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Date</Th><Th>Track</Th><Th>Mill</Th><Th>Shopkeeper</Th><Th>Zone</Th>
              <Th className="text-right">Total Bags</Th><Th>Status</Th><Th>Photo</Th>
            </tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <Td>{fmtDate(l.issue_date)}</Td>
                  <Td className="font-medium">{l.track_number}</Td>
                  <Td>{l.mill_name}</Td>
                  <Td><ShopLink name={l.shopkeeper_name} lat={l.shop_latitude} lng={l.shop_longitude} /><span className="block text-xs text-gray-400">{l.shop_name}</span></Td>
                  <Td>{l.shop_zone}</Td>
                  <Td className="text-right font-semibold">{l.total_bags}</Td>
                  <Td><StatusBadge status={l.effective_status} /></Td>
                  <Td><PhotoThumb url={l.issue_photo_url} lat={l.issue_photo_lat} lng={l.issue_photo_lng} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* -------------------------- Not received ---------------------------- */
export function NotReceivedReport({ notices = false }: { notices?: boolean }) {
  const lines = useEffectiveLines();
  const { byRef, reloadNotices } = useNotices();
  if (!lines) return <Spinner />;
  const rows = lines.filter((l) => l.effective_status === "not_received");

  const byShop = groupSum(rows, (l) => l.shopkeeper_name);
  const byMill = groupSum(rows, (l) => l.mill_name);

  function exportCsv() {
    downloadCsv("not_received.csv", [
      ["Date", "Track", "Mill", "Shopkeeper", "Shop", "Zone", "Total Bags"],
      ...rows.map((l) => [l.issue_date, l.track_number, l.mill_name, l.shopkeeper_name, l.shop_name, l.shop_zone, l.total_bags]),
    ]);
  }

  return (
    <div>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <MiniTable title="By shopkeeper" data={byShop} />
        <MiniTable title="By mill" data={byMill} />
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{rows.length} lapsed deliveries</span>
        <ExportButton onClick={exportCsv} />
      </div>
      {rows.length === 0 ? <EmptyState>No lapsed deliveries. 🎉</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Date</Th><Th>Track</Th><Th>Mill</Th><Th>Shopkeeper</Th><Th>Zone</Th><Th className="text-right">Bags</Th><Th>Photo</Th><Th>Notice</Th>
            </tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="bg-red-50/40">
                  <Td>{fmtDate(l.issue_date)}</Td>
                  <Td className="font-medium">{l.track_number}</Td>
                  <Td>{l.mill_name}</Td>
                  <Td><ShopLink name={l.shopkeeper_name} lat={l.shop_latitude} lng={l.shop_longitude} /><span className="block text-xs text-gray-400">{l.shop_name}</span></Td>
                  <Td>{l.shop_zone}</Td>
                  <Td className="text-right font-semibold">{l.total_bags}</Td>
                  <Td><PhotoThumb url={l.issue_photo_url} lat={l.issue_photo_lat} lng={l.issue_photo_lng} /></Td>
                  <Td>
                    <NoticeControl kind="not_received" refId={l.id}
                      list={byRef[`not_received:${l.id}`] ?? []} canManage={notices} onChange={reloadNotices} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------- Pending ------------------------------ */
export function PendingReport() {
  const supabase = useMemo(() => createClient(), []);
  const [shops, setShops] = useState<PendingShop[] | null>(null);
  useEffect(() => {
    (async () => {
      const all = await fetchAll<PendingShop>(supabase, "v_survey_pending", ["shopkeeper_id"]);
      all.sort((a, b) => (a.pending_since < b.pending_since ? -1 : a.pending_since > b.pending_since ? 1 : 0));
      setShops(all);
    })();
  }, [supabase]);

  if (!shops) return <Spinner />;

  function exportCsv() {
    downloadCsv("pending_surveys.csv", [
      ["Shop", "Shopkeeper", "Zone", "District", "Pending deliveries", "Waiting"],
      ...shops!.map((s) => [s.shop_name, s.shopkeeper_name, s.zone, s.district, s.pending_deliveries, ageSince(s.pending_since)]),
    ]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{shops.length} shops awaiting a survey</span>
        <ExportButton onClick={exportCsv} />
      </div>
      {shops.length === 0 ? <EmptyState>No shops awaiting a survey.</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Shop</Th><Th>Shopkeeper</Th><Th>Zone</Th><Th className="text-right">Deliveries</Th><Th>Waiting</Th>
            </tr></thead>
            <tbody>
              {shops.map((s) => {
                const overdue = daysSince(s.pending_since) >= PENDING_ALERT_DAYS;
                return (
                  <tr key={s.shopkeeper_id} className={overdue ? "bg-amber-50/50" : ""}>
                    <Td className="font-medium">{s.shop_name}</Td>
                    <Td>{s.shopkeeper_name}</Td>
                    <Td>{s.zone}</Td>
                    <Td className="text-right">{s.pending_deliveries}</Td>
                    <Td>
                      {ageSince(s.pending_since)}{" "}
                      {overdue && <Badge color="amber">overdue</Badge>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* -------------------------- Reconciliation -------------------------- */
export function ReconciliationReport({ notices = false }: { notices?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ReconRow[] | null>(null);
  const { byRef, reloadNotices } = useNotices();
  useEffect(() => {
    (async () => {
      const all = await fetchAll<ReconRow>(supabase, "v_reconciliation", ["survey_id"]);
      all.sort((a, b) => b.abs_variance_bags - a.abs_variance_bags);
      setRows(all);
    })();
  }, [supabase]);

  if (!rows) return <Spinner />;

  function exportCsv() {
    downloadCsv("reconciliation.csv", [
      ["Surveyed", "Shop", "Shopkeeper", "Zone", "Surveyor", "Bags Received", "Survey Declaration", "Variance"],
      ...rows!.map((r) => [fmtDateTime(r.surveyed_at), r.shop_name, r.shopkeeper_name, r.zone, r.survey_person_name, r.received_bags, r.declared_bags, r.variance_bags]),
    ]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {rows.length} reconciled receipts · sorted worst-first
        </span>
        <ExportButton onClick={exportCsv} />
      </div>
      {rows.length === 0 ? <EmptyState>No surveys reconciled yet.</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Surveyed</Th><Th>Shop</Th><Th>Zone</Th><Th>Surveyor</Th>
              <Th className="text-right">Received</Th><Th className="text-right">Declared</Th>
              <Th className="text-right">Variance</Th><Th>Flag</Th><Th>Photo</Th><Th>Notice</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const serious = isSeriousVariance(r.received_bags, r.declared_bags);
                return (
                  <tr key={r.survey_id} className={serious ? "bg-red-50/50" : ""}>
                    <Td>{fmtDate(r.surveyed_at)}</Td>
                    <Td className="font-medium">{r.shop_name}<span className="block text-xs"><ShopLink name={r.shopkeeper_name} lat={r.shop_latitude} lng={r.shop_longitude} /></span></Td>
                    <Td>{r.zone}</Td>
                    <Td>{r.survey_person_name ?? "—"} {r.source === "dfc" && <Badge color="blue">DFC entry</Badge>}</Td>
                    <Td className="text-right">{r.received_bags}</Td>
                    <Td className="text-right">{r.declared_bags}</Td>
                    <Td className={"text-right font-semibold " + (r.variance_bags === 0 ? "text-gray-700" : "text-red-600")}>
                      {r.variance_bags > 0 ? `+${r.variance_bags}` : r.variance_bags}
                    </Td>
                    <Td>{serious ? <Badge color="red">Investigate</Badge> : <Badge color="green">OK</Badge>}</Td>
                    <Td><PhotoThumb url={r.survey_photo_url} lat={r.survey_photo_lat} lng={r.survey_photo_lng} /></Td>
                    <Td>
                      <NoticeControl kind="variance" refId={r.survey_id}
                        list={byRef[`variance:${r.survey_id}`] ?? []} canManage={notices} onChange={reloadNotices} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------- Surveys ------------------------------ */
export function SurveysReport() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SurveyRow[] | null>(null);
  const [zone, setZone] = useState("all");
  useEffect(() => {
    (async () => {
      const all = await fetchAll<SurveyRow>(supabase, "v_surveys_visible", ["id"]);
      all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      setRows(all);
    })();
  }, [supabase]);

  if (!rows) return <Spinner />;
  const zones = Array.from(new Set(rows.map((r) => r.zone))).sort();
  const filtered = rows.filter((r) => zone === "all" || r.zone === zone);

  function exportCsv() {
    downloadCsv("surveys.csv", [
      ["Date", "Shop", "Shopkeeper", "Zone", "Surveyor", "10kg", "15kg", "20kg", "Total", "Notes"],
      ...filtered.map((r) => [fmtDateTime(r.created_at), r.shop_name, r.shopkeeper_name, r.zone, r.survey_person_name, r.declared_bags_10, r.declared_bags_15, r.declared_bags_20, r.declared_total_bags, r.notes]),
    ]);
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="max-w-xs">
          <Field label="Zone">
            <Select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="all">All zones</option>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
        </div>
      </Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{filtered.length} surveys</span>
        <ExportButton onClick={exportCsv} />
      </div>
      {filtered.length === 0 ? <EmptyState>No surveys.</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Date</Th><Th>Shop</Th><Th>Zone</Th><Th>Surveyor</Th>
              <Th className="text-right">Total Bags</Th><Th>Notes</Th><Th>Photo</Th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <Td>{fmtDateTime(r.created_at)}</Td>
                  <Td className="font-medium">{r.shop_name}<span className="block text-xs"><ShopLink name={r.shopkeeper_name} lat={r.shop_latitude} lng={r.shop_longitude} /></span></Td>
                  <Td>{r.zone}</Td>
                  <Td>{r.survey_person_name ?? "—"} {r.source === "dfc" && <Badge color="blue">DFC entry</Badge>}</Td>
                  <Td className="text-right font-semibold">{r.declared_total_bags}</Td>
                  <Td className="max-w-xs whitespace-normal text-gray-500">{r.notes ?? "—"}</Td>
                  <Td><PhotoThumb url={r.survey_photo_url} lat={r.survey_photo_lat} lng={r.survey_photo_lng} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* ---------------------- Consolidated ledger ------------------------- */
function Triple({ a, b, c, tone }: { a: number | null; b: number | null; c: number | null; tone?: boolean }) {
  if (a == null && b == null && c == null) return <span className="text-xs text-gray-400">—</span>;
  const cell = (v: number | null) => {
    const s = v == null ? "–" : tone && v !== 0 ? (v > 0 ? `+${v}` : `${v}`) : `${v}`;
    const cls = tone ? (v == null || v === 0 ? "text-gray-600" : "text-red-600 font-semibold") : "text-gray-800";
    return <span className={cls}>{s}</span>;
  };
  return (
    <span className="whitespace-nowrap text-xs">
      {cell(a)} <span className="text-gray-300">/</span> {cell(b)} <span className="text-gray-300">/</span> {cell(c)}
    </span>
  );
}

export function LedgerReport({ canDispute = false }: { canDispute?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const { byRef, reloadNotices } = useNotices();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [zone, setZone] = useState("all");
  const [mill, setMill] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const all = await fetchAll<LedgerRow>(supabase, "v_ledger", ["line_id"]);
    all.sort((a, b) => (a.issued_at < b.issued_at ? 1 : a.issued_at > b.issued_at ? -1 : 0));
    setRows(all);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <Spinner />;

  const zones = Array.from(new Set(rows.map((r) => r.zone).filter(Boolean))) as string[];
  const mills = Array.from(new Set(rows.map((r) => r.mill_name))).sort();

  const filtered = rows.filter((r) => {
    if (from && r.issue_date < from) return false;
    if (to && r.issue_date > to) return false;
    if (zone !== "all" && r.zone !== zone) return false;
    if (mill !== "all" && r.mill_name !== mill) return false;
    if (status !== "all" && r.status !== status) return false;
    if (q && !`${r.shopkeeper_name} ${r.shop_name ?? ""} ${r.track_number} ${r.mill_name}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  function exportCsv() {
    downloadCsv("ledger.csv", [
      ["Date & time", "Shop", "Shopkeeper", "Latitude", "Longitude", "Zone", "Survey person", "Flour mill", "Truck",
       "Disp 10", "Disp 15", "Disp 20", "Rec 10", "Rec 15", "Rec 20",
       "Var 10", "Var 15", "Var 20", "Status", "Dispute"],
      ...filtered.map((r) => [
        fmtDateTime(r.issued_at), r.shop_name, r.shopkeeper_name, r.shop_latitude, r.shop_longitude,
        r.zone, r.survey_person_name, r.mill_name, r.track_number,
        r.disp_10, r.disp_15, r.disp_20, r.rec_10, r.rec_15, r.rec_20,
        r.var_10, r.var_15, r.var_20, r.status, r.dispute_status ?? "",
      ]),
    ]);
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="shop / truck / mill" /></Field>
          <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Zone">
            <Select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="all">All</option>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Flour mill">
            <Select value={mill} onChange={(e) => setMill(e.target.value)}>
              <option value="all">All</option>
              {mills.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="surveyed">Surveyed</option>
              <option value="pending">Pending</option>
              <option value="missed">Missed</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {filtered.length} delivery line(s) · bag columns read 10 / 15 / 20 kg
        </span>
        <ExportButton onClick={exportCsv} />
      </div>

      {filtered.length === 0 ? <EmptyState>No deliveries match these filters.</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Date &amp; time</Th><Th>Shop</Th><Th>Zone</Th><Th>Survey person</Th><Th>Flour mill</Th>
              <Th className="text-center">Dispatched</Th>
              <Th className="text-center">Received</Th>
              <Th className="text-center">Variance</Th>
              <Th>Photo</Th><Th>Dispute</Th><Th>Status</Th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.line_id} className={r.status === "missed" ? "bg-amber-50/40" : undefined}>
                  <Td>{fmtDateTime(r.issued_at)}<span className="block text-xs text-gray-400">{r.track_number}</span></Td>
                  <Td className="font-medium">
                    <ShopLink name={r.shop_name ?? r.shopkeeper_name} lat={r.shop_latitude} lng={r.shop_longitude} />
                    <span className="block text-xs text-gray-400">{r.shopkeeper_name}</span>
                  </Td>
                  <Td>{r.zone}</Td>
                  <Td>
                    {r.survey_person_name ?? <span className="text-gray-400">—</span>}
                    {r.survey_source === "dfc" && <Badge color="blue">DFC entry</Badge>}
                  </Td>
                  <Td>{r.mill_name}</Td>
                  <Td className="text-center"><Triple a={r.disp_10} b={r.disp_15} c={r.disp_20} /></Td>
                  <Td className="text-center">
                    <Triple a={r.rec_10} b={r.rec_15} c={r.rec_20} />
                    {(r.survey_line_count ?? 0) > 1 && (
                      <span className="block text-[10px] text-gray-400">1 survey · {r.survey_line_count} deliveries</span>
                    )}
                  </Td>
                  <Td className="text-center"><Triple a={r.var_10} b={r.var_15} c={r.var_20} tone /></Td>
                  <Td>
                    <div className="flex gap-1">
                      <PhotoThumb url={r.issue_photo_url} lat={r.issue_photo_lat} lng={r.issue_photo_lng} />
                      <PhotoThumb url={r.survey_photo_url} lat={r.survey_photo_lat} lng={r.survey_photo_lng} />
                    </div>
                  </Td>
                  <Td>
                    <NoticeControl
                      kind={r.dispute_kind}
                      refId={r.dispute_ref}
                      list={byRef[`${r.dispute_kind}:${r.dispute_ref}`] ?? []}
                      canManage={canDispute}
                      onChange={reloadNotices}
                    />
                  </Td>
                  <Td>
                    {r.status === "surveyed" ? <Badge color="green">Surveyed</Badge>
                      : r.status === "pending" ? <Badge color="amber">Pending</Badge>
                      : <Badge color="red">Missed</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

/* -------------------------- Missed surveys -------------------------- */
export function MissedSurveysReport({ canFill = false }: { canFill?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<MissedSurvey[] | null>(null);
  const [active, setActive] = useState<MissedSurvey | null>(null);
  const load = useCallback(async () => {
    const all = await fetchAll<MissedSurvey>(supabase, "v_missed_surveys", ["shopkeeper_id"]);
    all.sort((a, b) => (a.oldest_issue_date < b.oldest_issue_date ? -1 : a.oldest_issue_date > b.oldest_issue_date ? 1 : 0));
    setRows(all);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <Spinner />;

  function exportCsv() {
    downloadCsv("missed_surveys.csv", [
      ["Shop", "Shopkeeper", "Latitude", "Longitude", "Zone", "District", "Assigned surveyor", "Missed deliveries", "Missed bags", "Oldest issue"],
      ...rows!.map((r) => [r.shop_name, r.shopkeeper_name, r.latitude, r.longitude, r.zone, r.district, r.surveyor_name, r.missed_lines, r.missed_bags, r.oldest_issue_date]),
    ]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{rows.length} shop(s) whose same-day survey window lapsed</span>
        <ExportButton onClick={exportCsv} />
      </div>
      {rows.length === 0 ? <EmptyState>No missed surveys. 🎉</EmptyState> : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Shop</Th><Th>Zone</Th><Th>Assigned surveyor</Th>
              <Th className="text-right">Deliveries</Th><Th className="text-right">Bags</Th><Th>Since</Th>
              {canFill && <Th></Th>}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shopkeeper_id} className="bg-amber-50/40">
                  <Td className="font-medium">
                    <ShopLink name={r.shop_name ?? r.shopkeeper_name} lat={r.latitude} lng={r.longitude} />
                    <span className="block text-xs text-gray-400">{r.shopkeeper_name}</span>
                  </Td>
                  <Td>{r.zone}</Td>
                  <Td>{r.surveyor_name ?? <span className="text-gray-400">— none in zone —</span>}</Td>
                  <Td className="text-right">{r.missed_lines}</Td>
                  <Td className="text-right font-semibold">{r.missed_bags}</Td>
                  <Td className="text-gray-500">{fmtDate(r.oldest_issue_date)}</Td>
                  {canFill && (
                    <Td>
                      <button onClick={() => setActive(r)} className="text-xs font-medium text-emerald-700 hover:underline">
                        Fill survey
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
      <FillMissedDialog shop={active} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); }} />
    </div>
  );
}

function FillMissedDialog({
  shop,
  onClose,
  onDone,
}: {
  shop: MissedSurvey | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setB10(""); setB15(""); setB20(""); setNotes(""); setErr(null); }, [shop]);
  if (!shop) return null;
  const total = (Number(b10) || 0) + (Number(b15) || 0) + (Number(b20) || 0);

  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("dfc_fill_survey", {
      p_shopkeeper: shop!.shopkeeper_id,
      p_b10: Number(b10) || 0, p_b15: Number(b15) || 0, p_b20: Number(b20) || 0,
      p_notes: notes || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <Modal open={!!shop} onClose={onClose} title={`Fill missed survey — ${shop.shop_name ?? shop.shopkeeper_name}`}>
      <p className="mb-3 text-sm text-gray-500">
        The survey person did not visit before the same-day deadline. Record the bag counts on their behalf — this is logged as a DFC entry.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="10 kg bags"><Input type="number" min={0} value={b10} onChange={(e) => setB10(e.target.value)} /></Field>
        <Field label="15 kg bags"><Input type="number" min={0} value={b15} onChange={(e) => setB15(e.target.value)} /></Field>
        <Field label="20 kg bags"><Input type="number" min={0} value={b20} onChange={(e) => setB20(e.target.value)} /></Field>
      </div>
      <div className="mt-3">
        <Field label="Notes" hint="Optional"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : `Save (${total} bags)`}</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ helpers ----------------------------- */
function groupSum(lines: EffectiveLine[], key: (l: EffectiveLine) => string) {
  const m = new Map<string, { count: number; bags: number }>();
  for (const l of lines) {
    const k = key(l);
    const cur = m.get(k) ?? { count: 0, bags: 0 };
    cur.count++;
    cur.bags += l.total_bags;
    m.set(k, cur);
  }
  return Array.from(m.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.bags - a.bags);
}

function MiniTable({
  title,
  data,
}: {
  title: string;
  data: { name: string; count: number; bags: number }[];
}) {
  return (
    <Card>
      <div className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">
        {title}
      </div>
      {data.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">None</div>
      ) : (
        <TableWrap>
          <thead><tr><Th>Name</Th><Th className="text-right">Lapses</Th><Th className="text-right">Bags</Th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name}>
                <Td>{d.name}</Td>
                <Td className="text-right">{d.count}</Td>
                <Td className="text-right font-semibold text-red-600">{d.bags}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}
