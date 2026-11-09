"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { GroupedBarChart, type BarGroup } from "@/components/BarChart";
import type { DashFilters } from "@/lib/filters";

interface MillTotal {
  mill_id: string;
  mill_name: string;
  district: string | null;
  required_flour: number;
  flour_issued: number;
}

const SERIES = [
  { key: "required", label: "Required Flour", color: "#94a3b8" },
  { key: "issued", label: "Flour Issued", color: "#10b981" },
];

/**
 * Required Flour vs Flour Issued per mill, in kg — the same figures as the
 * Mill Quotas page, summed across the dashboard's date window.
 */
export function MillFlourChart({ filters }: { filters: DashFilters }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<MillTotal[] | null>(null);

  useEffect(() => {
    (async () => {
      setRows(null);
      const { data } = await supabase.rpc("get_mill_quota_totals", {
        p_from: filters.from || null,
        p_to: filters.to || null,
      });
      setRows((data as MillTotal[]) ?? []);
    })();
  }, [supabase, filters.from, filters.to]);

  const scoped = (rows ?? []).filter((r) => {
    if (filters.district !== "all" && r.district !== filters.district) return false;
    if (filters.mill !== "all" && r.mill_name !== filters.mill) return false;
    return true;
  });

  const groups: BarGroup[] = scoped
    .filter((r) => r.required_flour > 0 || r.flour_issued > 0)
    .sort((a, b) => b.required_flour - a.required_flour)
    .map((r) => ({
      name: r.mill_name,
      values: { required: r.required_flour, issued: r.flour_issued },
    }));

  const totReq = groups.reduce((a, g) => a + g.values.required, 0);
  const totIss = groups.reduce((a, g) => a + g.values.issued, 0);
  const pct = totReq > 0 ? Math.round((totIss / totReq) * 100) : 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-lg">🏭</span>
        <h3 className="font-semibold text-gray-900">Required Flour vs Flour Issued</h3>
        <span className="ml-auto text-xs text-gray-400">kg · 10 kg and 20 kg bags only</span>
      </div>

      {rows === null ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState>No mill quota or issue data for this selection.</EmptyState>
      ) : (
        <>
          <GroupedBarChart
            groups={groups}
            series={SERIES}
            xLabel="Flour mill"
            yLabel="Kilograms"
            unit="kg"
            height={240}
          />
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <span>Required <strong className="text-gray-800">{totReq.toLocaleString()} kg</strong></span>
            <span>Issued <strong className="text-gray-800">{totIss.toLocaleString()} kg</strong></span>
            <span>
              Overall{" "}
              <strong className={pct >= 100 ? "text-emerald-700" : pct >= 70 ? "text-amber-600" : "text-red-600"}>
                {pct}%
              </strong>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
