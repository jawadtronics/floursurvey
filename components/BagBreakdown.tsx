"use client";

import { useState } from "react";
import { Card, EmptyState, Td, Th, TableWrap } from "@/components/ui";
import { GroupedBarChart, type BarGroup } from "@/components/BarChart";
import { downloadCsv, fmtDate, fmtDateTime } from "@/lib/format";
import type { AdvanceRow, EffectiveLine, SurveyRow } from "@/lib/types";

type Size = "10" | "15" | "20";
type Metric = "expected" | "issued" | "surveyed";

const SERIES = [
  { key: "expected", label: "Expected", color: "#94a3b8" },
  { key: "issued", label: "Issued", color: "#10b981" },
  { key: "surveyed", label: "Surveyed", color: "#6366f1" },
];

const SIZES: Size[] = ["10", "15", "20"];

function bagsOf(l: EffectiveLine, s: Size) {
  return s === "10" ? l.bags_10 : s === "15" ? l.bags_15 : l.bags_20;
}
function declaredOf(r: SurveyRow, s: Size) {
  return s === "10" ? r.declared_bags_10 : s === "15" ? r.declared_bags_15 : r.declared_bags_20;
}
function expectedOf(a: AdvanceRow, s: Size) {
  return s === "10" ? a.bags_10 : s === "15" ? a.bags_15 : a.bags_20;
}

/**
 * Bag Size Breakdown — a grouped bar chart comparing, for each bag size, what
 * was Expected (from the mill's advance), Issued (dispatched) and Surveyed
 * (declared on the ground). Clicking any bar drills into the rows behind it.
 */
