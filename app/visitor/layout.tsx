import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["visitor"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[{ href: "/visitor", label: "Expected Advances" }]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
