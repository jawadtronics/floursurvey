"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { AvaloraCredit, Emblem, WheatBackdrop } from "@/components/Brand";

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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-emerald-50 via-gray-50 to-emerald-50/60 p-4">
      <WheatBackdrop />

      <div className="relative flex flex-1 items-center justify-center py-6">
      <Card className="w-full max-w-md p-7 shadow-[0_32px_80px_-12px_rgba(6,46,32,0.26),0_12px_32px_-8px_rgba(6,46,32,0.14)] ring-1 ring-black/5 backdrop-blur-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Emblem size={76} className="mb-3" />
          <h1 className="text-xl font-bold text-gray-900">Flour Distribution Tracking</h1>
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

      {/* Lifts the credit off the wheat so it stays easy to read. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white via-white/80 to-transparent"
        aria-hidden="true"
      />
      <footer className="relative flex justify-center pb-3">
        <AvaloraCredit />
      </footer>
    </div>
  );
}
