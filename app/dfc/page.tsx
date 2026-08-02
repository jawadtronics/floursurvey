import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { SummaryStrip } from "@/components/reports";
import { Analytics } from "@/components/analytics";

export default function DfcHome() {
  return (
    <div>
      <PageHeader
        title="District Food Controller"
        subtitle="Your district at a glance — issue flow, zone coverage and surveyor performance."
      />
      <SummaryStrip />

      <div className="mb-6">
        <Analytics show={["zone", "surveyor"]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard href="/dfc/users" emoji="👥" title="Manage Users"
          desc="Register and manage flour mills, shopkeepers and survey persons in your district." />
        <ActionCard href="/dfc/history" emoji="📊" title="View History"
          desc="Issues, not-received, surveys, pending visits and reconciliation — raise notices and export CSV." />
      </div>
    </div>
  );
}

function ActionCard({ href, emoji, title, desc }: { href: string; emoji: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="h-full p-6 transition-shadow hover:shadow-md">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl">{emoji}</div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{desc}</p>
      </Card>
    </Link>
  );
}
