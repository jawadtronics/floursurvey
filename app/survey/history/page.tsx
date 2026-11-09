"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import {
  Card,
  EmptyState,
  PageHeader,
  PhotoThumb,
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
      const all = await fetchAll<SurveyRow>(supabase, "v_surveys_visible", ["id"]);
      all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      setRows(all);
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
                <Th>Photo</Th>
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
                  <Td><PhotoThumb url={r.survey_photo_url} lat={r.survey_photo_lat} lng={r.survey_photo_lng} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
