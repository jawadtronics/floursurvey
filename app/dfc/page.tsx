import { PageHeader } from "@/components/ui";
import { Dashboard } from "@/components/Dashboard";

export default function DfcHome() {
  return (
    <div>
      <PageHeader
        title="District Food Controller"
        subtitle="Your district at a glance — issue flow, zone coverage and surveyor performance."
      />
      <Dashboard show={["zone", "surveyor"]} />
    </div>
  );
}
