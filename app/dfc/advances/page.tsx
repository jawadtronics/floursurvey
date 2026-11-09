"use client";

import { PageHeader } from "@/components/ui";
import { AdvancesView } from "@/components/AdvancesView";

export default function DfcAdvances() {
  return (
    <div>
      <PageHeader
        title="Expected Advances"
        subtitle="What each mill has declared it will supply, and how much it has actually issued. Only a Supervisor can change these."
      />
      <AdvancesView />
    </div>
  );
}
