import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["shopkeeper"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/shop", label: "Incoming" },
          { href: "/shop/history", label: "History" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
