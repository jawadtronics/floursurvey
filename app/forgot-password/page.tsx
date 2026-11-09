"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

type Step = "email" | "code" | "password" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    // shouldCreateUser:false => only sends to an existing account
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep("password");
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    const hasLetter = [...pw].some((c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
    const hasDigit = [...pw].some((c) => c >= "0" && c <= "9");
    if (pw.length < 8 || !hasLetter || !hasDigit) {
      setErr("Password must be 8+ characters with a letter and a number.");
      return;
    }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep("done");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-gray-50 to-gray-100 p-4">
      <Card className="w-full max-w-md p-7">
        <div className="mb-6">
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white">
            🔑
          </div>
          <h1 className="text-xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === "email" && "We'll email you a 6-digit verification code."}
            {step === "code" && `Enter the code we sent to ${email}.`}
            {step === "password" && "Choose a new password."}
            {step === "done" && "Your password has been updated."}
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={sendCode} className="space-y-4">
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
            {err && <Alert tone="error">{err}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} className="space-y-4">
            <Field label="Verification code" required hint="6 digits, valid for a few minutes">
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                required
              />
            </Field>
            {err && <Alert tone="error">{err}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Verifying…" : "Verify code"}
            </Button>
            <button
              type="button"
              onClick={() => { setStep("email"); setErr(null); setCode(""); }}
              className="w-full text-center text-sm text-gray-500 hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={setPassword} className="space-y-4">
            <Field label="New password" required hint="8+ chars, letter + number">
              <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </Field>
            <Field label="Confirm new password" required>
              <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            </Field>
            {err && <Alert tone="error">{err}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <Alert tone="success">Password updated. You are signed in.</Alert>
            <Button size="lg" className="w-full" onClick={() => { router.push("/"); router.refresh(); }}>
              Continue to dashboard
            </Button>
          </div>
        )}

        {step !== "done" && (
          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm text-gray-500 hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
