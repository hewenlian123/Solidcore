"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, AlertTriangle, Clock } from "lucide-react";

type MetricsPayload = {
  requests: number;
  errors: number;
  latency: string;
  latencyMs?: number;
  activeUsers: number;
  timestamp?: string;
};

export default function SystemMetricsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/system/metrics", { cache: "no-store" });
      const payload: MetricsPayload = await res.json();
      if (!res.ok) throw new Error("Failed to load metrics");
      return payload;
    },
    refetchInterval: 15 * 1000,
  });

  const requests = data?.requests ?? 0;
  const errors = data?.errors ?? 0;
  const latencyMs = data?.latencyMs ?? 0;
  const activeUsers = data?.activeUsers ?? 0;
  const maxRequests = Math.max(requests, 200);

  return (
    <section className="space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-6 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white">System Metrics</h1>
        <p className="mt-1 text-sm text-white/60">Requests, errors, and latency. Refreshes every 15 seconds.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error instanceof Error ? error.message : "Failed to load metrics"}
        </div>
      )}

      {isLoading && !data ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
          Loading metrics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-white/50">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium">Requests/min</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-white/90">{requests}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-white/50">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Errors/min</span>
              </div>
              <p className={`mt-2 text-2xl font-semibold ${errors > 0 ? "text-rose-400" : "text-white/90"}`}>{errors}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-white/50">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Latency</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-white/90">{data?.latency ?? "—"}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-white/50">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">Active Users</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-white/90">{activeUsers}</p>
            </article>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-white/80">Requests per minute</p>
              <div className="mt-3 h-8 w-full overflow-hidden rounded-lg bg-white/5">
                <div
                  className="h-full rounded-lg bg-emerald-500/60 transition-all duration-500"
                  style={{ width: `${Math.min(100, (requests / maxRequests) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-white/50">{requests} / {maxRequests}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-white/80">Errors per minute</p>
              <div className="mt-3 h-8 w-full overflow-hidden rounded-lg bg-white/5">
                <div
                  className={`h-full rounded-lg transition-all duration-500 ${errors > 0 ? "bg-rose-500/60" : "bg-emerald-500/60"}`}
                  style={{ width: `${Math.min(100, (errors / Math.max(requests, 1)) * 100 * 10)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-white/50">{errors} errors</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium text-white/80">Latency (ms)</p>
              <div className="mt-3 h-8 w-full overflow-hidden rounded-lg bg-white/5">
                <div
                  className="h-full rounded-lg bg-sky-500/60 transition-all duration-500"
                  style={{ width: `${Math.min(100, (latencyMs / 200) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-white/50">{data?.latency ?? "—"} average</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
