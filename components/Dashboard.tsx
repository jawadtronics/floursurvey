"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Card, Field, Input, Select, Spinner } from "@/components/ui";
import { Analytics, type AnalyticsKind } from "@/components/analytics";
import { BagBreakdown } from "@/components/BagBreakdown";
import { MillFlourChart } from "@/components/MillFlourChart";
import {
  EMPTY_FILTERS,
  describeFilters,
  filterAdvances,
  filterLines,
  filterSurveys,
  zoneDistrictMap,
  type DashFilters,
} from "@/lib/filters";
import type { AdvanceRow, EffectiveLine, SurveyRow } from "@/lib/types";

/**
 * Dashboard shell. It fetches each dataset once, owns the ONE filter bar, and
 * hands the already-filtered rows to every chart. Because the charts never
 * filter anything themselves, the zone chart and the bag breakdown are
 * mathematically guaranteed to agree.
 */
export function Dashboard({ show }: { show: AnalyticsKind[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [lines, setLines] = useState<EffectiveLine[] | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [f, setF] = useState<DashFilters>(EMPTY_FILTERS);

  useEffect(() => {
    (async () => {
      // fetchAll pages past PostgREST's 1000-row cap; a plain select() here
      // silently truncated the data and made the charts disagree.
      const [a, b, c] = await Promise.all([
        fetchAll<EffectiveLine>(supabase, "v_issue_lines_effective", ["id"]),
        fetchAll<SurveyRow>(supabase, "v_surveys_visible", ["id"]),
        fetchAll<AdvanceRow>(supabase, "v_advances", ["advance_id", "shopkeeper_id"]),
      ]);
      setLines(a);
      setSurveys(b);
      setAdvances(c);
    })();
  }, [supabase]);

  if (!lines) return <Spinner label="Building analytics…" />;

  const zoneDistrict = zoneDistrictMap(lines);

  // Option lists come from the unfiltered data so the dropdowns stay stable.
  const districts = Array.from(
    new Set(lines.map((l) => l.issue_district).filter(Boolean))
  ).sort() as string[];
  const zones = Array.from(
    new Set(
      lines
        .filter((l) => f.district === "all" || l.issue_district === f.district)
        .map((l) => l.shop_zone)
        .filter(Boolean)
    )
  ).sort() as string[];
  const mills = Array.from(new Set(lines.map((l) => l.mill_name))).sort();

  // ---- filtered once, shared by everything below --------------------------
  const fLines = filterLines(lines, f);
  const millShopIds = new Set(fLines.map((l) => l.shopkeeper_id));
  const fSurveys = filterSurveys(surveys, f, zoneDistrict, millShopIds);
  const fAdvances = filterAdvances(advances, f);

  const set = (patch: Partial<DashFilters>) => setF((p) => ({ ...p, ...patch }));

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="From date">
            <Input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="To date">
            <Input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="District">
            <Select
              value={f.district}
              onChange={(e) => set({ district: e.target.value, zone: "all" })}
            >
              <option value="all">All districts</option>
              {districts.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={f.zone} onChange={(e) => set({ zone: e.target.value })}>
              <option value="all">All zones</option>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <Field label="Flour mill">
            <Select value={f.mill} onChange={(e) => set({ mill: e.target.value })}>
              <option value="all">All mills</option>
              {mills.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>
            Showing <strong className="text-gray-700">{describeFilters(f)}</strong> — one filter
            for every chart on this page, so the totals always match.
          </span>
          <button
            onClick={() => setF(EMPTY_FILTERS)}
            className="ml-auto font-medium text-emerald-700 hover:underline"
          >
            Reset filters
          </button>
        </div>
      </Card>

      <div className="mb-6">
        <Analytics show={show} lines={fLines} from={f.from} to={f.to} />
      </div>

      <div className="mb-6">
        <BagBreakdown lines={fLines} surveys={fSurveys} advances={fAdvances} />
      </div>

      <div className="mb-6">
        <MillFlourChart filters={f} />
      </div>
    </div>
  );
}
