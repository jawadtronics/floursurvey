"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { GroupedBarChart, type BarGroup } from "@/components/BarChart";
import { fetchAll } from "@/lib/fetchAll";
import { downloadCsv, fmtDate } from "@/lib/format";
import type { AdvanceRow } from "@/lib/types";

/** Expected-advance overview. Supervisors may edit; DFC/Super Admin are read-only. */
function todayKarachi() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

const ZONE_SERIES = [
  { key: "assigned", label: "Total Assigned", color: "#94a3b8" },
  { key: "issued", label: "Total Issued", color: "#10b981" },
  { key: "variance", label: "Total Variance", color: "#f43f5e" },
];

/**
 * Zone-wise Assigned vs Issued vs Variance across the advances, with its own
 * zone + date-range filters (independent of the table below).
 */
function ZoneSummary({ rows }: { rows: AdvanceRow[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [zone, setZone] = useState("all");

  const zones = Array.from(new Set(rows.map((r) => r.zone).filter(Boolean))).sort() as string[];

  const scoped = rows.filter((r) => {
    if (from && r.supply_date < from) return false;
    if (to && r.supply_date > to) return false;
    if (zone !== "all" && r.zone !== zone) return false;
    return true;
  });

  const map = new Map<string, BarGroup>();
  for (const r of scoped) {
    const k = r.zone ?? "—";
    const g = map.get(k) ?? { name: k, values: { assigned: 0, issued: 0, variance: 0 } };
    g.values.assigned += r.total_bags;
    g.values.issued += r.issued_bags;
    map.set(k, g);
  }
  // Variance is shown as a magnitude so it is visible on the same axis;
  // the sign is carried in the totals line underneath.
  for (const g of map.values()) g.values.variance = Math.abs(g.values.issued - g.values.assigned);

  const groups = Array.from(map.values()).sort((a, b) => b.values.assigned - a.values.assigned);
  const tAssigned = groups.reduce((a, g) => a + g.values.assigned, 0);
  const tIssued = groups.reduce((a, g) => a + g.values.issued, 0);
  const tVar = tIssued - tAssigned;

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-lg">📊</span>
        <h3 className="font-semibold text-gray-900">Zone-wise Summary</h3>
        <span className="ml-auto text-xs text-gray-400">across all advances</span>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Zone">
          <Select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">All zones</option>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
      </div>

      {groups.length === 0 ? (
        <EmptyState>No advances match these filters.</EmptyState>
      ) : (
        <>
          <GroupedBarChart groups={groups} series={ZONE_SERIES} xLabel="Zone" yLabel="Bags" height={230} />
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <span>Total Assigned <strong className="text-gray-800">{tAssigned.toLocaleString()}</strong></span>
            <span>Total Issued <strong className="text-gray-800">{tIssued.toLocaleString()}</strong></span>
            <span>
              Total Variance{" "}
              <strong className={tVar === 0 ? "text-gray-800" : tVar > 0 ? "text-emerald-700" : "text-red-600"}>
                {tVar > 0 ? `+${tVar.toLocaleString()}` : tVar.toLocaleString()}
              </strong>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function AdvancesView({
  canEdit = false,
  visitor = false,
  canAnyDate = true,
}: {
  canEdit?: boolean;
  /** Visitor mode: read-only, shows Address + Cell instead of Issued + Variance. */
  visitor?: boolean;
  /** When false (visitor without the permission) the view is locked to today. */
  canAnyDate?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AdvanceRow[] | null>(null);
  const [date, setDate] = useState(todayKarachi()); // pre-filtered to today
  const dateLocked = visitor && !canAnyDate;
  const [mill, setMill] = useState("all");
  const [edit, setEdit] = useState<AdvanceRow | null>(null);
  const [reDate, setReDate] = useState<{ advance_id: string; supply_date: string; mill_name: string } | null>(null);
  const [addTo, setAddTo] = useState<{ advance_id: string; supply_date: string } | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    const all = await fetchAll<AdvanceRow>(supabase, "v_advances", ["advance_id", "shopkeeper_id"]);
    all.sort((x, y) => (x.supply_date < y.supply_date ? 1 : x.supply_date > y.supply_date ? -1 : 0));
    setRows(all);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (!rows) return <Spinner />;

  const mills = Array.from(new Set(rows.map((r) => r.mill_name))).sort();
  const filtered = rows.filter((r) => {
    if (date && r.supply_date !== date) return false;
    if (mill !== "all" && r.mill_name !== mill) return false;
    return true;
  });

  const grouped = new Map<string, AdvanceRow[]>();
  for (const r of filtered) {
    const k = `${r.supply_date}__${r.mill_name}__${r.advance_id}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  }

  function exportCsv() {
    if (visitor) {
      downloadCsv("expected_advances.csv", [
        ["Supply date", "Mill", "District", "Shopkeeper", "Address", "Cell number", "Shop", "Latitude", "Longitude", "Zone",
         "Exp 10", "Exp 15", "Exp 20"],
        ...filtered.map((r) => [
          r.supply_date, r.mill_name, r.district, r.shopkeeper_name, r.shop_address ?? "", r.phone ?? "",
          r.shop_name, r.shop_latitude, r.shop_longitude, r.zone,
          r.bags_10, r.bags_15, r.bags_20,
        ]),
      ]);
      return;
    }
    downloadCsv("expected_advances.csv", [
      ["Supply date", "Mill", "District", "Shopkeeper", "Shop", "Latitude", "Longitude", "Zone", "Phone",
       "Exp 10", "Exp 15", "Exp 20", "Issued 10", "Issued 15", "Issued 20", "Var 10", "Var 15", "Var 20"],
      ...filtered.map((r) => [
        r.supply_date, r.mill_name, r.district, r.shopkeeper_name, r.shop_name,
        r.shop_latitude, r.shop_longitude, r.zone, r.phone,
        r.bags_10, r.bags_15, r.bags_20,
        r.issued_10, r.issued_15, r.issued_20,
        r.var_10, r.var_15, r.var_20,
      ]),
    ]);
  }

  async function removeLine(r: AdvanceRow) {
    const { error } = await supabase.rpc("supervisor_set_advance_line", {
      p_advance_id: r.advance_id, p_shopkeeper: r.shopkeeper_id,
      p_b10: 0, p_b15: 0, p_b20: 0, p_remove: true,
    });
    if (error) setBanner({ tone: "error", msg: error.message });
    else { setBanner({ tone: "success", msg: `${r.shopkeeper_name} removed from the advance.` }); load(); }
  }

  return (
    <div>
      {banner && <div className="mb-4"><Alert tone={banner.tone}>{banner.msg}</Alert></div>}

      {!visitor && <ZoneSummary rows={rows} />}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {dateLocked ? (
            <Field label="Supply date" hint="Today only">
              <Input type="date" value={date} disabled />
            </Field>
          ) : (
            <Field label="Supply date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          )}
          <Field label="Flour mill">
            <Select value={mill} onChange={(e) => setMill(e.target.value)}>
              <option value="all">All mills</option>
              {mills.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
          </div>
        </div>
      </Card>

      {grouped.size === 0 ? (
        <EmptyState>No expected advances match these filters.</EmptyState>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([k, list]) => {
            const head = list[0];
            const expected = list.reduce((a, x) => a + x.total_bags, 0);
            const issued = list.reduce((a, x) => a + x.issued_bags, 0);
            return (
              <Card key={k}>
                <CardHeader
                  title={`${head.mill_name} — ${fmtDate(head.supply_date)}`}
                  subtitle={`${list.length} shopkeeper(s) · ${expected} bags expected · ${issued} issued`}
                  action={
                    visitor ? undefined : (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setReDate({ advance_id: head.advance_id, supply_date: head.supply_date, mill_name: head.mill_name })}
                        >
                          Change date
                        </Button>
                        {canEdit && (
                          <Button size="sm" onClick={() => setAddTo({ advance_id: head.advance_id, supply_date: head.supply_date })}>
                            + Add shopkeeper
                          </Button>
                        )}
                      </div>
                    )
                  }
                />
                <TableWrap>
                  {visitor ? (
                    <>
                      <thead><tr>
                        <Th>Shopkeeper</Th><Th>Address</Th><Th>Cell number</Th><Th>Shop</Th><Th>Zone</Th>
                        <Th className="text-center">Expected (10/15/20)</Th>
                        <Th>Progress</Th>
                      </tr></thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.shopkeeper_id}>
                            <Td className="font-medium">{r.shopkeeper_name}</Td>
                            <Td className="text-gray-600">{r.shop_address ?? "—"}</Td>
                            <Td className="text-gray-600">{r.phone ?? "—"}</Td>
                            <Td>
                              <ShopLink name={r.shop_name ?? "—"} lat={r.shop_latitude} lng={r.shop_longitude} />
                            </Td>
                            <Td>{r.zone}</Td>
                            <Td className="text-center text-xs text-gray-600">{r.bags_10} / {r.bags_15} / {r.bags_20}</Td>
                            <Td>
                              {r.issued_bags >= r.total_bags && r.total_bags > 0
                                ? <Badge color="green">Fulfilled</Badge>
                                : r.issued_bags > 0
                                  ? <Badge color="amber">Partial</Badge>
                                  : <Badge color="gray">Not issued</Badge>}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead><tr>
                        <Th>Shopkeeper</Th><Th>Shop</Th><Th>Zone</Th>
                        <Th className="text-center">Expected (10/15/20)</Th>
                        <Th className="text-center">Issued (10/15/20)</Th>
                        <Th className="text-center">Variance (10/15/20)</Th>
                        <Th>Progress</Th>
                        {canEdit && <Th></Th>}
                      </tr></thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.shopkeeper_id}>
                            <Td className="font-medium">{r.shopkeeper_name}</Td>
                            <Td>
                              <ShopLink name={r.shop_name ?? "—"} lat={r.shop_latitude} lng={r.shop_longitude} />
                            </Td>
                            <Td>{r.zone}</Td>
                            <Td className="text-center text-xs text-gray-600">{r.bags_10} / {r.bags_15} / {r.bags_20}</Td>
                            <Td className="text-center text-xs font-semibold text-emerald-700">
                              {r.issued_10} / {r.issued_15} / {r.issued_20}
                            </Td>
                            <Td className="text-center text-xs">
                              <VarCell v={r.var_10} /> <span className="text-gray-300">/</span>{" "}
                              <VarCell v={r.var_15} /> <span className="text-gray-300">/</span>{" "}
                              <VarCell v={r.var_20} />
                            </Td>
                            <Td>
                              {r.issued_bags >= r.total_bags && r.total_bags > 0
                                ? <Badge color="green">Fulfilled</Badge>
                                : r.issued_bags > 0
                                  ? <Badge color="amber">Partial</Badge>
                                  : <Badge color="gray">Not issued</Badge>}
                            </Td>
                            {canEdit && (
                              <Td>
                                <div className="flex gap-2">
                                  <button onClick={() => setEdit(r)} className="text-xs font-medium text-emerald-700 hover:underline">
                                    Change quota
                                  </button>
                                  <button onClick={() => removeLine(r)} className="text-xs font-medium text-red-600 hover:underline">
                                    Remove
                                  </button>
                                </div>
                              </Td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </TableWrap>
              </Card>
            );
          })}
        </div>
      )}

      {edit && (
        <QuotaDialog
          row={edit}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); setBanner({ tone: "success", msg: "Expected quota updated." }); load(); }}
        />
      )}
      {addTo && (
        <AddDialog
          advanceId={addTo.advance_id}
          supplyDate={addTo.supply_date}
          onClose={() => setAddTo(null)}
          onSaved={() => { setAddTo(null); setBanner({ tone: "success", msg: "Shopkeeper added to the advance." }); load(); }}
        />
      )}
      {reDate && (
        <DateDialog
          advanceId={reDate.advance_id}
          current={reDate.supply_date}
          millName={reDate.mill_name}
          onClose={() => setReDate(null)}
          onSaved={(d) => {
            setReDate(null);
            setBanner({ tone: "success", msg: `Supply date changed to ${d}.` });
            setDate(d);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Shop name as a blue link to its map location. */
function ShopLink({ name, lat, lng }: { name: string; lat: number | null; lng: number | null }) {
  if (lat == null || lng == null) return <span className="text-gray-500">{name}</span>;
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

function VarCell({ v }: { v: number }) {
  if (v === 0) return <span className="text-gray-600">0</span>;
  return <span className={v > 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{v > 0 ? `+${v}` : v}</span>;
}

function DateDialog({
  advanceId,
  current,
  millName,
  onClose,
  onSaved,
}: {
  advanceId: string;
  current: string;
  millName: string;
  onClose: () => void;
  onSaved: (d: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("set_advance_date", { p_advance_id: advanceId, p_new_date: d });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved(d);
  }

  return (
    <Modal open onClose={onClose} title={`Change supply date — ${millName}`}>
      <p className="mb-3 text-sm text-gray-500">
        Moving this advance changes the day the mill is allowed to issue against it.
      </p>
      <Field label="Supply date" required>
        <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
      </Field>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || d === current}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}

function QuotaDialog({ row, onClose, onSaved }: { row: AdvanceRow; onClose: () => void; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [b10, setB10] = useState(String(row.bags_10));
  const [b15, setB15] = useState(String(row.bags_15));
  const [b20, setB20] = useState(String(row.bags_20));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("supervisor_set_advance_line", {
      p_advance_id: row.advance_id, p_shopkeeper: row.shopkeeper_id,
      p_b10: Number(b10) || 0, p_b15: Number(b15) || 0, p_b20: Number(b20) || 0, p_remove: false,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Change quota — ${row.shopkeeper_name}`}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="10 kg bags"><Input type="number" min={0} value={b10} onChange={(e) => setB10(e.target.value)} /></Field>
        <Field label="15 kg bags"><Input type="number" min={0} value={b15} onChange={(e) => setB15(e.target.value)} /></Field>
        <Field label="20 kg bags"><Input type="number" min={0} value={b20} onChange={(e) => setB20(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Modal>
  );
}

function AddDialog({
  advanceId,
  supplyDate,
  onClose,
  onSaved,
}: {
  advanceId: string;
  supplyDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [shops, setShops] = useState<{ id: string; full_name: string; shop_name: string | null; zone: string | null }[]>([]);
  const [picked, setPicked] = useState("");
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_users")
        .select("id, full_name, shop_name, zone")
        .eq("role", "shopkeeper")
        .order("full_name");
      setShops((data as typeof shops) ?? []);
    })();
  }, [supabase]);

  async function save() {
    if (!picked) { setErr("Choose a shopkeeper."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("supervisor_set_advance_line", {
      p_advance_id: advanceId, p_shopkeeper: picked,
      p_b10: Number(b10) || 0, p_b15: Number(b15) || 0, p_b20: Number(b20) || 0, p_remove: false,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Add shopkeeper — ${fmtDate(supplyDate)}`}>
      <Field label="Shopkeeper" required>
        <Select value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">Select shopkeeper…</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name} — {s.shop_name} ({s.zone})</option>
          ))}
        </Select>
      </Field>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field label="10 kg bags"><Input type="number" min={0} value={b10} onChange={(e) => setB10(e.target.value)} /></Field>
        <Field label="15 kg bags"><Input type="number" min={0} value={b15} onChange={(e) => setB15(e.target.value)} /></Field>
        <Field label="20 kg bags"><Input type="number" min={0} value={b20} onChange={(e) => setB20(e.target.value)} /></Field>
      </div>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Add"}</Button>
      </div>
    </Modal>
  );
}
