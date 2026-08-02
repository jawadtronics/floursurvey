import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["super_admin"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/districts", label: "Districts & Zones" },
          { href: "/admin/history", label: "History" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
