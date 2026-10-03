"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const JUDGE = { email: "judge@portcall.dev", password: "portcall-judge-2026" };

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="tick-label">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-[3px] border border-line bg-panel px-3 py-2.5 font-mono text-sm text-fg outline-none transition-colors placeholder:text-dim focus:border-sodium"
          placeholder="you@company.com"
        />
      </label>
      <label className="block">
        <span className="tick-label">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-[3px] border border-line bg-panel px-3 py-2.5 font-mono text-sm text-fg outline-none transition-colors focus:border-sodium"
        />
      </label>
      {error && <p className="rounded-[3px] border border-alarm/40 bg-alarm/10 px-3 py-2 font-mono text-xs text-alarm">{error}</p>}
      <button type="submit" className="btn-sodium w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => {
          setEmail(JUDGE.email);
          setPassword(JUDGE.password);
        }}
      >
        Fill judge login
      </button>
      <p className="font-mono text-[11px] leading-5 text-muted">
        {JUDGE.email}
        <br />
        {JUDGE.password}
      </p>
    </form>
  );
}
