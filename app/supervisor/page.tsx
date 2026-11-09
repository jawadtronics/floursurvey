"use client";

import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { Dashboard } from "@/components/Dashboard";
import { LedgerReport, MissedSurveysReport } from "@/components/reports";

export default function SupervisorOverview() {
  return (
    <div>
      <PageHeader
        title="Supervisor Overview"
        subtitle="Read-only oversight across every district and zone."
      />
      <Dashboard show={["district", "zone", "surveyor"]} />


      <h2 className="mb-3 text-lg font-semibold text-gray-900">Detailed reports</h2>
      <Tabs
        tabs={[
          { id: "ledger", label: "All Deliveries", content: <LedgerReport canDispute /> },
          { id: "missed", label: "Missed Surveys", content: <MissedSurveysReport /> },
        ]}
      />
    </div>
  );
}
