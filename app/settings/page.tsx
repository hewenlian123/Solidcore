"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";

type PingPayload = {
  success: boolean;
  error: string | null;
  data: unknown;
};

type DescriptionTemplateRow = {
  id: string;
  category: string;
  templateJson: string;
  enabled: boolean;
  updatedAt: string;
};

type TemplateValidation = {
  ok: boolean;
  message: string;
};

export default function SettingsPage() {
  const { role } = useRole();
  const [year, setYear] = useState("");
  const [message, setMessage] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [pingResult, setPingResult] = useState<PingPayload | null>(null);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DescriptionTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesMessage, setTemplatesMessage] = useState("");
  const [savingTemplateCategory, setSavingTemplateCategory] = useState<string | null>(null);
  const [templateValidationByCategory, setTemplateValidationByCategory] = useState<
    Record<string, TemplateValidation>
  >({});

  useEffect(() => {
    setYear(String(new Date().getFullYear()));
  }, []);

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesMessage("");
    try {
      const res = await fetch("/api/settings/description-templates", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load templates");
      setTemplates(payload.data ?? []);
    } catch (err) {
      setTemplatesMessage(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const downloadBackup = (format: "json" | "xlsx") => {
    window.open(`/api/backup/export?format=${format}`, "_blank");
  };

  const archiveYear = async () => {
    setMessage("");
    const res = await fetch("/api/archive/yearly", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-role": role },
      body: JSON.stringify({ year: Number(year) }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setMessage(payload.error ?? "Year-end rollover failed");
      return;
    }
    setMessage(`Archived ${payload.data?.archivedCount ?? 0} orders`);
  };

  const checkConnectivity = async () => {
    setIsChecking(true);
    setPingResult(null);
    setPingLatencyMs(null);
    try {
      const start = performance.now();
      const res = await fetch("/api/ping", {
        cache: "no-store",
      });
      const elapsed = Math.round(performance.now() - start);
      const payload = (await res.json()) as PingPayload;
      setPingResult(payload);
      setPingLatencyMs(elapsed);
      setLastCheckedAt(new Date().toLocaleString("en-US", { timeZone: "UTC" }));
    } catch {
      setPingResult({
        success: false,
        error: "Unable to reach /api/ping",
        data: null,
      });
      setLastCheckedAt(new Date().toLocaleString("en-US", { timeZone: "UTC" }));
    } finally {
      setIsChecking(false);
    }
  };

  const updateTemplateLocal = (
    category: string,
    patch: Partial<Pick<DescriptionTemplateRow, "templateJson" | "enabled">>,
  ) => {
    setTemplates((prev) =>
      prev.map((row) => (row.category === category ? { ...row, ...patch } : row)),
    );
  };

  const saveTemplate = async (row: DescriptionTemplateRow) => {
    setSavingTemplateCategory(row.category);
    setTemplatesMessage("");
    try {
      const res = await fetch("/api/settings/description-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
        },
        body: JSON.stringify({
          category: row.category,
          templateJson: row.templateJson,
          enabled: row.enabled,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to save template");
      setTemplatesMessage(`Saved template: ${row.category}`);
      await loadTemplates();
    } catch (err) {
      setTemplatesMessage(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSavingTemplateCategory(null);
    }
  };

  const validateTemplateJson = (category: string, templateJson: string) => {
    try {
      const parsed = JSON.parse(templateJson) as { lines?: unknown; titleStyle?: unknown };
      if (!parsed || typeof parsed !== "object") {
        setTemplateValidationByCategory((prev) => ({
          ...prev,
          [category]: { ok: false, message: "JSON must be an object." },
        }));
        return;
      }
      const lines = parsed.lines;
      if (!Array.isArray(lines)) {
        setTemplateValidationByCategory((prev) => ({
          ...prev,
          [category]: { ok: false, message: "Missing required `lines` array." },
        }));
        return;
      }
      const invalidLineIndex = lines.findIndex((line) => {
        if (!line || typeof line !== "object") return true;
        const row = line as { key?: unknown; format?: unknown; label?: unknown };
        const hasKey = typeof row.key === "string" && row.key.trim().length > 0;
        const hasFormat = typeof row.format === "string" && row.format.trim().length > 0;
        const labelValid = row.label === undefined || typeof row.label === "string";
        return (!hasKey && !hasFormat) || !labelValid;
      });
      if (invalidLineIndex >= 0) {
        setTemplateValidationByCategory((prev) => ({
          ...prev,
          [category]: {
            ok: false,
            message: `Invalid line at index ${invalidLineIndex}. Each line needs key or format.`,
          },
        }));
        return;
      }
      setTemplateValidationByCategory((prev) => ({
        ...prev,
        [category]: {
          ok: true,
          message: `Valid template (${lines.length} line${lines.length === 1 ? "" : "s"}).`,
        },
      }));
    } catch (error) {
      setTemplateValidationByCategory((prev) => ({
        ...prev,
        [category]: {
          ok: false,
          message: error instanceof Error ? error.message : "Invalid JSON.",
        },
      }));
    }
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">System Settings</h1>
        <p className="mt-2 text-sm text-slate-500">Backup and year-end rollover tools.</p>
      </div>

      <div className="linear-card p-8">
        <h2 className="text-base font-semibold text-slate-900">Data Backup Export</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadBackup("json")}
            className="ios-secondary-btn h-12"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => downloadBackup("xlsx")}
            className="ios-primary-btn h-12"
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="linear-card p-8">
        <h2 className="text-base font-semibold text-slate-900">Year-End Rollover</h2>
        <p className="mt-1 text-sm text-slate-500">Archive completed orders before selected year to improve system performance.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ios-input h-12 w-36"
          />
          <button type="button" onClick={archiveYear} className="ios-primary-btn h-12">
            Run Rollover
          </button>
        </div>
        {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
      </div>

      <div className="linear-card p-8">
        <h2 className="text-base font-semibold text-slate-900">System Connectivity Check</h2>
        <p className="mt-1 text-sm text-slate-500">
          Verify Supabase/API connectivity using <code>/api/ping</code>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={checkConnectivity}
            disabled={isChecking}
            className="ios-primary-btn h-12 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? "Checking..." : "Run Connectivity Check"}
          </button>
          {pingResult ? (
            <span
              className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-semibold ${
                pingResult.success
                  ? "bg-emerald-100/80 text-emerald-800"
                  : "bg-rose-100/80 text-rose-800"
              }`}
            >
              {pingResult.success ? "Connected" : "Connection Error"}
            </span>
          ) : null}
        </div>
        {pingLatencyMs !== null ? (
          <p className="mt-2 text-sm text-slate-600">Response time: {pingLatencyMs} ms</p>
        ) : null}
        {pingResult?.error ? (
          <p className="mt-1 text-sm text-rose-700">Error: {pingResult.error}</p>
        ) : null}
        {lastCheckedAt ? (
          <p className="mt-1 text-xs text-slate-500">Last checked (UTC): {lastCheckedAt}</p>
        ) : null}
      </div>

      <div className="linear-card p-8">
        <h2 className="text-base font-semibold text-slate-900">Description Templates</h2>
        <p className="mt-1 text-sm text-slate-500">
          Category-based structured description template JSON. Product name remains clean.
        </p>
        {templatesMessage ? <p className="mt-2 text-sm text-slate-600">{templatesMessage}</p> : null}
        {templatesLoading ? (
          <p className="mt-3 text-sm text-slate-500">Loading templates...</p>
        ) : (
          <div className="mt-4 space-y-4">
            {templates.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{row.category}</p>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(event) =>
                        updateTemplateLocal(row.category, { enabled: event.target.checked })
                      }
                    />
                    Enabled
                  </label>
                </div>
                <textarea
                  value={row.templateJson}
                  onChange={(event) =>
                    updateTemplateLocal(row.category, { templateJson: event.target.value })
                  }
                  className="h-48 w-full rounded-xl border border-slate-100 p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-slate-200"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">
                      Updated: {new Date(row.updatedAt).toLocaleString("en-US", { timeZone: "UTC" })}
                    </p>
                    {templateValidationByCategory[row.category] ? (
                      <p
                        className={`text-xs ${
                          templateValidationByCategory[row.category].ok
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {templateValidationByCategory[row.category].message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => validateTemplateJson(row.category, row.templateJson)}
                      className="ios-secondary-btn h-9 px-3 text-xs"
                    >
                      Validate JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => saveTemplate(row)}
                      disabled={savingTemplateCategory === row.category}
                      className="ios-primary-btn h-9 px-3 text-xs disabled:opacity-60"
                    >
                      {savingTemplateCategory === row.category ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
