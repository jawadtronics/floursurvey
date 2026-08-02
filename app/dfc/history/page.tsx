"use client";

import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import {
  IssuesReport,
  NotReceivedReport,
  PendingReport,
  ReconciliationReport,
  SurveysReport,
} from "@/components/reports";

export default function DfcHistory() {
  return (
    <div>
      <PageHeader
        title="View History"
        subtitle="Full read access across the district."
      />
      <Tabs
        tabs={[
          { id: "not_received", label: "Not Received", content: <NotReceivedReport notices /> },
          { id: "reconciliation", label: "Reconciliation", content: <ReconciliationReport notices /> },
          { id: "issues", label: "All Issues", content: <IssuesReport /> },
          { id: "pending", label: "Pending Surveys", content: <PendingReport /> },
          { id: "surveys", label: "All Surveys", content: <SurveysReport /> },
        ]}
      />
    </div>
  );
}
