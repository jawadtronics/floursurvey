"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { UserForm, type District, type Zone } from "@/components/UserForm";
import { downloadCsv, fmtDate } from "@/lib/format";
import { ROLE_LABEL, zoneLabel, zoneList, type Profile } from "@/lib/types";

export default function SupervisorUsers() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleF, setRoleF] = useState("all");
  const [zoneF, setZoneF] = useState("all");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [u, d, z] = await Promise.all([
      supabase.from("v_users").select("*").order("role").order("full_name"),
      supabase.from("districts").select("*").order("name"),
      supabase.from("zones").select("*").order("name"),
    ]);
    setUsers((u.data as Profile[]) ?? []);
    setDistricts((d.data as District[]) ?? []);
    setZones((z.data as Zone[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // The supervisor's own row is the only supervisor visible to them.
  const canReactivate = users.find((u) => u.role === "supervisor")?.can_reactivate ?? false;
  const myScope = users.find((u) => u.role === "supervisor")?.supervision_districts ?? [];

  async function reactivate(u: Profile) {
    setBusyId(u.id);
    setBanner(null);
    const { error } = await supabase.rpc("admin_set_active", { p_id: u.id, p_active: true });
    setBusyId(null);
    if (error) setBanner(error.message);
    else load();
  }

  const filtered = users.filter((u) => {
    if (roleF !== "all" && u.role !== roleF) return false;
    if (zoneF !== "all" && !zoneList(u).includes(zoneF)) return false;
    if (q && !`${u.full_name} ${u.phone ?? ""} ${u.shop_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  function exportUsers() {
    const maps = (u: Profile) =>
      u.latitude != null && u.longitude != null
        ? "https://www.google.com/maps?q=" + u.latitude + "," + u.longitude
        : "";
    downloadCsv("users_" + new Date().toISOString().slice(0, 10) + ".csv", [
      ["Name", "Role", "District", "Zone", "Licence / CNIC", "Phone", "Shop name",
       "Address", "Latitude", "Longitude", "Map link", "Status", "Created", "Created by"],
      ...filtered.map((u) => [
        u.full_name, ROLE_LABEL[u.role], u.district ?? "", zoneList(u).join(" | "), u.cnic ?? "",
        u.phone ?? "", u.shop_name ?? "", u.address ?? "",
        u.latitude ?? "", u.longitude ?? "", maps(u),
        u.is_active ? "Active" : "Inactive", fmtDate(u.created_at), u.created_by_name ?? "",
      ]),
    ]);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={
          canReactivate
            ? `You can re-activate deactivated users in ${myScope.join(", ") || "your districts"}.`
            : "Read-only directory of users in your districts."
        }
      >
        <Button variant="secondary" onClick={exportUsers}>⬇ Export CSV</Button>
      </PageHeader>
      {banner && <div className="mb-4"><Alert tone="error">{banner}</Alert></div>}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / phone / shop" /></Field>
          <Field label="Role">
            <Select value={roleF} onChange={(e) => setRoleF(e.target.value)}>
              <option value="all">All roles</option>
              <option value="dfc">DFC</option>
              <option value="flour_mill">Flour Mill</option>
              <option value="shopkeeper">Shopkeeper</option>
              <option value="survey">Survey Person</option>
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={zoneF} onChange={(e) => setZoneF(e.target.value)}>
              <option value="all">All zones</option>
              {Array.from(new Set(users.flatMap((u) => zoneList(u)))).sort().map((z) => (
                <option key={z as string}>{z}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      {filtered.length === 0 ? (
        <EmptyState>No users match.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Name</Th><Th>Role</Th><Th>District</Th><Th>Zone</Th>
              <Th>Phone</Th><Th>Status</Th><Th>Created</Th><Th></Th>
            </tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium">
                    {u.full_name}
                    {u.shop_name && <span className="block text-xs text-gray-400">{u.shop_name}</span>}
                  </Td>
                  <Td>{ROLE_LABEL[u.role]}</Td>
                  <Td>{u.district ?? "—"}</Td>
                  <Td>{zoneLabel(u)}</Td>
                  <Td>{u.phone ?? "—"}</Td>
                  <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="gray">Inactive</Badge>}</Td>
                  <Td className="text-gray-500">{fmtDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      {["flour_mill", "shopkeeper", "survey"].includes(u.role) && (
                        <button
                          onClick={() => setEditing(u)}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                      {canReactivate && !u.is_active && u.role !== "supervisor" && u.role !== "super_admin" && (
                        <button
                          onClick={() => reactivate(u)}
                          disabled={busyId === u.id}
                          className="text-xs font-medium text-gray-500 hover:underline disabled:opacity-50"
                        >
                          {busyId === u.id ? "…" : "Re-activate"}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {editing && (
        <UserForm
          districts={districts}
          zones={zones}
          editing={editing}
          allowedRoles={["flour_mill", "shopkeeper", "survey"]}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
