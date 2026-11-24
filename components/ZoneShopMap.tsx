"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { MapView, type MapPin } from "@/components/MapView";
import { Field, Input, Td, Th, TableWrap, cn } from "@/components/ui";
import { downloadCsv } from "@/lib/format";
import type { AdvanceRow } from "@/lib/types";

/** A shopkeeper as the dashboard needs it for the zone map. */
export interface ZoneShop {
  id: string;
  full_name: string;
  shop_name: string | null;
  zone: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

const GREEN = "#059669";
const RED = "#dc2626";

/** Today in Karachi, which is the date boundary the whole app works to. */
export function karachiToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/**
 * Shops with an expected-flour commitment on a given day, for one zone.
 * `advances` is the UNFILTERED advance list so the date picker here can reach
 * any day, independent of the dashboard's own window.
 */
export function expectedShopIds(
  advances: AdvanceRow[],
  zone: string,
  date: string
): Set<string> {
  const out = new Set<string>();
  for (const a of advances) {
    if (a.zone !== zone) continue;
    if (a.supply_date !== date) continue;
    if (a.total_bags <= 0) continue;
    out.add(a.shopkeeper_id);
  }
  return out;
}

/** Shops in a zone that are expecting flour at any point in a date window. */
export function expectedShopIdsInWindow(
  advances: AdvanceRow[],
  zone: string,
  from: string,
  to: string
): Set<string> {
  const out = new Set<string>();
  for (const a of advances) {
    if (a.zone !== zone) continue;
    if (from && a.supply_date < from) continue;
    if (to && a.supply_date > to) continue;
    if (a.total_bags <= 0) continue;
    out.add(a.shopkeeper_id);
  }
  return out;
}

/**
 * Map of every shop in one zone: green where flour is expected on the chosen
 * day, red where it is not. The date picker is the component's own, so any day
 * can be inspected without disturbing the dashboard filters.
 */
export function ZoneShopMap({
  zone,
  shops,
  advances,
  initialDate,
  onClose,
}: {
  zone: string;
  /** Every shop in this zone, including ones that never received a delivery. */
  shops: ZoneShop[];
  /** Unfiltered advances, so the picker can reach any date. */
  advances: AdvanceRow[];
  initialDate?: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate || karachiToday());
  const [only, setOnly] = useState<"all" | "expected" | "not">("all");

  const expected = useMemo(() => expectedShopIds(advances, zone, date), [advances, zone, date]);

  /** Bags expected per shop on this day, summed across every advance. */
  const bags = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of advances) {
      if (a.zone !== zone || a.supply_date !== date) continue;
      m.set(a.shopkeeper_id, (m.get(a.shopkeeper_id) ?? 0) + a.total_bags);
    }
    return m;
  }, [advances, zone, date]);

  // Count only shops that are actually in this zone's list: an advance may
  // reference a shopkeeper who has since been deactivated, and that must not
  // inflate the green total or push the red total negative.
  const expectedHere = shops.filter((s) => expected.has(s.id)).length;
  const notExpectedHere = shops.length - expectedHere;

  const rows = shops
    .filter((s) =>
      only === "all" ? true : only === "expected" ? expected.has(s.id) : !expected.has(s.id)
    )
    .sort((a, b) => {
      const d = Number(expected.has(b.id)) - Number(expected.has(a.id));
      return d !== 0 ? d : (a.shop_name ?? a.full_name).localeCompare(b.shop_name ?? b.full_name);
    });

  const pins: MapPin[] = rows
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      title: s.shop_name ?? s.full_name,
      subtitle: expected.has(s.id)
        ? `Expecting ${(bags.get(s.id) ?? 0).toLocaleString()} bags on ${date}`
        : `No flour expected on ${date}`,
      color: expected.has(s.id) ? GREEN : RED,
    }));

  const noPin = rows.length - pins.length;

  function exportCsv() {
    downloadCsv(`zone_${zone}_shops_${date}.csv`, [
      ["Shop", "Shopkeeper", "Zone", "District", "Address", "Phone",
       "Expecting flour", "Expected bags", "Latitude", "Longitude", "Map link"],
      ...rows.map((s) => [
        s.shop_name ?? "", s.full_name, s.zone ?? "", s.district ?? "",
        s.address ?? "", s.phone ?? "",
        expected.has(s.id) ? "yes" : "no",
        expected.has(s.id) ? (bags.get(s.id) ?? 0) : 0,
        s.latitude ?? "", s.longitude ?? "",
        s.latitude != null && s.longitude != null
          ? "https://www.google.com/maps?q=" + s.latitude + "," + s.longitude
          : "",
      ]),
    ]);
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`Shops in ${zone}`}>
      <div className="mb-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <Field label="Expected flour on">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: GREEN }} />
            Expecting flour <strong>{expectedHere}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: RED }} />
            Not expecting <strong>{notExpectedHere}</strong>
          </span>
          <span className="text-gray-500">of <strong>{shops.length}</strong> shops</span>
        </div>
        <button onClick={exportCsv} className="text-xs font-medium text-emerald-700 hover:underline">
          ⬇ Export CSV
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {([
          ["all", `All (${shops.length})`],
          ["expected", `Expecting flour (${expectedHere})`],
          ["not", `Not expecting (${notExpectedHere})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setOnly(k)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              only === k ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pins.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 py-10 text-center text-sm text-gray-400">
          No shops with coordinates in this view.
        </p>
      ) : (
        <MapView pins={pins} height="h-80" />
      )}
      {noPin > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {noPin} shop{noPin === 1 ? "" : "s"} in this view {noPin === 1 ? "has" : "have"} no
          coordinates on file, so {noPin === 1 ? "it is" : "they are"} listed below but not pinned.
        </p>
      )}

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200">
        <TableWrap>
          <thead><tr>
            <Th>Shop</Th><Th>Shopkeeper</Th><Th>Phone</Th>
            <Th className="text-right">Expected bags</Th><Th>Status</Th>
          </tr></thead>
          <tbody>
            {rows.map((s) => {
              const on = expected.has(s.id);
              return (
                <tr key={s.id} className={on ? undefined : "bg-rose-50/40"}>
                  <Td className="font-medium">
                    {s.latitude != null && s.longitude != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {s.shop_name ?? s.full_name}
                      </a>
                    ) : (
                      s.shop_name ?? s.full_name
                    )}
                    {s.address && <span className="block text-xs text-gray-400">{s.address}</span>}
                  </Td>
                  <Td>{s.full_name}</Td>
                  <Td className="text-gray-500">{s.phone ?? "—"}</Td>
                  <Td className="text-right font-semibold">
                    {on ? (bags.get(s.id) ?? 0).toLocaleString() : "—"}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        on ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
                      )}
                    >
                      {on ? "Expecting flour" : "Not expecting"}
                    </span>
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><Td className="py-6 text-center text-gray-400">No shops in this view.</Td></tr>
            )}
          </tbody>
        </TableWrap>
      </div>
    </Modal>
  );
}
