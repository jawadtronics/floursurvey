"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { SurveyRow } from "@/lib/types";

export default function SurveyHistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SurveyRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_surveys_visible")
        .select("*")
        .order("created_at", { ascending: false });
      setRows((data as SurveyRow[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="My Surveys"
        subtitle="Surveys you personally submitted — for your own record."
      />
      {rows.length === 0 ? (
        <EmptyState>You haven&apos;t submitted any surveys yet.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Shop</Th>
                <Th className="text-right">10kg</Th>
                <Th className="text-right">15kg</Th>
                <Th className="text-right">20kg</Th>
                <Th className="text-right">Total Bags</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{fmtDateTime(r.created_at)}</Td>
                  <Td className="font-medium">
                    {r.shop_name}
                    <span className="block text-xs text-gray-500">
                      {r.shopkeeper_name}
                    </span>
                  </Td>
                  <Td className="text-right">{r.declared_bags_10}</Td>
                  <Td className="text-right">{r.declared_bags_15}</Td>
                  <Td className="text-right">{r.declared_bags_20}</Td>
                  <Td className="text-right font-semibold">{r.declared_total_bags}</Td>
                  <Td className="max-w-xs whitespace-normal text-gray-500">
                    {r.notes ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
