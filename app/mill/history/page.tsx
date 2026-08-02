"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { EffectiveLine } from "@/lib/types";

interface Group {
  issue_id: string;
  track_number: string;
  issue_date: string;
  vehicle_number: string | null;
  lines: EffectiveLine[];
  total: number;
  received: number;
  notReceived: number;
  issued: number;
}

export default function MillHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_issue_lines_effective")
        .select("*")
        .order("issue_date", { ascending: false });
      const lines = (data as EffectiveLine[]) ?? [];
      const map = new Map<string, Group>();
      for (const l of lines) {
        let g = map.get(l.issue_id);
        if (!g) {
          g = {
            issue_id: l.issue_id,
            track_number: l.track_number,
            issue_date: l.issue_date,
            vehicle_number: l.vehicle_number,
            lines: [],
            total: 0,
            received: 0,
            notReceived: 0,
            issued: 0,
          };
          map.set(l.issue_id, g);
        }
        g.lines.push(l);
        g.total += l.total_bags;
        if (l.effective_status === "received") g.received++;
        else if (l.effective_status === "not_received") g.notReceived++;
        else g.issued++;
      }
      setGroups(Array.from(map.values()));
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Issue History"
        subtitle="Your dispatches and their acknowledgement status."
      />
      {groups.length === 0 ? (
        <EmptyState>You haven&apos;t created any issues yet.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Track No</Th>
                <Th>Vehicle</Th>
                <Th className="text-right">Shopkeepers</Th>
                <Th className="text-right">Total Bags</Th>
                <Th>Acknowledgement</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  <tr key={g.issue_id} className="hover:bg-gray-50">
                    <Td>{fmtDate(g.issue_date)}</Td>
                    <Td className="font-medium">{g.track_number}</Td>
                    <Td className="text-gray-500">{g.vehicle_number ?? "—"}</Td>
                    <Td className="text-right">{g.lines.length}</Td>
                    <Td className="text-right font-semibold">{g.total}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {g.received > 0 && (
                          <Badge color="green">{g.received} received</Badge>
                        )}
                        {g.issued > 0 && (
                          <Badge color="amber">{g.issued} pending</Badge>
                        )}
                        {g.notReceived > 0 && (
                          <Badge color="red">{g.notReceived} not received</Badge>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <button
                        onClick={() =>
                          setOpen((o) => ({ ...o, [g.issue_id]: !o[g.issue_id] }))
                        }
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        {open[g.issue_id] ? "Hide" : "View lines"}
                      </button>
                    </Td>
                  </tr>
                  {open[g.issue_id] &&
                    g.lines.map((l) => (
                      <tr key={l.id} className="bg-gray-50/60">
                        <Td></Td>
                        <Td className="text-gray-500" >
                          ↳ {l.shopkeeper_name}
                        </Td>
                        <Td className="text-gray-500">{l.shop_name}</Td>
                        <Td className="text-right text-gray-500">
                          {l.bags_10}/{l.bags_15}/{l.bags_20}
                        </Td>
                        <Td className="text-right">{l.total_bags}</Td>
                        <Td>
                          <StatusBadge status={l.effective_status} />
                        </Td>
                        <Td></Td>
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
