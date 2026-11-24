export type Role =
  | "super_admin"
  | "supervisor"
  | "dfc"
  | "flour_mill"
  | "shopkeeper"
  | "survey"
  | "visitor";

export type LineStatus = "issued" | "received" | "not_received";

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  dfc: "/dfc",
  supervisor: "/supervisor",
  flour_mill: "/mill",
  shopkeeper: "/login", // shopkeepers have no dashboard — deliveries are auto-received
  survey: "/survey",
  visitor: "/visitor",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  dfc: "District Food Controller",
  supervisor: "Supervisor",
  flour_mill: "Flour Mill",
  shopkeeper: "Shopkeeper",
  survey: "Survey Person",
  visitor: "Visitor",
};

export interface Notice {
  id: string;
  kind: "variance" | "not_received";
  ref_id: string;
  flour_mill_id: string;
  district: string;
  note: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  mill_name: string;
  raised_by_name: string | null;
  shop_name: string | null;
  shopkeeper_name: string | null;
  track_number: string | null;
}

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  district: string | null;
  zone: string | null;
  /** Survey persons may cover several zones. zone is always zones[0]. */
  zones?: string[] | null;
  cnic: string | null;
  phone: string | null;
  shop_name: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  created_by_name?: string | null;
  can_reactivate?: boolean;
  supervision_districts?: string[] | null;
  visitor_any_date?: boolean;
}

export interface EffectiveLine {
  id: string;
  issue_id: string;
  shopkeeper_id: string;
  bags_10: number;
  bags_15: number;
  bags_20: number;
  total_bags: number;
  total_weight_kg: number;
  status: LineStatus;
  received_at: string | null;
  expired_at: string | null;
  surveyed_at: string | null;
  track_number: string;
  issue_date: string;
  vehicle_number: string | null;
  flour_mill_id: string;
  issue_district: string | null;
  mill_name: string;
  shopkeeper_name: string;
  shop_name: string | null;
  shop_zone: string | null;
  shopkeeper_phone: string | null;
  deadline: string;
  effective_status: LineStatus;
  shop_latitude: number | null;
  shop_longitude: number | null;
  issue_photo_url: string | null;
  issue_photo_lat: number | null;
  issue_photo_lng: number | null;
}

export interface PendingShop {
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  pending_deliveries: number;
  pending_since: string;
}

export interface ReconRow {
  survey_id: string;
  surveyed_at: string;
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  district: string | null;
  survey_person_name: string;
  received_bags: number;
  declared_bags: number;
  variance_bags: number;
  abs_variance_bags: number;
  shop_latitude: number | null;
  shop_longitude: number | null;
  survey_photo_url: string | null;
  survey_photo_lat: number | null;
  survey_photo_lng: number | null;
  source: "survey" | "dfc";
}

export interface SurveyRow {
  id: string;
  created_at: string;
  zone: string;
  declared_bags_10: number;
  declared_bags_15: number;
  declared_bags_20: number;
  declared_total_bags: number;
  notes: string | null;
  survey_person_id: string;
  survey_person_name: string;
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  shop_latitude: number | null;
  shop_longitude: number | null;
  survey_photo_url: string | null;
  survey_photo_lat: number | null;
  survey_photo_lng: number | null;
  source: "survey" | "dfc";
}

export interface MissedSurvey {
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  missed_lines: number;
  oldest_issue_date: string;
  missed_bags: number;
  surveyor_name: string | null;
}

export interface LedgerRow {
  line_id: string;
  issued_at: string;
  issue_date: string;
  track_number: string;
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  district: string | null;
  shop_latitude: number | null;
  shop_longitude: number | null;
  mill_name: string;
  flour_mill_id: string;
  survey_person_name: string | null;
  survey_id: string | null;
  survey_source: "survey" | "dfc" | null;
  disp_10: number; disp_15: number; disp_20: number; disp_total: number;
  rec_10: number | null; rec_15: number | null; rec_20: number | null; rec_total: number | null;
  survey_line_count: number | null;
  var_10: number | null; var_15: number | null; var_20: number | null;
  issue_photo_url: string | null; issue_photo_lat: number | null; issue_photo_lng: number | null;
  survey_photo_url: string | null; survey_photo_lat: number | null; survey_photo_lng: number | null;
  status: "surveyed" | "pending" | "missed";
  dispute_kind: "variance" | "not_received";
  dispute_ref: string;
  dispute_status: "open" | "resolved" | null;
}

export interface SurveyorStat {
  survey_person_id: string;
  survey_person_name: string;
  zone: string | null;
  district: string | null;
  /** Delivery lines in this surveyor's zone that needed a visit in the window. */
  assigned_surveys: number;
  /** How many of those were actually surveyed. Always <= assigned_surveys. */
  visited_surveys: number;
  surveys_submitted: number;
}

export interface SurveyorShop {
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  deliveries: number;
  surveyed_deliveries: number;
  issued_bags: number;
  visited: boolean;
  surveys_count: number;
  last_survey_at: string | null;
  declared_bags: number;
}

export interface AdvanceRow {
  advance_id: string;
  supply_date: string;
  district: string | null;
  flour_mill_id: string;
  mill_name: string;
  shopkeeper_id: string;
  shopkeeper_name: string;
  shop_name: string | null;
  zone: string | null;
  phone: string | null;
  shop_address: string | null;
  shop_latitude: number | null;
  shop_longitude: number | null;
  bags_10: number; bags_15: number; bags_20: number; total_bags: number;
  issued_10: number; issued_15: number; issued_20: number; issued_bags: number;
  var_10: number; var_15: number; var_20: number;
}

export interface ProfileNote {
  id: string;
  profile_id: string;
  note: string;
  kind: string;
  created_at: string;
  created_by_name: string | null;
}

export interface MillQuota {
  mill_id: string;
  mill_name: string;
  district: string | null;
  target_date: string;
  regular_quota: number;
  pending_quota: number;
  kpk_quota: number;
  total_quota: number;
  issued_today: number;
  has_quota: boolean;
}

// Variance flagging (Q14): serious if > 5 bags OR > 10% of received.
export function isSeriousVariance(received: number, declared: number): boolean {
  const v = Math.abs(declared - received);
  if (v > 5) return true;
  if (received > 0 && v / received > 0.1) return true;
  return false;
}

/** Every zone a profile covers. Survey persons may have several; others have
 *  at most the single `zone`. Always safe on rows fetched before `zones`
 *  existed, which carry only `zone`. */
export function zoneList(p: { zone: string | null; zones?: string[] | null }): string[] {
  if (p.zones && p.zones.length > 0) return p.zones;
  return p.zone ? [p.zone] : [];
}

/** Comma-joined zone names for tables, exports and headers. */
export function zoneLabel(p: { zone: string | null; zones?: string[] | null }): string {
  const l = zoneList(p);
  return l.length > 0 ? l.join(", ") : "—";
}
