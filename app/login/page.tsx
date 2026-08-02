"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

const DEMO = [
  { role: "Super Admin", email: "superadmin@flour.pk" },
  { role: "Supervisor", email: "supervisor@flour.pk" },
  { role: "DFC — Lahore", email: "dfc@flour.pk" },
  { role: "DFC — Faisalabad", email: "dfc2@flour.pk" },
  { role: "Flour Mill — Lahore", email: "mill1@flour.pk" },
  { role: "Flour Mill — Faisalabad", email: "mill2@flour.pk" },
  { role: "Shopkeeper — Model Town", email: "shop1@flour.pk" },
  { role: "Shopkeeper — Gulberg", email: "shop2@flour.pk" },
  { role: "Shopkeeper — Jaranwala", email: "shop3@flour.pk" },
  { role: "Shopkeeper — Model Town", email: "shop4@flour.pk" },
  { role: "Survey — Model Town", email: "survey1@flour.pk" },
  { role: "Survey — Jaranwala", email: "survey2@flour.pk" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  function quickFill(e: string) {
    setEmail(e);
    setPassword("Password123");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-gray-50 to-gray-100 p-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        {/* Sign-in card */}
        <Card className="p-7">
          <div className="mb-6">
            <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white">
              🌾
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Flour Distribution Tracking
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Mill issue · shopkeeper receipt · blind field survey.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@flour.pk"
                required
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        {/* Demo accounts */}
        <Card className="p-7">
          <h2 className="font-semibold text-gray-900">Demo accounts</h2>
          <p className="mt-1 text-sm text-gray-500">
            Password for every account is{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-emerald-700">
              Password123
            </code>
            . Tap one to fill the form.
          </p>
          <div className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => quickFill(d.email)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span className="font-medium text-gray-700">{d.role}</span>
                <span className="text-gray-500">{d.email}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
