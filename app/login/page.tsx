"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to login.");
      const next = String(searchParams.get("next") ?? "/dashboard");
      // Hard navigation ensures Safari commits the cookie before the next page loads
      window.location.href = next.startsWith("/") ? next : "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-6 py-10">
      <div className="mx-auto mt-20 w-full max-w-md rounded-2xl border border-white/[0.1] bg-white/[0.06] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
        <h1 className="text-xl font-semibold text-white">Sign In</h1>
        <p className="mt-1 text-sm text-slate-400">Use your Solidcore account to continue.</p>
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="ios-input"
              autoComplete="username"
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="ios-input"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <button type="submit" className="ios-primary-btn w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Demo accounts: admin/admin123, sales/sales123, warehouse/warehouse123
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-transparent" />}>
      <LoginPageContent />
    </Suspense>
  );
}
