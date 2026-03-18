"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Server, Shield } from "lucide-react";

type HealthPayload = {
  status: string;
  services: Record<string, string>;
  responseTime?: number;
  timestamp?: string;
  error?: string;
};

function StatusBadge({ status }: { status: string }) {
  const ok = status === "connected" || status === "running" || status === "active";
  const warn = status === "error" || status === "missing";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-500/20 text-emerald-400" : warn ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
      }`}
    >
      {ok ? "OK" : warn ? "Failed" : status}
    </span>
  );
}

export default function SystemHealthPage() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      const payload: HealthPayload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Health check failed");
      return payload;
    },
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const services = data?.services ?? {};
  const isOk = data?.status === "ok";

  return (
    <section className="space-y-4 p-4 sm:p-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white">System Health</h1>
        <p className="mt-1 text-sm text-white/60">Service status and connectivity. Auto-refreshes every 30 seconds.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error instanceof Error ? error.message : "Failed to load health"}
        </div>
      )}

      {isLoading && !data ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
          Checking health...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Server className="h-6 w-6 text-white/80" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">Server</p>
                <StatusBadge status={services.server ?? "unknown"} />
              </div>
            </article>
            <article className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Database className="h-6 w-6 text-white/80" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">Database</p>
                <StatusBadge status={services.database ?? "unknown"} />
              </div>
            </article>
            <article className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Activity className="h-6 w-6 text-white/80" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">Prisma</p>
                <StatusBadge status={services.prisma ?? "unknown"} />
              </div>
            </article>
            <article className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Shield className="h-6 w-6 text-white/80" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">Supabase</p>
                <StatusBadge status={services.supabase ?? "unknown"} />
              </div>
            </article>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs text-white/50">Response Time</p>
              <p className="mt-1 text-xl font-semibold text-white/90">
                {data?.responseTime != null ? `${data.responseTime} ms` : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs text-white/50">Last Check</p>
              <p className="mt-1 text-sm font-medium text-white/90">
                {data?.timestamp ? new Date(data.timestamp).toLocaleString() : "—"}
              </p>
              <p className="mt-0.5 text-xs text-white/50">Next refresh in ~30s</p>
            </div>
          </div>

          {!isOk && data?.error && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {data.error}
            </div>
          )}
        </>
      )}
    </section>
  );
}
