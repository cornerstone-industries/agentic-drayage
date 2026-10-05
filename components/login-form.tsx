"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
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
    // A full navigation hands the new session cookie straight to the server render; the soft
    // push + refresh pair could stall behind the old router state.
    window.location.assign(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
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
          className="mt-1.5 w-full rounded-[12px] border border-rule bg-sheet px-4 py-3 text-[15px] text-fg outline-none transition-colors placeholder:text-dim focus:border-stamp"
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
          className="mt-1.5 w-full rounded-[12px] border border-rule bg-sheet px-4 py-3 text-[15px] text-fg outline-none transition-colors focus:border-stamp"
        />
      </label>
      {error && <p className="rounded-[12px] border border-red/30 bg-red/5 px-3 py-2 text-[14px] text-red">{error}</p>}
      <button type="submit" className="btn-sodium w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-[12.5px] leading-relaxed text-muted">The hackathon judge login is closed.</p>
    </form>
  );
}
