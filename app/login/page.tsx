"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

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
    const { data: prof } = await supabase.from("v_users").select("role").maybeSingle();
    if (prof?.role === "shopkeeper") {
      await supabase.auth.signOut();
      setError("Shopkeeper accounts don't have a dashboard — deliveries are auto-received.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-gray-50 to-gray-100 p-4">
      <Card className="w-full max-w-md p-7">
        <div className="mb-6">
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white">
            🌾
          </div>
          <h1 className="text-xl font-bold text-gray-900">Flour Distribution Tracking</h1>
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

        <div className="mt-4 text-center">
          <Link href="/forgot-password" className="text-sm text-emerald-700 hover:underline">
            Forgot password?
          </Link>
        </div>
      </Card>
    </div>
  );
}
