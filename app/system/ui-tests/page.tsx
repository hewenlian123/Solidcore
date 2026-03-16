"use client";

import { useState } from "react";
import { Monitor, CheckCircle, XCircle } from "lucide-react";

type TestResult = { name: string; status: "passed" | "failed"; message?: string };
type Payload = { status: string; tests: TestResult[]; passed?: number; total?: number };

const LABELS: Record<string, string> = {
  login: "Login",
  createOrder: "Create order",
  addProduct: "Add product",
  saveInvoice: "Save invoice",
  uploadFile: "Upload file",
};

export default function UITestsPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/system/ui-tests", { method: "POST", cache: "no-store" });
      const payload: Payload = await res.json();
      if (!res.ok) throw new Error("Failed to run UI tests");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const passed = data?.passed ?? 0;
  const total = data?.total ?? 0;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <section className="space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-6 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-white">UI Tests</h1>
        <p className="mt-1 text-sm text-white/60">Simulated flows: login, create order, add product, save invoice, upload file.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={runTests}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
        >
          <Monitor className="h-4 w-4" />
          {loading ? "Running..." : "Run UI Tests"}
        </button>
        {data && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Score</span>
            <span
              className={`rounded-full px-3 py-1 text-lg font-semibold ${
                score === 100 ? "bg-emerald-500/20 text-emerald-400" : score >= 50 ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
              }`}
            >
              {score}%
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      {data?.tests && data.tests.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium text-white/70">Flow</th>
                <th className="px-4 py-3 font-medium text-white/70">Status</th>
                <th className="px-4 py-3 font-medium text-white/70">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.tests.map((t) => (
                <tr key={t.name} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white/90">{LABELS[t.name] ?? t.name}</td>
                  <td className="px-4 py-3">
                    {t.status === "passed" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle className="h-4 w-4" /> Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-rose-400">
                        <XCircle className="h-4 w-4" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/50">{t.message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!data && !loading && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
          Click &quot;Run UI Tests&quot; to simulate login, order creation, product list, invoice, and file upload flows.
        </div>
      )}
    </section>
  );
}
