"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
  Td,
  Th,
  TableWrap,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/Modal";
import { Countdown } from "@/components/Countdown";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { EffectiveLine } from "@/lib/types";

export default function ShopIncomingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<EffectiveLine[]>([]);
  const [target, setTarget] = useState<EffectiveLine | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; msg: string } | null>(
    null
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("v_issue_lines_effective")
      .select("*")
      .order("issue_date", { ascending: false });
    setLines((data as EffectiveLine[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmReceived() {
    if (!target) return;
    setSaving(true);
    setBanner(null);
    const { error } = await supabase.rpc("mark_received", { p_line: target.id });
    setSaving(false);
    setTarget(null);
    if (error) {
      setBanner({ tone: "error", msg: error.message });
    } else {
      setBanner({ tone: "success", msg: "Delivery marked as received." });
    }
    load();
  }

  if (loading) return <Spinner />;

  const pendingCount = lines.filter((l) => l.effective_status === "issued").length;

  return (
    <div>
      <PageHeader
        title="Incoming Deliveries"
        subtitle="Acknowledge each delivery the same day it was issued, before midnight (PKT)."
      />

      {banner && (
        <div className="mb-4">
          <Alert tone={banner.tone}>{banner.msg}</Alert>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="mb-4">
          <Alert tone="info">
            You have <strong>{pendingCount}</strong> delivery(ies) awaiting your
            acknowledgement today.
          </Alert>
        </div>
      )}

      {lines.length === 0 ? (
        <EmptyState>No deliveries yet.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Mill</Th>
                <Th>Track No</Th>
                <Th className="text-right">10kg</Th>
                <Th className="text-right">15kg</Th>
                <Th className="text-right">20kg</Th>
                <Th className="text-right">Total Bags</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <Fragment key={l.id}>
                  <tr
                    className={
                      l.effective_status === "not_received" ? "bg-red-50/50" : ""
                    }
                  >
                    <Td>{fmtDate(l.issue_date)}</Td>
                    <Td>{l.mill_name}</Td>
                    <Td className="font-medium">{l.track_number}</Td>
                    <Td className="text-right">{l.bags_10}</Td>
                    <Td className="text-right">{l.bags_15}</Td>
                    <Td className="text-right">{l.bags_20}</Td>
                    <Td className="text-right font-semibold">{l.total_bags}</Td>
                    <Td>
                      <StatusBadge status={l.effective_status} />
                    </Td>
                    <Td>
                      {l.effective_status === "issued" ? (
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => setTarget(l)}>
                            RECEIVED
                          </Button>
                          <Countdown deadline={l.deadline} onExpire={load} />
                        </div>
                      ) : l.effective_status === "received" ? (
                        <span className="text-xs text-gray-500">
                          {fmtDateTime(l.received_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-red-600">deadline passed</span>
                      )}
                    </Td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <ConfirmDialog
        open={!!target}
        title="Confirm receipt"
        message={
          target ? (
            <>
              Confirm you received <strong>{target.total_bags} bags</strong> from{" "}
              <strong>{target.mill_name}</strong> (track {target.track_number})?
              This is final and cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Yes, mark received"
        loading={saving}
        onConfirm={confirmReceived}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
