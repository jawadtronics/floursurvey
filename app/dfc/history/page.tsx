"use client";

import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { LedgerReport, MissedSurveysReport } from "@/components/reports";

export default function DfcHistory() {
  return (
    <div>
      <PageHeader
        title="View History"
        subtitle="Every delivery in your district — dispatched vs surveyed, with disputes."
      />
      <Tabs
        tabs={[
          { id: "ledger", label: "All Deliveries", content: <LedgerReport canDispute /> },
          { id: "missed", label: "Missed Surveys", content: <MissedSurveysReport canFill /> },
        ]}
      />
    </div>
  );
}
