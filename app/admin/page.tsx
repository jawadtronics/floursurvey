import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { Analytics } from "@/components/analytics";

export default function AdminHome() {
  return (
    <div>
      <PageHeader
        title="Super Admin"
        subtitle="Whole-system control — people, districts, zones and analytics everywhere."
      />

      <div className="mb-8">
        <Analytics show={["district", "zone", "surveyor"]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard href="/admin/users" emoji="👥" title="Users"
          desc="Create and manage every account, including DFCs and Supervisors." />
        <ActionCard href="/admin/districts" emoji="🗺️" title="Districts & Zones"
          desc="Create and edit districts and the zones inside them." />
        <ActionCard href="/admin/history" emoji="📊" title="History"
          desc="Every issue, survey, reconciliation and not-received record." />
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
