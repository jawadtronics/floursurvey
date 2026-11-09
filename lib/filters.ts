import type { AdvanceRow, EffectiveLine, SurveyRow } from "@/lib/types";

/**
 * One filter set shared by every chart on a dashboard. Both the zone/district
 * charts and the Bag Size Breakdown run through the helpers below, so the two
 * can never disagree about what "the current selection" means.
 */
export interface DashFilters {
  from: string;
  to: string;
  district: string;
  zone: string;
  mill: string;
}

export const EMPTY_FILTERS: DashFilters = {
  from: "",
  to: "",
  district: "all",
  zone: "all",
  mill: "all",
};

/** Zone -> district, derived from delivery lines (surveys carry no district). */
export function zoneDistrictMap(lines: EffectiveLine[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of lines) {
    if (l.shop_zone && l.issue_district) m.set(l.shop_zone, l.issue_district);
  }
  return m;
}

export function filterLines(lines: EffectiveLine[], f: DashFilters): EffectiveLine[] {
  return lines.filter((l) => {
    if (f.from && l.issue_date < f.from) return false;
    if (f.to && l.issue_date > f.to) return false;
    if (f.district !== "all" && l.issue_district !== f.district) return false;
    if (f.zone !== "all" && l.shop_zone !== f.zone) return false;
    if (f.mill !== "all" && l.mill_name !== f.mill) return false;
    return true;
  });
}

export function filterSurveys(
  surveys: SurveyRow[],
  f: DashFilters,
  zoneDistrict: Map<string, string>,
  /** Shops served by the selected mill in this window. A survey has no mill of
   *  its own, so when a mill is picked we scope surveys to the shops it served
   *  rather than blanking the series out. */
  millShopIds?: Set<string>
): SurveyRow[] {
  return surveys.filter((s) => {
    const d = s.created_at.slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.district !== "all" && zoneDistrict.get(s.zone) !== f.district) return false;
    if (f.zone !== "all" && s.zone !== f.zone) return false;
    if (f.mill !== "all" && millShopIds && !millShopIds.has(s.shopkeeper_id)) return false;
    return true;
  });
}

export function filterAdvances(advances: AdvanceRow[], f: DashFilters): AdvanceRow[] {
  return advances.filter((a) => {
    if (f.from && a.supply_date < f.from) return false;
    if (f.to && a.supply_date > f.to) return false;
    if (f.district !== "all" && a.district !== f.district) return false;
    if (f.zone !== "all" && a.zone !== f.zone) return false;
    if (f.mill !== "all" && a.mill_name !== f.mill) return false;
    return true;
  });
}

/** Human-readable summary of the active window, shown under the filter bar. */
export function describeFilters(f: DashFilters): string {
  const parts: string[] = [];
  parts.push(f.from || f.to ? `${f.from || "start"} → ${f.to || "today"}` : "all dates");
  if (f.district !== "all") parts.push(f.district);
  if (f.zone !== "all") parts.push(f.zone);
  if (f.mill !== "all") parts.push(f.mill);
  return parts.join(" · ");
}
