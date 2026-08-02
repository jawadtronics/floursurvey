"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { EffectiveLine, LineStatus } from "@/lib/types";

export default function ShopHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<EffectiveLine[]>([]);
  const [status, setStatus] = useState<LineStatus | "all">("all");
  const [mill, setMill] = useState("all");
  const [from, setFrom] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_issue_lines_effective")
        .select("*")
        .order("issue_date", { ascending: false });
      setLines((data as EffectiveLine[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const mills = useMemo(
    () => Array.from(new Set(lines.map((l) => l.mill_name))).sort(),
    [lines]
  );

  const filtered = lines.filter((l) => {
    if (status !== "all" && l.effective_status !== status) return false;
    if (mill !== "all" && l.mill_name !== mill) return false;
    if (from && l.issue_date < from) return false;
    return true;
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Delivery History" subtitle="Every delivery ever addressed to you." />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as LineStatus | "all")}>
              <option value="all">All</option>
              <option value="issued">Issued</option>
              <option value="received">Received</option>
              <option value="not_received">Not received</option>
            </Select>
          </Field>
          <Field label="Mill">
            <Select value={mill} onChange={(e) => setMill(e.target.value)}>
              <option value="all">All mills</option>
              {mills.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From date">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState>No deliveries match these filters.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Mill</Th>
                <Th>Track No</Th>
                <Th className="text-right">10/15/20</Th>
                <Th className="text-right">Total Bags</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <Td>{fmtDate(l.issue_date)}</Td>
                  <Td>{l.mill_name}</Td>
                  <Td className="font-medium">{l.track_number}</Td>
                  <Td className="text-right text-gray-500">
                    {l.bags_10}/{l.bags_15}/{l.bags_20}
                  </Td>
                  <Td className="text-right font-semibold">{l.total_bags}</Td>
                  <Td>
                    <StatusBadge status={l.effective_status} />
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
