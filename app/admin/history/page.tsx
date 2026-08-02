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

export default function AdminHistory() {
  return (
    <div>
      <PageHeader title="System History" subtitle="Full read access across every district and zone." />
      <Tabs
        tabs={[
          { id: "not_received", label: "Not Received", content: <NotReceivedReport /> },
          { id: "reconciliation", label: "Reconciliation", content: <ReconciliationReport /> },
          { id: "issues", label: "All Issues", content: <IssuesReport /> },
          { id: "pending", label: "Pending Surveys", content: <PendingReport /> },
          { id: "surveys", label: "All Surveys", content: <SurveysReport /> },
        ]}
      />
    </div>
  );
}
