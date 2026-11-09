import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AdvancesView } from "@/components/AdvancesView";

export default async function VisitorPage() {
  const profile = await requireRole(["visitor"]);
  const anyDate = !!profile.visitor_any_date;
  return (
    <div>
      <PageHeader
        title="Expected Advances"
        subtitle={
          anyDate
            ? "Expected advances for your district(s) — pick any date."
            : "Expected advances for your district(s) — today only."
        }
      />
      <AdvancesView visitor canAnyDate={anyDate} />
    </div>
  );
}
