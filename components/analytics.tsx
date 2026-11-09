"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
  Button,
  PhotoThumb,
  Spinner,
  Td,
  Th,
  TableWrap,
  cn,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { CountUp, RevealCard } from "@/components/charts";
import { GroupedBarChart, type BarGroup } from "@/components/BarChart";
import { downloadCsv, fmtDateTime } from "@/lib/format";
import type { EffectiveLine, SurveyRow, SurveyorShop, SurveyorStat } from "@/lib/types";

export type AnalyticsKind = "district" | "zone" | "surveyor";
type Kind = AnalyticsKind;

const SIZES = [
  { key: "10", label: "10 kg", color: "#10b981" },
  { key: "15", label: "15 kg", color: "#f59e0b" },
  { key: "20", label: "20 kg", color: "#6366f1" },
];

function aggregate(
  lines: EffectiveLine[],
  keyFn: (l: EffectiveLine) => string | null
): BarGroup[] {
  const map = new Map<string, BarGroup>();
  for (const l of lines) {
    const k = keyFn(l);
    if (!k) continue;
    const g = map.get(k) ?? { name: k, values: { "10": 0, "15": 0, "20": 0 } };
    g.values["10"] += l.bags_10;
    g.values["15"] += l.bags_15;
    g.values["20"] += l.bags_20;
    map.set(k, g);
  }
  const total = (g: BarGroup) => g.values["10"] + g.values["15"] + g.values["20"];
  return Array.from(map.values()).sort((a, b) => total(b) - total(a));
}

