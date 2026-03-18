"use client";

import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

type LogEntry = {
  time: string;
  type: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  id?: string;
};

export default function SystemLogsPage() {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["system-logs"],
    queryFn: async () => {
      const res = await fetch("/api/system/logs?limit=50", { cache: "no-store" });
      const payload: LogEntry[] = await res.json();
      if (!res.ok) throw new Error("Failed to load logs");
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 20 * 1000,
  });

  const typeColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "ERROR":
        return "text-rose-400 bg-rose-500/15";
      case "WARN":
        return "text-amber-400 bg-amber-500/15";
      case "DEBUG":
        return "text-white/50 bg-white/10";
      default:
        return "text-emerald-400 bg-emerald-500/15";
    }
  };

  return (
    <section className="space-y-4 p-4 sm:p-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white">System Logs</h1>
        <p className="mt-1 text-sm text-white/60">Recent application logs. Time, type, and message.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error instanceof Error ? error.message : "Failed to load logs"}
        </div>
      )}

      {isLoading && logs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
          Loading logs...
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium text-white/70">Time</th>
                  <th className="px-4 py-3 font-medium text-white/70">Type</th>
                  <th className="px-4 py-3 font-medium text-white/70">Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-white/50">
                      No logs yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, i) => (
                    <tr key={log.id ?? i} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/60">{log.time}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded px-2 py-0.5 font-mono text-xs font-medium ${typeColor(log.type)}`}>
                          {log.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/90">{log.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
