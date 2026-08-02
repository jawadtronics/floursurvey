import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function SupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["supervisor"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/supervisor", label: "Overview" },
          { href: "/supervisor/users", label: "Users" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
