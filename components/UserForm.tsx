"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { MapPicker } from "@/components/MapPicker";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, zoneList, type Profile, type ProfileNote, type Role } from "@/lib/types";

/** Zone / district transfer history for a survey person. */
function TransferNotes({ profileId }: { profileId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<ProfileNote[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_profile_notes")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
      setNotes((data as ProfileNote[]) ?? []);
    })();
  }, [supabase, profileId]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 text-sm font-medium text-gray-800">Transfer history</div>
      {notes === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400">No transfers recorded yet.</p>
      ) : (
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="rounded bg-white px-3 py-2 text-xs">
              <div className="text-gray-800">{n.note}</div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {fmtDateTime(n.created_at)}
                {n.created_by_name && ` · by ${n.created_by_name}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface Zone {
  id: string;
  district_id: string;
  name: string;
}
export interface District {
  id: string;
  name: string;
}

const onlyDigits = (s: string) => [...s].filter((c) => c >= "0" && c <= "9").join("");

export function UserForm({
  districts,
  zones,
  editing,
  allowedRoles,
  lockedDistrict,
  onClose,
  onSaved,
}: {
  districts: District[];
  zones: Zone[];
  editing: Profile | null;
  allowedRoles: Role[];
  lockedDistrict?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = !!editing;

  const [role, setRole] = useState<Role>(editing?.role ?? allowedRoles[0]);
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [district, setDistrict] = useState(editing?.district ?? lockedDistrict ?? "");
  const [zone, setZone] = useState(editing?.zone ?? "");
  // A survey person may cover several zones; shopkeepers still have exactly one.
  const [zonesSel, setZonesSel] = useState<string[]>(
    editing && editing.role === "survey" ? zoneList(editing) : []
  );
  const [cnic, setCnic] = useState(editing?.cnic ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [shopName, setShopName] = useState(editing?.shop_name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [lat, setLat] = useState<number | null>(editing?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(editing?.longitude ?? null);
  const [canReactivate, setCanReactivate] = useState<boolean>(editing?.can_reactivate ?? false);
  const [supDistricts, setSupDistricts] = useState<string[]>(editing?.supervision_districts ?? []);
  const [visitorAnyDate, setVisitorAnyDate] = useState<boolean>(editing?.visitor_any_date ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isShop = role === "shopkeeper";
  const isSupervisor = role === "supervisor";
  const isVisitor = role === "visitor";
  // Shopkeepers have no dashboard, so they get no sign-in credentials.
  const needsLogin = !isShop;
  const isField = role === "flour_mill" || role === "shopkeeper" || role === "survey";
  const isSurvey = role === "survey";
  const needsZone = role === "shopkeeper" || role === "survey";
  const needsDistrict = isField || role === "dfc";
  // A DFC-created visitor is locked to the DFC's district; a super-admin visitor picks many.
  const visitorDistricts = isVisitor ? (lockedDistrict ? [lockedDistrict] : supDistricts) : [];

  const effDistrict = lockedDistrict ?? district;
  const zoneOptions = zones.filter(
    (z) => districts.find((d) => d.name === effDistrict)?.id === z.district_id
  );

  function validate(): string | null {
    const isDigits = (s: string) => s.length > 0 && [...s].every((c) => c >= "0" && c <= "9");
    const hasLetter = (s: string) => [...s].some((c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
    const hasDigit = (s: string) => [...s].some((c) => c >= "0" && c <= "9");
    if (fullName.trim().length < 3) return "Full name must be at least 3 characters.";
    if (!isEdit && needsLogin) {
      const at = email.indexOf("@");
      if (at <= 0 || email.indexOf(".", at) < 0 || email.includes(" ")) return "Enter a valid email.";
      if (password.length < 8 || !hasLetter(password) || !hasDigit(password))
        return "Password must be 8+ chars with a letter and a number.";
      if (password !== confirm) return "Passwords do not match.";
    }
    if (needsDistrict && !effDistrict) return "District is required.";
    if (isSurvey && zonesSel.length === 0) return "Select at least one zone for the survey person.";
    if (needsZone && !isSurvey && !zone) return "Zone is required.";
    if (isField) {
      if (isShop) {
        // Licence numbers are alphanumeric and vary in length.
        if (cnic.trim().length < 3) return "Licence number must be at least 3 characters.";
      } else if (cnic.length !== 13 || !isDigits(cnic)) {
        return "CNIC must be exactly 13 digits.";
      }
      if (phone.length !== 11 || !phone.startsWith("03") || !isDigits(phone))
        return "Phone must be a valid PK mobile (03XXXXXXXXX).";
    }
    if (isShop) {
      if (!shopName.trim()) return "Shop name is required.";
      if (lat == null || lng == null) return "Set the shop location on the map.";
      if (lat === 0 && lng === 0) return "Coordinates (0,0) are not valid.";
      if (lat < 23.6 || lat > 37.1 || lng < 60.9 || lng > 77.8)
        return "Coordinates look outside Pakistan — check the pin.";
    }
    if (isSupervisor && supDistricts.length === 0)
      return "Select at least one supervision district.";
    if (isVisitor && visitorDistricts.length === 0)
      return "Select at least one district for the visitor.";
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    setSaving(true);
    const common = {
      p_district: needsDistrict ? effDistrict : null,
      // p_zone stays the first zone so the single-zone callers and columns
      // elsewhere keep working; p_zones carries the full list.
      p_zone: isSurvey ? (zonesSel[0] ?? null) : needsZone ? zone : null,
      p_cnic: isField ? cnic : null,
      p_phone: isField ? phone : null,
      p_shop_name: isShop ? shopName.trim() : null,
      p_latitude: isShop ? lat : null,
      p_longitude: isShop ? lng : null,
      p_address: isShop ? (address.trim() || null) : null,
      p_can_reactivate: isSupervisor ? canReactivate : false,
      p_supervision_districts: isSupervisor ? supDistricts : isVisitor ? visitorDistricts : null,
    };
    // Only visitors carry this newer param, so create/edit of every other role
    // still matches the existing DB function signature.
    const visitorExtra = isVisitor ? { p_visitor_any_date: visitorAnyDate } : {};
    // Likewise, only survey persons send the newer zone-list param.
    const surveyExtra = isSurvey ? { p_zones: zonesSel } : {};
    if (isEdit) {
      const { error } = await supabase.rpc("admin_update_user", {
        p_id: editing!.id,
        p_full_name: fullName.trim(),
        ...common,
        ...visitorExtra,
        ...surveyExtra,
      });
      setSaving(false);
      if (error) { setErr(error.message); return; }
    } else {
      const { error } = await supabase.rpc("admin_create_user", {
        p_email: needsLogin ? email.trim().toLowerCase() : null,
        p_password: needsLogin ? password : null,
        p_full_name: fullName.trim(),
        p_role: role,
        ...common,
        ...visitorExtra,
        ...surveyExtra,
      });
      setSaving(false);
      if (error) { setErr(error.message); return; }
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} size="lg" title={isEdit ? `Edit ${editing?.full_name}` : "Register New User"}>
      <div className="space-y-4">
        {!isEdit && (
          <Field label="Role" required>
            <Select value={role} onChange={(e) => { setRole(e.target.value as Role); setZone(""); setZonesSel([]); }}>
              {allowedRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          {isShop && (
            <Field label="Shop Name" required>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
            </Field>
          )}
        </div>

        {!isEdit && needsLogin && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" required hint="8+ chars, letter + number">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm Password" required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
        )}

        {!isEdit && isShop && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Shopkeepers don&apos;t sign in — deliveries are auto-received — so no email or password is needed.
          </div>
        )}

        {needsDistrict && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="District" required>
              {lockedDistrict ? (
                <Input value={lockedDistrict} disabled />
              ) : (
                <Select value={district} onChange={(e) => { setDistrict(e.target.value); setZone(""); setZonesSel([]); }}>
                  <option value="">Select district…</option>
                  {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Select>
              )}
            </Field>
            {needsZone && !isSurvey && (
              <Field label="Zone" required>
                <Select value={zone} onChange={(e) => setZone(e.target.value)} disabled={!effDistrict}>
                  <option value="">Select zone…</option>
                  {zoneOptions.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}

        {isSurvey && (
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Zones <span className="text-red-500">*</span>
            </span>
            {!effDistrict ? (
              <p className="text-sm text-gray-400">Pick a district first.</p>
            ) : zoneOptions.length === 0 ? (
              <p className="text-sm text-gray-400">No zones in {effDistrict} yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {zoneOptions.map((z) => {
                  const on = zonesSel.includes(z.name);
                  return (
                    <label
                      key={z.id}
                      className={
                        "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm " +
                        (on
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : "border-gray-300 bg-white text-gray-700")
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={on}
                        onChange={(e) =>
                          setZonesSel((prev) =>
                            e.target.checked ? [...prev, z.name] : prev.filter((x) => x !== z.name)
                          )
                        }
                      />
                      {z.name}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              A survey person can cover several zones. They will see pending surveys, and be able
              to submit them, for every shop in {zonesSel.length > 1 ? "all of these zones" : "the selected zone"}.
            </p>
          </div>
        )}

        {isField && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={isShop ? "Licence Number" : "CNIC"}
              required
              hint={isShop ? "Letters and numbers, any length" : "13 digits"}
            >
              <Input
                value={cnic}
                onChange={(e) =>
                  setCnic(isShop ? e.target.value.trimStart() : onlyDigits(e.target.value).slice(0, 13))
                }
              />
            </Field>
            <Field label="Phone" required hint="03XXXXXXXXX">
              <Input value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))} />
            </Field>
          </div>
        )}

        {isShop && (
          <Field label="Address" hint="Street / area of the shop">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Shop 12, Main Boulevard, Model Town" />
          </Field>
        )}

        {isSupervisor && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={canReactivate}
                onChange={(e) => setCanReactivate(e.target.checked)}
              />
              Allow Re-Activation
            </label>
            <p className="-mt-1 pl-6 text-xs text-gray-500">
              Lets this supervisor re-activate users a DFC has deactivated (within their districts).
            </p>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Supervision Districts <span className="text-red-500">*</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {districts.map((d) => {
                  const on = supDistricts.includes(d.name);
                  return (
                    <label
                      key={d.id}
                      className={
                        "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm " +
                        (on ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white text-gray-700")
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={on}
                        onChange={(e) =>
                          setSupDistricts((prev) =>
                            e.target.checked ? [...prev, d.name] : prev.filter((x) => x !== d.name)
                          )
                        }
                      />
                      {d.name}
                    </label>
                  );
                })}
                {districts.length === 0 && <span className="text-sm text-gray-400">No districts yet.</span>}
              </div>
            </div>
          </div>
        )}

        {isVisitor && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">
                District access <span className="text-red-500">*</span>
              </span>
              {lockedDistrict ? (
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  {lockedDistrict}
                  <span className="ml-2 text-xs text-gray-400">(your district)</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {districts.map((d) => {
                    const on = supDistricts.includes(d.name);
                    return (
                      <label
                        key={d.id}
                        className={
                          "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm " +
                          (on ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 bg-white text-gray-700")
                        }
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={on}
                          onChange={(e) =>
                            setSupDistricts((prev) =>
                              e.target.checked ? [...prev, d.name] : prev.filter((x) => x !== d.name)
                            )
                          }
                        />
                        {d.name}
                      </label>
                    );
                  })}
                  {districts.length === 0 && <span className="text-sm text-gray-400">No districts yet.</span>}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                The visitor can only see Expected Advances for {lockedDistrict ? "this district" : "the chosen districts"}.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={visitorAnyDate}
                onChange={(e) => setVisitorAnyDate(e.target.checked)}
              />
              Can view any date
            </label>
            <p className="-mt-1 pl-6 text-xs text-gray-500">
              When on, the visitor gets a date filter. When off, they only see the current day&apos;s advances.
            </p>
          </div>
        )}

        {isShop && (
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Shop Location <span className="text-red-500">*</span>
            </span>
            <MapPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input type="number" step="any" value={lat ?? ""}
                  onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={lng ?? ""}
                  onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
            </div>
          </div>
        )}

        {isEdit && editing?.role === "survey" && <TransferNotes profileId={editing.id} />}

        {err && <Alert tone="error">{err}</Alert>}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Register user"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
