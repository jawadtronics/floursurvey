"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { MapPicker } from "@/components/MapPicker";
import { ROLE_LABEL, type Profile, type Role } from "@/lib/types";

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
  const [cnic, setCnic] = useState(editing?.cnic ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [shopName, setShopName] = useState(editing?.shop_name ?? "");
  const [lat, setLat] = useState<number | null>(editing?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(editing?.longitude ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isShop = role === "shopkeeper";
  const isField = role === "flour_mill" || role === "shopkeeper" || role === "survey";
  const needsZone = role === "shopkeeper" || role === "survey";
  const needsDistrict = isField || role === "dfc";

  const effDistrict = lockedDistrict ?? district;
  const zoneOptions = zones.filter(
    (z) => districts.find((d) => d.name === effDistrict)?.id === z.district_id
  );

  function validate(): string | null {
    const isDigits = (s: string) => s.length > 0 && [...s].every((c) => c >= "0" && c <= "9");
    const hasLetter = (s: string) => [...s].some((c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
    const hasDigit = (s: string) => [...s].some((c) => c >= "0" && c <= "9");
    if (fullName.trim().length < 3) return "Full name must be at least 3 characters.";
    if (!isEdit) {
      const at = email.indexOf("@");
      if (at <= 0 || email.indexOf(".", at) < 0 || email.includes(" ")) return "Enter a valid email.";
      if (password.length < 8 || !hasLetter(password) || !hasDigit(password))
        return "Password must be 8+ chars with a letter and a number.";
      if (password !== confirm) return "Passwords do not match.";
    }
    if (needsDistrict && !effDistrict) return "District is required.";
    if (needsZone && !zone) return "Zone is required.";
    if (isField) {
      if (cnic.length !== 13 || !isDigits(cnic)) return "CNIC must be exactly 13 digits.";
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
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    setSaving(true);
    const common = {
      p_district: needsDistrict ? effDistrict : null,
      p_zone: needsZone ? zone : null,
      p_cnic: isField ? cnic : null,
      p_phone: isField ? phone : null,
      p_shop_name: isShop ? shopName.trim() : null,
      p_latitude: isShop ? lat : null,
      p_longitude: isShop ? lng : null,
    };
    if (isEdit) {
      const { error } = await supabase.rpc("admin_update_user", {
        p_id: editing!.id,
        p_full_name: fullName.trim(),
        ...common,
      });
      setSaving(false);
      if (error) { setErr(error.message); return; }
    } else {
      const { error } = await supabase.rpc("admin_create_user", {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_role: role,
        ...common,
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
            <Select value={role} onChange={(e) => { setRole(e.target.value as Role); setZone(""); }}>
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

        {!isEdit && (
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

        {needsDistrict && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="District" required>
              {lockedDistrict ? (
                <Input value={lockedDistrict} disabled />
              ) : (
                <Select value={district} onChange={(e) => { setDistrict(e.target.value); setZone(""); }}>
                  <option value="">Select district…</option>
                  {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Select>
              )}
            </Field>
            {needsZone && (
              <Field label="Zone" required>
                <Select value={zone} onChange={(e) => setZone(e.target.value)} disabled={!effDistrict}>
                  <option value="">Select zone…</option>
                  {zoneOptions.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}

        {isField && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CNIC" required hint="13 digits">
              <Input value={cnic} onChange={(e) => setCnic(onlyDigits(e.target.value).slice(0, 13))} />
            </Field>
            <Field label="Phone" required hint="03XXXXXXXXX">
              <Input value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value).slice(0, 11))} />
            </Field>
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
