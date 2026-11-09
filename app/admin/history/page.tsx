"use client";

import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { LedgerReport, MissedSurveysReport } from "@/components/reports";

export default function AdminHistory() {
  return (
    <div>
      <PageHeader title="System History" subtitle="Every delivery across all districts and zones." />
      <Tabs
        tabs={[
          { id: "ledger", label: "All Deliveries", content: <LedgerReport canDispute /> },
          { id: "missed", label: "Missed Surveys", content: <MissedSurveysReport /> },
        ]}
      />
    </div>
  );
}
