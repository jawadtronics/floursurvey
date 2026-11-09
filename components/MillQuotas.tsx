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
  Select,
  Spinner,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { downloadCsv } from "@/lib/format";
import type { MillQuota, Profile } from "@/lib/types";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
function parseCsv(text: string): string[][] {
  const clean = text.split(CR).join("");
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === LF) { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  row.push(field); rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim().length > 0));
}
function toObjects(text: string): Record<string, string>[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  return grid.slice(1).map((cols) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (cols[i] ?? "").trim()));
    return o;
  });
}
function todayKarachi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/**
 * Parse a quota cell. Spreadsheets hand back things like "1,200", " 350 ",
 * "10 MT" or "12.5" — the old code ran Number() on those, got NaN, and silently
 * saved 0. Returns null for a genuinely empty cell so we can skip the row
 * instead of zeroing out a quota that was already set.
 */
function parseQty(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.trim();
  if (cleaned.length === 0) return null;
  const digits = [...cleaned].filter((c) => (c >= "0" && c <= "9") || c === "." || c === "-").join("");
  if (digits.length === 0 || digits === "-" || digits === ".") return NaN;
  const n = Number(digits);
  if (!isFinite(n) || n < 0) return NaN;
  return Math.round(n);
}

/**
 * Daily mill quotas. `canEdit` gates quota entry (template + CSV upload) —
 * DFCs may set quotas, supervisors get the same view read-only.
 */
