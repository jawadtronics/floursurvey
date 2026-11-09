"use client";

import { PageHeader } from "@/components/ui";
import { AdvancesView } from "@/components/AdvancesView";

export default function SupervisorAdvances() {
  return (
    <div>
      <PageHeader
        title="Expected Advances"
        subtitle="Add shopkeepers, change expected quotas, or remove entries from a mill's advance."
      />
      <AdvancesView canEdit />
    </div>
  );
}