/** Ranking with assigned-vs-visited bars; clicking a surveyor opens the detail. */
function SurveyorBars({
  stats,
  onOpen,
}: {
  stats: SurveyorStat[];
  onOpen: (s: SurveyorStat) => void;
}) {
  const [on, setOn] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (stats.length === 0)
    return <p className="py-6 text-center text-sm text-gray-400">No survey persons in this window.</p>;

  const ranked = [...stats].sort((a, b) => b.visited_surveys - a.visited_surveys);
  const shown = all ? ranked : ranked.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div>
      <div className="space-y-4">
        {shown.map((s, i) => {
          const max = Math.max(1, s.assigned_surveys);
          const aPct = (s.assigned_surveys / max) * 100;
          const vPct = (s.visited_surveys / max) * 100;
          const cov = s.assigned_surveys > 0 ? Math.round((s.visited_surveys / s.assigned_surveys) * 100) : 0;
          return (
            <button
              key={s.survey_person_id}
              onClick={() => onOpen(s)}
              className="w-full rounded-lg border border-transparent p-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50"
            >
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm">{medals[i] ?? i + 1}</span>
                <span className="flex-1 truncate text-sm font-medium text-gray-800">
                  {s.survey_person_name}
                  <span className="ml-1 text-xs text-gray-400">{s.zone}</span>
                </span>
                <span className="text-right text-sm font-bold text-gray-900">
                  <CountUp value={s.visited_surveys} />
                  <span className="text-xs font-normal text-gray-400"> / {s.assigned_surveys.toLocaleString()}</span>
                  <span className="ml-1 text-xs font-normal text-gray-400">surveys done</span>
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] text-gray-500">Assigned</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gray-400 transition-all duration-700 ease-out"
                      style={{ width: on ? `${aPct}%` : "0%", transitionDelay: `${i * 80}ms` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-gray-700">{s.assigned_surveys.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] text-gray-500">Visited</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        "h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out",
                        cov >= 80
                          ? "from-emerald-400 to-emerald-600"
                          : cov >= 40
                            ? "from-amber-400 to-amber-500"
                            : "from-rose-400 to-red-500"
                      )}
                      style={{ width: on ? `${vPct}%` : "0%", transitionDelay: `${i * 80 + 120}ms` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-gray-700">{s.visited_surveys.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[11px] text-emerald-700">View details →</span>
                <span className="text-[11px] text-gray-400">assigned vs visited surveys</span>
                <span className="text-[11px] text-gray-400">{cov}% coverage</span>
              </div>
            </button>
          );
        })}
      </div>
      {ranked.length > 3 && (
        <div className="mt-4 text-center">
          <Button variant="secondary" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Show top 3" : `View all (${ranked.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Per-surveyor drill-down: every assigned shop and whether it was visited. */
function SurveyorDetail({
  stat,
  from,
  to,
  onClose,
}: {
  stat: SurveyorStat;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SurveyorShop[] | null>(null);
  const [tab, setTab] = useState<"all" | "visited" | "missed">("all");
  const [openShop, setOpenShop] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_surveyor_shops", {
        p_surveyor: stat.survey_person_id,
        p_from: from || null,
        p_to: to || null,
      });
      setRows((data as SurveyorShop[]) ?? []);
    })();
  }, [supabase, stat.survey_person_id, from, to]);

  const list = (rows ?? []).filter((r) =>
    tab === "all" ? true : tab === "visited" ? r.visited : !r.visited
  );
  const assignedSurveys = (rows ?? []).reduce((a, r) => a + r.deliveries, 0);
  const visitedSurveys = (rows ?? []).reduce((a, r) => a + r.surveyed_deliveries, 0);
  const shopsVisited = (rows ?? []).filter((r) => r.visited).length;

  function exportCsv() {
    downloadCsv(`surveyor_${stat.survey_person_name}.csv`, [
      ["Shopkeeper", "Shop", "Latitude", "Longitude", "Zone", "Assigned", "Surveyed", "Issued bags",
       "Visited", "Surveys", "Last survey", "Declared bags"],
      ...list.map((r) => [
        r.shopkeeper_name, r.shop_name, r.latitude, r.longitude, r.zone,
        r.deliveries, r.surveyed_deliveries, r.issued_bags, r.visited ? "yes" : "no",
        r.surveys_count, r.last_survey_at ? fmtDateTime(r.last_survey_at) : "",
        r.declared_bags,
      ]),
    ]);
  }

  const window = from || to ? `${from || "start"} → ${to || "today"}` : "all time";

  return (
    <Modal open onClose={onClose} size="lg" title={`${stat.survey_person_name} — ${stat.zone ?? ""}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
          Assigned surveys <strong>{assignedSurveys.toLocaleString()}</strong>
        </span>
        <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
          Visited surveys <strong>{visitedSurveys.toLocaleString()}</strong>
        </span>
        <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
          Missed <strong>{(assignedSurveys - visitedSurveys).toLocaleString()}</strong>
        </span>
        <span className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
          Shops visited <strong>{shopsVisited}</strong> / {(rows ?? []).length}
        </span>
        <span className="ml-auto text-xs text-gray-400">{window}</span>
      </div>

      <p className="mb-2 text-xs text-gray-400">Click a visited shop to see every individual survey done there.</p>
      <div className="mb-3 flex gap-2">
        {(["all", "visited", "missed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
              tab === t ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {t === "missed" ? "Not visited" : t}
          </button>
        ))}
        <button onClick={exportCsv} className="ml-auto text-xs font-medium text-emerald-700 hover:underline">
          ⬇ Export CSV
        </button>
      </div>

      {rows === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No shops in this view.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
          <TableWrap>
            <thead><tr>
              <Th>Shop</Th><Th>Zone</Th>
              <Th className="text-right">Assigned</Th><Th className="text-right">Surveyed</Th>
              <Th className="text-right">Issued bags</Th>
              <Th className="text-right">Declared</Th>
              <Th>Last survey</Th><Th>Status</Th>
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.shopkeeper_id}>
                <tr
                  onClick={r.visited ? () => setOpenShop((o) => (o === r.shopkeeper_id ? null : r.shopkeeper_id)) : undefined}
                  className={cn(
                    r.visited ? "cursor-pointer hover:bg-gray-50" : "bg-rose-50/40",
                    openShop === r.shopkeeper_id && "bg-emerald-50/60"
                  )}
                >
                  <Td className="font-medium">
                    {r.latitude != null && r.longitude != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:underline"
                      >
                        {r.shop_name ?? r.shopkeeper_name}
                      </a>
                    ) : (
                      r.shop_name ?? r.shopkeeper_name
                    )}
                    <span className="block text-xs text-gray-400">{r.shopkeeper_name}</span>
                  </Td>
                  <Td>{r.zone}</Td>
                  <Td className="text-right">{r.deliveries}</Td>
                  <Td className="text-right font-semibold text-emerald-700">{r.surveyed_deliveries}</Td>
                  <Td className="text-right">{r.issued_bags.toLocaleString()}</Td>
                  <Td className="text-right">{r.visited ? r.declared_bags.toLocaleString() : "—"}</Td>
                  <Td className="text-gray-500">{r.last_survey_at ? fmtDateTime(r.last_survey_at) : "—"}</Td>
                  <Td>
                    {r.visited
                      ? <Badge color="green">{openShop === r.shopkeeper_id ? "▾" : "▸"} Visited ×{r.surveys_count}</Badge>
                      : <Badge color="red">Not visited</Badge>}
                  </Td>
                </tr>
                {openShop === r.shopkeeper_id && (
                  <tr>
                    <td colSpan={8} className="bg-gray-50 px-4 py-3">
                      <ShopSurveys
                        surveyorId={stat.survey_person_id}
                        shopkeeperId={r.shopkeeper_id}
                        from={from}
                        to={to}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}
    </Modal>
  );
}

/** Every individual survey this surveyor submitted for one shop, newest first. */
function ShopSurveys({
  surveyorId,
  shopkeeperId,
  from,
  to,
}: {
  surveyorId: string;
  shopkeeperId: string;
  from: string;
  to: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SurveyRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_surveys_visible")
        .select("*")
        .eq("survey_person_id", surveyorId)
        .eq("shopkeeper_id", shopkeeperId)
        .order("created_at", { ascending: false });
      // Same Karachi-date window as the ranking and get_surveyor_shops.
      const inWindow = ((data as SurveyRow[]) ?? []).filter((r) => {
        const d = new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
      setRows(inWindow);
    })();
  }, [supabase, surveyorId, shopkeeperId, from, to]);

  if (rows === null) return <p className="text-xs text-gray-400">Loading surveys…</p>;
  if (rows.length === 0) return <p className="text-xs text-gray-400">No surveys in this window.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1 pr-3 font-medium">#</th>
            <th className="py-1 pr-3 font-medium">Date &amp; time</th>
            <th className="py-1 pr-3 text-right font-medium">10 kg</th>
            <th className="py-1 pr-3 text-right font-medium">15 kg</th>
            <th className="py-1 pr-3 text-right font-medium">20 kg</th>
            <th className="py-1 pr-3 text-right font-medium">Total</th>
            <th className="py-1 pr-3 font-medium">Photo</th>
            <th className="py-1 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-gray-200 align-top">
              <td className="py-1.5 pr-3 text-gray-400">{rows.length - i}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-gray-700">
                {fmtDateTime(r.created_at)}
                {r.source === "dfc" && <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-800">DFC</span>}
              </td>
              <td className="py-1.5 pr-3 text-right">{r.declared_bags_10}</td>
              <td className="py-1.5 pr-3 text-right">{r.declared_bags_15}</td>
              <td className="py-1.5 pr-3 text-right">{r.declared_bags_20}</td>
              <td className="py-1.5 pr-3 text-right font-semibold">{r.declared_total_bags}</td>
              <td className="py-1.5 pr-3">
                <PhotoThumb url={r.survey_photo_url} lat={r.survey_photo_lat} lng={r.survey_photo_lng} />
              </td>
              <td className="py-1.5 text-gray-600">{r.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Analytics({
  show,
  lines,
  from,
  to,
}: {
  show: Kind[];
  /** Already filtered by the Dashboard — this component never filters. */
  lines: EffectiveLine[];
  from: string;
  to: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<SurveyorStat[] | null>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const [openSurveyor, setOpenSurveyor] = useState<SurveyorStat | null>(null);

  // Surveyor ranking follows the same date window as the charts.
  const loadStats = useCallback(async () => {
    setStats(null);
    const { data } = await supabase.rpc("get_surveyor_stats", {
      p_from: from || null,
      p_to: to || null,
    });
    setStats((data as SurveyorStat[]) ?? []);
  }, [supabase, from, to]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const byDistrict = aggregate(lines, (l) => l.issue_district);
  const byZone = aggregate(lines, (l) => l.shop_zone);
  const drillZones = drill
    ? aggregate(lines.filter((l) => l.issue_district === drill), (l) => l.shop_zone)
    : [];

  const showDistrict = show.includes("district");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showDistrict && (
        <RevealCard delay={40}>
          <ChartHead icon="🗺️" title="By District" />
          <GroupedBarChart
            groups={byDistrict}
            series={SIZES}
            xLabel="District"
            picked={drill}
            onPick={(name) => setDrill((d) => (d === name ? null : name))}
            hint="Click a district to compare its zones"
          />
        </RevealCard>
      )}

      {showDistrict && (
        <RevealCard delay={120}>
          <ChartHead icon="📍" title={drill ? `Zones in ${drill}` : "Zones"} />
          {drill ? (
            <GroupedBarChart groups={drillZones} series={SIZES} xLabel="Zone" />
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">
              Click a district on the left to compare its zones.
            </p>
          )}
        </RevealCard>
      )}

      {!showDistrict && show.includes("zone") && (
        <RevealCard delay={120}>
          <ChartHead icon="📍" title="By Zone" />
          <GroupedBarChart groups={byZone} series={SIZES} xLabel="Zone" />
        </RevealCard>
      )}

      {show.includes("surveyor") && (
        <RevealCard delay={200}>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <h3 className="font-semibold text-gray-900">Surveyor Ranking</h3>
            <span className="ml-auto text-xs text-gray-400">click for details</span>
          </div>
          {stats === null ? <Spinner /> : <SurveyorBars stats={stats} onOpen={setOpenSurveyor} />}
        </RevealCard>
      )}

      {openSurveyor && (
        <SurveyorDetail
          stat={openSurveyor}
          from={from}
          to={to}
          onClose={() => setOpenSurveyor(null)}
        />
      )}
    </div>
  );
}

function ChartHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
    </div>
  );
}
