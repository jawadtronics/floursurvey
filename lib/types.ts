export type Role =
  | "super_admin"
  | "supervisor"
  | "dfc"
  | "flour_mill"
  | "shopkeeper"
  | "survey";

export type LineStatus = "issued" | "received" | "not_received";

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  dfc: "/dfc",
  supervisor: "/supervisor",
  flour_mill: "/mill",
  shopkeeper: "/shop",
  survey: "/survey",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  dfc: "District Food Controller",
  supervisor: "Supervisor",
  flour_mill: "Flour Mill",
  shopkeeper: "Shopkeeper",
  survey: "Survey Person",
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
  cnic: string | null;
  phone: string | null;
  shop_name: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  created_by_name?: string | null;
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
}

// Variance flagging (Q14): serious if > 5 bags OR > 10% of received.
export function isSeriousVariance(received: number, declared: number): boolean {
  const v = Math.abs(declared - received);
  if (v > 5) return true;
  if (received > 0 && v / received > 0.1) return true;
  return false;
}
