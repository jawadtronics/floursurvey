"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fmtDate } from "@/lib/format";
import type { AdvanceRow } from "@/lib/types";

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

export default function ExpectedAdvancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [supplyDate, setSupplyDate] = useState(todayKarachi());
  const [lines, setLines] = useState<Line[]>([]);
  const [existing, setExisting] = useState<AdvanceRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    const all = await fetchAll<AdvanceRow>(supabase, "v_advances", ["advance_id", "shopkeeper_id"]);
    all.sort((a, b) => (a.supply_date < b.supply_date ? 1 : a.supply_date > b.supply_date ? -1 : 0));
    setExisting(all);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const totals = lines.reduce(
    (a, l) => ({ b10: a.b10 + l.bags_10, b15: a.b15 + l.bags_15, b20: a.b20 + l.bags_20 }),
    { b10: 0, b15: 0, b20: 0 }
  );
  const grand = totals.b10 + totals.b15 + totals.b20;

  async function submit() {
    setSaving(true);
    setBanner(null);
    const { error } = await supabase.rpc("create_advance", {
      p_supply_date: supplyDate,
      p_lines: lines.map((l) => ({
        shopkeeper_id: l.shopkeeper_id,
        bags_10: l.bags_10,
        bags_15: l.bags_15,
        bags_20: l.bags_20,
      })),
    });
    setSaving(false);
    if (error) { setBanner({ tone: "error", msg: error.message }); return; }
    setBanner({
      tone: "success",
      msg: `Expected advance submitted for ${supplyDate} — ${lines.length} shopkeeper(s), ${grand} bags. You can now issue to these shopkeepers on that date.`,
    });
    setLines([]);
    load();
  }

  // group saved advances by supply date
  const grouped = new Map<string, AdvanceRow[]>();
  for (const a of existing ?? []) {
    const k = a.supply_date;
    (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(a);
  }

  return (
    <div>
      <PageHeader
        title="Expected Advance"
        subtitle="Declare in advance which shopkeepers you'll supply on a date. You can only issue flour to shopkeepers listed here."
      />

      {banner && <div className="mb-4"><Alert tone={banner.tone}>{banner.msg}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="max-w-xs">
              <Field label="Supply Date" required>
                <Input type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Shopkeepers on this advance"
              subtitle={`${lines.length} added`}
              action={<Button size="sm" onClick={() => setModalOpen(true)}>+ Add Shopkeeper</Button>}
            />
            {lines.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                No shopkeepers yet. Add one by verifying their phone number.
              </div>
            ) : (
              <TableWrap>
                <thead><tr>
                  <Th>Shopkeeper</Th><Th>Shop</Th>
                  <Th className="text-right">10kg</Th><Th className="text-right">15kg</Th><Th className="text-right">20kg</Th>
                  <Th className="text-right">Bags</Th><Th></Th>
                </tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.shopkeeper_id}>
                      <Td>{l.shopkeeper_name}</Td>
                      <Td className="text-gray-500">{l.shop_name}</Td>
                      <Td className="text-right">{l.bags_10}</Td>
                      <Td className="text-right">{l.bags_15}</Td>
                      <Td className="text-right">{l.bags_20}</Td>
                      <Td className="text-right font-semibold">{l.bags_10 + l.bags_15 + l.bags_20}</Td>
                      <Td>
                        <button
                          onClick={() => setLines((p) => p.filter((x) => x.shopkeeper_id !== l.shopkeeper_id))}
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

        <div>
          <Card className="sticky top-20 p-5">
            <h3 className="font-semibold text-gray-900">Expected totals (bags)</h3>
            <table className="mt-3 w-full text-sm">
              <tbody>
                <tr><td className="py-1 text-gray-600">10 kg bags</td><td className="py-1 text-right font-medium">{totals.b10}</td></tr>
                <tr><td className="py-1 text-gray-600">15 kg bags</td><td className="py-1 text-right font-medium">{totals.b15}</td></tr>
                <tr><td className="py-1 text-gray-600">20 kg bags</td><td className="py-1 text-right font-medium">{totals.b20}</td></tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="pt-2 font-semibold text-gray-900">Total bags</td>
                  <td className="pt-2 text-right text-lg font-bold text-emerald-700">{grand}</td>
                </tr>
              </tfoot>
            </table>
            <Button className="mt-5 w-full" size="lg" disabled={lines.length === 0 || saving} onClick={submit}>
              {saving ? "Submitting…" : "Submit Advance"}
            </Button>
            <p className="mt-2 text-center text-xs text-gray-400">
              Re-submitting for the same date updates that advance.
            </p>
          </Card>
        </div>
      </div>

      {/* saved advances */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-gray-900">Submitted advances</h2>
      {existing === null ? <Spinner /> : grouped.size === 0 ? (
        <EmptyState>No advances submitted yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([d, list]) => (
            <Card key={d}>
              <CardHeader
                title={`Supply date — ${fmtDate(d)}`}
                subtitle={`${list.length} shopkeeper(s) · ${list.reduce((a, x) => a + x.total_bags, 0)} bags expected`}
              />
              <TableWrap>
                <thead><tr>
                  <Th>Shopkeeper</Th><Th>Shop</Th><Th>Zone</Th>
                  <Th className="text-right">Expected (10/15/20)</Th>
                  <Th className="text-right">Expected bags</Th>
                  <Th className="text-right">Issued so far</Th>
                </tr></thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.shopkeeper_id}>
                      <Td className="font-medium">{a.shopkeeper_name}</Td>
                      <Td className="text-gray-500">{a.shop_name}</Td>
                      <Td>{a.zone}</Td>
                      <Td className="text-right text-gray-600">{a.bags_10}/{a.bags_15}/{a.bags_20}</Td>
                      <Td className="text-right font-semibold">{a.total_bags}</Td>
                      <Td className={"text-right font-semibold " + (a.issued_bags > 0 ? "text-emerald-700" : "text-gray-400")}>
                        {a.issued_bags}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Card>
          ))}
        </div>
      )}

      <AddShopkeeperModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        existing={lines.map((l) => l.shopkeeper_id)}
        onAdd={(l) => { setLines((p) => [...p, l]); setModalOpen(false); }}
      />
    </div>
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
  const [found, setFound] = useState<{ shopkeeper_id: string; shopkeeper_name: string; shop_name: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [b10, setB10] = useState("");
  const [b15, setB15] = useState("");
  const [b20, setB20] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setPhone(""); setFound(null); setNotFound(false);
    setB10(""); setB15(""); setB20(""); setErr(null);
  }

  async function verify() {
    setErr(null); setNotFound(false); setFound(null); setVerifying(true);
    const { data, error } = await supabase.rpc("verify_shopkeeper", { p_phone: phone.trim() });
    setVerifying(false);
    if (error) { setErr(error.message); return; }
    if (!data?.found) { setNotFound(true); return; }
    if (existing.includes(data.shopkeeper_id)) { setErr("This shopkeeper is already on this advance."); return; }
    setFound(data);
  }

  const total = (Number(b10) || 0) + (Number(b15) || 0) + (Number(b20) || 0);

  function add() {
    if (!found) return;
    if (total <= 0) { setErr("Enter at least one bag."); return; }
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
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add Shopkeeper">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Cell number" required>
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setFound(null); setNotFound(false); }}
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
            No registered shopkeeper found with this number. Contact the DFC to register them.
          </Alert>
        )}
        {err && <Alert tone="error">{err}</Alert>}

        {found && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm">
              <div className="font-semibold text-emerald-800">{found.shopkeeper_name}</div>
              <div className="text-emerald-700">{found.shop_name}</div>
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
              <Button onClick={add} disabled={total <= 0}>Add to advance</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
