"use client";

import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { Analytics } from "@/components/analytics";
import {
  IssuesReport,
  NotReceivedReport,
  PendingReport,
  ReconciliationReport,
  SurveysReport,
} from "@/components/reports";

export default function SupervisorOverview() {
  return (
    <div>
      <PageHeader
        title="Supervisor Overview"
        subtitle="Read-only oversight across every district and zone."
      />

      <div className="mb-8">
        <Analytics show={["district", "zone", "surveyor"]} />
      </div>

      <h2 className="mb-3 text-lg font-semibold text-gray-900">Detailed reports</h2>
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
