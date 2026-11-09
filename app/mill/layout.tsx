import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function MillLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["flour_mill"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/mill", label: "Issue Flour" },
          { href: "/mill/advance", label: "Expected Advance" },
          { href: "/mill/history", label: "History" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
