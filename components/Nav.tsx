"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/components/ui";
import { ROLE_LABEL, zoneList, type Profile } from "@/lib/types";

export interface NavLink {
  href: string;
  label: string;
}

export function Nav({
  profile,
  links,
}: {
  profile: Pick<Profile, "full_name" | "role" | "district" | "zone"> &
    Pick<Partial<Profile>, "zones">;
  links: NavLink[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // A survey person may cover several zones — show all of them.
  const scope = [profile.district, zoneList(profile).join(", ") || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            🌾
          </span>
          <span className="hidden font-semibold text-gray-900 sm:inline">
            Flour Distribution
          </span>
        </div>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => {
            const active =
              pathname === l.href ||
              (l.href !== "/" && pathname.startsWith(l.href + "/"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-gray-800">
              {profile.full_name}
            </div>
            <div className="text-xs text-gray-500">
              {ROLE_LABEL[profile.role]}
              {scope && ` · ${scope}`}
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
  );
}