export function BagBreakdown({
  lines,
  surveys,
  advances,
}: {
  /** All three arrays arrive already filtered by the Dashboard, so this
   *  component cannot disagree with the other charts on the page. */
  lines: EffectiveLine[];
  surveys: SurveyRow[];
  advances: AdvanceRow[];
}) {
  const [pick, setPick] = useState<{ size: Size; metric: Metric } | null>(null);

  const issuedRows = lines;
  const surveyRows = surveys;
  const advanceRows = advances;

  const groups: BarGroup[] = SIZES.map((s) => ({
    name: `${s} kg`,
    values: {
      expected: advanceRows.reduce((acc, a) => acc + expectedOf(a, s), 0),
      issued: issuedRows.reduce((acc, l) => acc + bagsOf(l, s), 0),
      surveyed: surveyRows.reduce((acc, r) => acc + declaredOf(r, s), 0),
    },
  }));

  const totals = {
    expected: groups.reduce((a, g) => a + g.values.expected, 0),
    issued: groups.reduce((a, g) => a + g.values.issued, 0),
    surveyed: groups.reduce((a, g) => a + g.values.surveyed, 0),
  };
  const grand = totals.expected + totals.issued + totals.surveyed;

  // ---- drill-down -----------------------------------------------------
  const size = pick?.size ?? null;
  const dIssued = pick?.metric === "issued" && size ? issuedRows.filter((l) => bagsOf(l, size) > 0) : [];
  const dSurvey = pick?.metric === "surveyed" && size ? surveyRows.filter((r) => declaredOf(r, size) > 0) : [];
  const dAdvance = pick?.metric === "expected" && size ? advanceRows.filter((a) => expectedOf(a, size) > 0) : [];

  function exportDetail() {
    if (!pick || !size) return;
    if (pick.metric === "issued") {
      downloadCsv(`issued_${size}kg.csv`, [
        ["Date", "Truck", "Mill", "District", "Zone", "Shopkeeper", "Shop", "Latitude", "Longitude", `${size}kg bags`],
        ...dIssued.map((l) => [
          l.issue_date, l.track_number, l.mill_name, l.issue_district, l.shop_zone,
          l.shopkeeper_name, l.shop_name, l.shop_latitude, l.shop_longitude, bagsOf(l, size),
        ]),
      ]);
    } else if (pick.metric === "surveyed") {
      downloadCsv(`surveyed_${size}kg.csv`, [
        ["Date", "Surveyor", "Shopkeeper", "Shop", "Latitude", "Longitude", "Zone", `${size}kg bags declared`],
        ...dSurvey.map((r) => [
          fmtDateTime(r.created_at), r.survey_person_name, r.shopkeeper_name, r.shop_name,
          r.shop_latitude, r.shop_longitude, r.zone, declaredOf(r, size),
        ]),
      ]);
    } else {
      downloadCsv(`expected_${size}kg.csv`, [
        ["Supply date", "Mill", "District", "Zone", "Shopkeeper", "Shop", "Latitude", "Longitude", `${size}kg bags expected`],
        ...dAdvance.map((a) => [
          a.supply_date, a.mill_name, a.district, a.zone, a.shopkeeper_name, a.shop_name,
          a.shop_latitude, a.shop_longitude, expectedOf(a, size),
        ]),
      ]);
    }
  }

  const metricLabel = SERIES.find((s) => s.key === pick?.metric)?.label ?? "";

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-lg">📊</span>
        <h3 className="font-semibold text-gray-900">Bag Size Breakdown</h3>
        <span className="ml-auto text-xs text-gray-400">click a bar for details</span>
      </div>

      {grand === 0 ? (
        <EmptyState>No bags match these filters.</EmptyState>
      ) : (
        <>
          <GroupedBarChart
            groups={groups}
            series={SERIES}
            xLabel="Bag size"
            yLabel="Bags"
            height={240}
            pickedBar={pick ? { group: `${pick.size} kg`, key: pick.metric } : null}
            onPickBar={(groupName, key) => {
              const s = groupName.split(" ")[0] as Size;
              const m = key as Metric;
              setPick((p) => (p && p.size === s && p.metric === m ? null : { size: s, metric: m }));
            }}
          />
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
            <span>Expected <strong className="text-gray-800">{totals.expected.toLocaleString()}</strong></span>
            <span>Issued <strong className="text-gray-800">{totals.issued.toLocaleString()}</strong></span>
            <span>Surveyed <strong className="text-gray-800">{totals.surveyed.toLocaleString()}</strong></span>
          </div>
        </>
      )}

      {pick && size && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">
              {metricLabel} · {size} kg bags —{" "}
              {pick.metric === "issued"
                ? `${dIssued.length} delivery line(s)`
                : pick.metric === "surveyed"
                  ? `${dSurvey.length} survey(s)`
                  : `${dAdvance.length} advance line(s)`}
            </h4>
            <div className="flex gap-2">
              <button onClick={exportDetail} className="text-xs font-medium text-emerald-700 hover:underline">
                ⬇ Export CSV
              </button>
              <button onClick={() => setPick(null)} className="text-xs font-medium text-gray-500 hover:underline">
                Close
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
            {pick.metric === "issued" ? (
              dIssued.length === 0 ? <EmptyState>Nothing to show.</EmptyState> : (
                <TableWrap>
                  <thead><tr>
                    <Th>Date</Th><Th>Truck</Th><Th>Mill</Th><Th>Shopkeeper</Th><Th>Zone</Th>
                    <Th className="text-right">{size} kg bags</Th>
                  </tr></thead>
                  <tbody>
                    {dIssued.map((l) => (
                      <tr key={l.id}>
                        <Td>{fmtDate(l.issue_date)}</Td>
                        <Td className="font-medium">{l.track_number}</Td>
                        <Td>{l.mill_name}<span className="block text-xs text-gray-400">{l.issue_district}</span></Td>
                        <Td><ShopCell name={l.shopkeeper_name} sub={l.shop_name} lat={l.shop_latitude} lng={l.shop_longitude} /></Td>
                        <Td>{l.shop_zone}</Td>
                        <Td className="text-right font-semibold">{bagsOf(l, size)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )
            ) : pick.metric === "surveyed" ? (
              dSurvey.length === 0 ? <EmptyState>Nothing to show.</EmptyState> : (
                <TableWrap>
                  <thead><tr>
                    <Th>Date</Th><Th>Surveyor</Th><Th>Shopkeeper</Th><Th>Zone</Th>
                    <Th className="text-right">{size} kg declared</Th>
                  </tr></thead>
                  <tbody>
                    {dSurvey.map((r) => (
                      <tr key={r.id}>
                        <Td>{fmtDateTime(r.created_at)}</Td>
                        <Td>
                          {r.survey_person_name ?? "—"}
                          {r.source === "dfc" && <span className="ml-1 rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-800">DFC</span>}
                        </Td>
                        <Td><ShopCell name={r.shopkeeper_name} sub={r.shop_name} lat={r.shop_latitude} lng={r.shop_longitude} /></Td>
                        <Td>{r.zone}</Td>
                        <Td className="text-right font-semibold">{declaredOf(r, size)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )
            ) : dAdvance.length === 0 ? <EmptyState>Nothing to show.</EmptyState> : (
              <TableWrap>
                <thead><tr>
                  <Th>Supply date</Th><Th>Mill</Th><Th>Shopkeeper</Th><Th>Zone</Th>
                  <Th className="text-right">{size} kg expected</Th>
                </tr></thead>
                <tbody>
                  {dAdvance.map((a) => (
                    <tr key={`${a.advance_id}-${a.shopkeeper_id}`}>
                      <Td>{fmtDate(a.supply_date)}</Td>
                      <Td>{a.mill_name}<span className="block text-xs text-gray-400">{a.district}</span></Td>
                      <Td><ShopCell name={a.shopkeeper_name} sub={a.shop_name} lat={a.shop_latitude} lng={a.shop_longitude} /></Td>
                      <Td>{a.zone}</Td>
                      <Td className="text-right font-semibold">{expectedOf(a, size)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ShopCell({
  name,
  sub,
  lat,
  lng,
}: {
  name: string;
  sub: string | null;
  lat: number | null;
  lng: number | null;
}) {
  return (
    <>
      {lat != null && lng != null ? (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-600 hover:underline"
        >
          {name}
        </a>
      ) : (
        name
      )}
      <span className="block text-xs text-gray-400">{sub}</span>
    </>
  );
}
