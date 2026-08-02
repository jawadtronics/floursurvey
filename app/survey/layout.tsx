import { requireRole } from "@/lib/auth";
import { Nav, Shell } from "@/components/Nav";

export default async function SurveyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(["survey"]);
  return (
    <>
      <Nav
        profile={profile}
        links={[
          { href: "/survey", label: "Pending Shops" },
          { href: "/survey/history", label: "My Surveys" },
        ]}
      />
      <Shell>{children}</Shell>
    </>
  );
}
