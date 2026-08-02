"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Badge,
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
import { fmtDate } from "@/lib/format";
import { ROLE_LABEL, type Profile } from "@/lib/types";

export default function SupervisorUsers() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleF, setRoleF] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_users")
        .select("*")
        .order("role")
        .order("full_name");
      setUsers((data as Profile[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = users.filter((u) => {
    if (roleF !== "all" && u.role !== roleF) return false;
    if (q && !`${u.full_name} ${u.phone ?? ""} ${u.shop_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Users" subtitle="Read-only directory of everyone in the system." />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / phone / shop" /></Field>
          <Field label="Role">
            <Select value={roleF} onChange={(e) => setRoleF(e.target.value)}>
              <option value="all">All roles</option>
              <option value="dfc">DFC</option>
              <option value="supervisor">Supervisor</option>
              <option value="flour_mill">Flour Mill</option>
              <option value="shopkeeper">Shopkeeper</option>
              <option value="survey">Survey Person</option>
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
              <Th>Phone</Th><Th>Status</Th><Th>Created</Th>
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
                  <Td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="gray">Inactive</Badge>}</Td>
                  <Td className="text-gray-500">{fmtDate(u.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