export function MillQuotas({ canEdit = false }: { canEdit?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [quotas, setQuotas] = useState<MillQuota[] | null>(null);
  const [mills, setMills] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [date, setDate] = useState(todayKarachi());
  const [millF, setMillF] = useState("all");
  const [districtF, setDistrictF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [editing, setEditing] = useState<MillQuota | null>(null);

  const load = useCallback(async () => {
    setQuotas(null);
    const [qk, mk] = await Promise.all([
      supabase.rpc("get_mill_quotas", { p_date: date }),
      supabase.from("v_users").select("*").eq("role", "flour_mill").order("full_name"),
    ]);
    setQuotas((qk.data as MillQuota[]) ?? []);
    setMills((mk.data as Profile[]) ?? []);
  }, [supabase, date]);

  useEffect(() => { load(); }, [load]);

  function downloadTemplate() {
    downloadCsv("mill_quota_template.csv", [
      ["mill_id", "mill_name", "regular_quota", "grinding_quota", "kpk_quota"],
      ...mills.map((m) => [m.id, m.full_name, "", "", ""]),
    ]);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setBanner(null);

    const text = await file.text();
    const rows = toObjects(text);
    e.target.value = "";

    if (rows.length === 0) {
      setBusy(false);
      setBanner({ tone: "error", msg: "That file has no data rows. Download the template and fill it in." });
      return;
    }

    const known = new Map(mills.map((m) => [m.id, m.full_name]));
    const byName = new Map(mills.map((m) => [m.full_name.trim().toLowerCase(), m.id]));

    let ok = 0;
    let skipped = 0;
    const problems: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 2; // +1 header, +1 to be 1-based
      const label = r.mill_name || r.mill_id || `row ${line}`;

      // Resolve the mill by id, falling back to an exact name match.
      let id = (r.mill_id ?? "").trim();
      if (!id && r.mill_name) id = byName.get(r.mill_name.trim().toLowerCase()) ?? "";
      if (!id) { problems.push(`Row ${line} (${label}): no mill_id — leave the template's id column intact.`); continue; }
      if (!known.has(id)) { problems.push(`Row ${line} (${label}): mill_id not found in your district.`); continue; }

      const reg = parseQty(r.regular_quota);
      const grd = parseQty(r.grinding_quota ?? r.pending_quota);
      const kpk = parseQty(r.kpk_quota);

      if ([reg, grd, kpk].some((v) => Number.isNaN(v))) {
        problems.push(`Row ${line} (${label}): quota values must be numbers.`);
        continue;
      }
      // All three blank => the user did not fill this mill in. Skip it rather
      // than overwriting an existing quota with zeros.
      if (reg === null && grd === null && kpk === null) { skipped++; continue; }

      const { error } = await supabase.rpc("dfc_upsert_quota", {
        p_mill_id: id,
        p_date: date,
        p_regular: reg ?? 0,
        p_pending: grd ?? 0,
        p_kpk: kpk ?? 0,
      });
      if (error) problems.push(`Row ${line} (${label}): ${error.message}`);
      else ok++;
    }

    setBusy(false);
    const bits = [`Saved quotas for ${ok} mill(s) on ${date}`];
    if (skipped) bits.push(`${skipped} left blank (untouched)`);
    if (problems.length) bits.push(`${problems.length} failed`);
    setBanner({
      tone: problems.length === 0 ? "success" : "error",
      msg: bits.join(" · ") + (problems.length ? " — " + problems.slice(0, 5).join("  ") : ""),
    });
    load();
  }

  const districts = Array.from(
    new Set((quotas ?? []).map((q) => q.district).filter(Boolean))
  ).sort() as string[];

  // Least progress first, so the mills furthest behind sit at the top.
  const rows = (quotas ?? [])
    .filter((q) => millF === "all" || q.mill_id === millF)
    .filter((q) => districtF === "all" || q.district === districtF)
    .map((q) => {
      const totalMt = q.total_quota * 1000;
      const targetMt = Math.round(0.7 * totalMt);
      const pct = targetMt > 0 ? Math.min(100, Math.round((q.issued_today / targetMt) * 100)) : 0;
      return { ...q, totalMt, targetMt, pct, met: targetMt > 0 && q.issued_today >= targetMt };
    })
    .filter((q) =>
      statusF === "all" ? true
      : statusF === "met" ? q.met
      : statusF === "behind" ? (q.targetMt > 0 && !q.met)
      : !q.has_quota
    )
    .sort((a, b) => a.pct - b.pct || b.targetMt - a.targetMt);

  function exportCsv() {
    downloadCsv(`mill_quotas_${date}.csv`, [
      ["Date", "Mill", "District", "Regular MT", "Grinding MT", "KPK MT",
       "Total quota", "Required flour", "Flour issued", "Progress %", "Quota set"],
      ...rows.map((q) => [
        date, q.mill_name, q.district, q.regular_quota, q.pending_quota, q.kpk_quota,
        q.totalMt, q.targetMt, q.issued_today, q.targetMt > 0 ? q.pct : "", q.has_quota ? "yes" : "no",
      ]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Mill Daily Quotas"
        subtitle={
          canEdit
            ? "Flour issued include only 10 kg and 20 kg bags."
            : "Flour issued include only 10 kg and 20 kg bags. View only — quotas are set by the DFC."
        }
      >
        {canEdit && (
          <>
            <Button variant="secondary" onClick={downloadTemplate}>⬇ Download template</Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              {busy ? "Uploading…" : "⬆ Upload filled CSV"}
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={onFile} />
            </label>
          </>
        )}
        {!canEdit && (
          <Button variant="secondary" onClick={exportCsv}>⬇ Export CSV</Button>
        )}
      </PageHeader>

      {banner && <div className="mb-4"><Alert tone={banner.tone}>{banner.msg}</Alert></div>}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="District">
            <Select value={districtF} onChange={(e) => setDistrictF(e.target.value)}>
              <option value="all">All districts</option>
              {districts.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Flour mill">
            <Select value={millF} onChange={(e) => setMillF(e.target.value)}>
              <option value="all">All mills</option>
              {mills.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="all">All</option>
              <option value="behind">Behind target</option>
              <option value="met">Target met</option>
              <option value="none">No quota set</option>
            </Select>
          </Field>
        </div>
      </Card>

      {quotas === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>No mills match these filters.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Mill</Th>
              <Th className="text-right">Regular</Th>
              <Th className="text-right">Grinding</Th>
              <Th className="text-right">KPK</Th>
              <Th className="text-right">Total quota</Th>
              <Th className="text-right">Required flour</Th>
              <Th className="text-right">Flour issued</Th>
              <Th>Progress</Th>
              {canEdit && <Th></Th>}
            </tr></thead>
            <tbody>
              {rows.map((q) => {
                const { totalMt, targetMt, pct, met } = q;
                return (
                  <tr key={q.mill_id}>
                    <Td className="font-medium">
                      {q.mill_name}
                      <span className="block text-xs text-gray-400">{q.district}</span>
                      {!q.has_quota && <span className="ml-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">no quota set</span>}
                    </Td>
                    <Td className="text-right">{q.regular_quota} MT</Td>
                    <Td className="text-right">{q.pending_quota} MT</Td>
                    <Td className="text-right">{q.kpk_quota} MT</Td>
                    <Td className="text-right font-semibold">{totalMt.toLocaleString()}</Td>
                    <Td className="text-right font-semibold">{targetMt.toLocaleString()}</Td>
                    <Td className="text-right font-semibold text-emerald-700">{q.issued_today.toLocaleString()}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
                          <div className={"h-full rounded-full " + (met ? "bg-emerald-500" : "bg-amber-400")} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{targetMt > 0 ? `${pct}%` : "—"}</span>
                      </div>
                    </Td>
                    {canEdit && (
                      <Td>
                        <button
                          onClick={() => setEditing(q)}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          {q.has_quota ? "Edit quota" : "Set quota"}
                        </button>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {editing && (
        <QuotaDialog
          quota={editing}
          date={date}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setBanner({ tone: "success", msg: `Quota saved for ${name} on ${date}.` });
            load();
          }}
        />
      )}
    </div>
  );
}

/** Manual quota entry for a single mill — the alternative to the CSV upload. */
function QuotaDialog({
  quota,
  date,
  onClose,
  onSaved,
}: {
  quota: MillQuota;
  date: string;
  onClose: () => void;
  onSaved: (millName: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [reg, setReg] = useState(String(quota.regular_quota ?? 0));
  const [grd, setGrd] = useState(String(quota.pending_quota ?? 0));
  const [kpk, setKpk] = useState(String(quota.kpk_quota ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nReg = parseQty(reg) ?? 0;
  const nGrd = parseQty(grd) ?? 0;
  const nKpk = parseQty(kpk) ?? 0;
  const bad = [nReg, nGrd, nKpk].some((v) => Number.isNaN(v));
  const total = bad ? 0 : nReg + nGrd + nKpk;

  async function save() {
    if (bad) { setErr("Quotas must be whole numbers (MT)."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("dfc_upsert_quota", {
      p_mill_id: quota.mill_id,
      p_date: date,
      p_regular: nReg,
      p_pending: nGrd,
      p_kpk: nKpk,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved(quota.mill_name);
  }

  return (
    <Modal open onClose={onClose} title={`Quota — ${quota.mill_name}`}>
      <p className="mb-3 text-sm text-gray-500">
        Setting the quota for <strong>{date}</strong>. Values are in metric tonnes.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Regular (MT)">
          <Input inputMode="numeric" value={reg} onChange={(e) => setReg(e.target.value)} />
        </Field>
        <Field label="Grinding (MT)">
          <Input inputMode="numeric" value={grd} onChange={(e) => setGrd(e.target.value)} />
        </Field>
        <Field label="KPK (MT)">
          <Input inputMode="numeric" value={kpk} onChange={(e) => setKpk(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
        Total quota <strong className="text-gray-900">{total.toLocaleString()} MT</strong> ·
        required flour <strong className="text-gray-900">{Math.round(0.7 * total * 1000).toLocaleString()}</strong> kg
      </div>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || bad}>{busy ? "Saving…" : "Save quota"}</Button>
      </div>
    </Modal>
  );
}
