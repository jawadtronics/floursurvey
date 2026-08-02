import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function DfcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["dfc"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/dfc", label: "Home" },
          { href: "/dfc/users", label: "Manage Users" },
          { href: "/dfc/history", label: "View History" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
