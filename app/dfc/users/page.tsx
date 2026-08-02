"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
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
import { ConfirmDialog } from "@/components/Modal";
import { UserForm, type District, type Zone } from "@/components/UserForm";
import { ImportUsers } from "@/components/ImportUsers";
import { fmtDate } from "@/lib/format";
import { ROLE_LABEL, type Profile } from "@/lib/types";

export default function ManageUsersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [myDistrict, setMyDistrict] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [roleF, setRoleF] = useState("all");
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [toToggle, setToToggle] = useState<Profile | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    const [u, d, z, md] = await Promise.all([
      supabase.from("v_users").select("*").order("created_at", { ascending: false }),
      supabase.from("districts").select("*").order("name"),
      supabase.from("zones").select("*").order("name"),
      supabase.rpc("my_district"),
    ]);
    setUsers((u.data as Profile[]) ?? []);
    setDistricts((d.data as District[]) ?? []);
    setZones((z.data as Zone[]) ?? []);
    setMyDistrict((md.data as string) ?? "");
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive() {
    if (!toToggle) return;
    setToggling(true);
    await supabase.rpc("admin_set_active", { p_id: toToggle.id, p_active: !toToggle.is_active });
    setToggling(false);
    setToToggle(null);
    load();
  }

  const filtered = users.filter((u) => {
    if (!["flour_mill", "shopkeeper", "survey"].includes(u.role)) return false;
    if (roleF !== "all" && u.role !== roleF) return false;
    if (q && !`${u.full_name} ${u.phone ?? ""} ${u.cnic ?? ""} ${u.shop_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Manage Users" subtitle={`Flour mills, shopkeepers and survey persons in ${myDistrict || "your district"}.`}>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>⬆ Import CSV</Button>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ Register New User</Button>
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / phone / CNIC / shop" /></Field>
          <Field label="Role">
            <Select value={roleF} onChange={(e) => setRoleF(e.target.value)}>
              <option value="all">All roles</option>
              <option value="flour_mill">Flour Mill</option>
              <option value="shopkeeper">Shopkeeper</option>
              <option value="survey">Survey Person</option>
            </Select>
          </Field>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState>No users match. Register one to get started.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead><tr>
              <Th>Name</Th><Th>Role</Th><Th>District</Th><Th>Zone</Th>
              <Th>Phone</Th><Th>CNIC</Th><Th>Status</Th><Th>Created</Th><Th></Th>
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
                  <Td>{u.zone ?? "—"}</Td>
                  <Td>{u.phone ?? "—"}</Td>
                  <Td className="text-gray-500">{u.cnic ?? "—"}</Td>
                  <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="gray">Inactive</Badge>}</Td>
                  <Td className="text-gray-500">{fmtDate(u.created_at)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(u); setFormOpen(true); }}
                        className="text-xs font-medium text-emerald-700 hover:underline">Edit</button>
                      <button onClick={() => setToToggle(u)}
                        className="text-xs font-medium text-gray-500 hover:underline">
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {formOpen && (
        <UserForm
          districts={districts}
          zones={zones}
          editing={editing}
          allowedRoles={["flour_mill", "shopkeeper", "survey"]}
          lockedDistrict={myDistrict}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}

      {importOpen && (
        <ImportUsers
          districtLocked={myDistrict}
          zones={zones.filter((z) => districts.find((d) => d.name === myDistrict)?.id === z.district_id)}
          onClose={() => setImportOpen(false)}
          onDone={load}
        />
      )}

      <ConfirmDialog
        open={!!toToggle}
        title={toToggle?.is_active ? "Deactivate user?" : "Reactivate user?"}
        message={
          toToggle?.is_active
            ? `${toToggle?.full_name} will no longer be able to sign in or be issued to. Accounts are deactivated, never deleted.`
            : `${toToggle?.full_name} will be able to sign in again.`
        }
        confirmLabel={toToggle?.is_active ? "Deactivate" : "Reactivate"}
        danger={toToggle?.is_active}
        loading={toggling}
        onConfirm={toggleActive}
        onCancel={() => setToToggle(null)}
      />
    </div>
  );
}
