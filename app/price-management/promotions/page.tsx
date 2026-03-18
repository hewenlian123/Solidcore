"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";

type PromotionRow = {
  id: string;
  name: string;
  discountType: string;
  value: number;
  applicableCategory: string | null;
  startAt: string;
  endAt: string;
  enabled: boolean;
  status: "active" | "upcoming" | "expired";
};

export default function PromotionsPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED",
    value: "10",
    applicableCategory: "",
    startAt: new Date().toISOString().slice(0, 16),
    endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/price-management/promotions", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load");
      setRows(payload.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filteredRows = statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/price-management/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({
          name: createForm.name.trim(),
          discountType: createForm.discountType,
          value: Number(createForm.value),
          applicableCategory: createForm.applicableCategory.trim() || null,
          startAt: new Date(createForm.startAt).toISOString(),
          endAt: new Date(createForm.endAt).toISOString(),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create");
      setOpenCreate(false);
      setCreateForm({ name: "", discountType: "PERCENT", value: "10", applicableCategory: "", startAt: createForm.startAt, endAt: createForm.endAt });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (id: string, current: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/price-management/promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ enabled: !current }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingId(null);
    }
  };

  const statusLabel = (s: PromotionRow["status"]) => (s === "active" ? "进行中" : s === "upcoming" ? "即将开始" : "已过期");
  const statusClass = (s: PromotionRow["status"]) =>
    s === "active" ? "bg-emerald-500/20 text-emerald-300" : s === "upcoming" ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-400";

  return (
    <section className="space-y-4">
      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Promotions</h1>
            <p className="mt-1 text-sm text-slate-400">Create and manage promotions. Set discount type, value, applicable products/category, and validity.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="ios-primary-btn inline-flex h-10 items-center gap-2 px-4"
          >
            <Plus className="h-4 w-4" />
            New promotion
          </button>
        </div>
      </div>

      {openCreate && (
        <div className="glass-card p-4">
          <form onSubmit={handleCreate} className="glass-card-content space-y-4">
            <h2 className="text-lg font-medium text-white">Create promotion</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Name</label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  className="ios-input h-10 w-full"
                  placeholder="e.g. Spring Sale"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Discount type</label>
                <select
                  value={createForm.discountType}
                  onChange={(e) => setCreateForm((p) => ({ ...p, discountType: e.target.value as "PERCENT" | "FIXED" }))}
                  className="ios-input h-10 w-full"
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Value</label>
                <input
                  required
                  type="number"
                  min={0}
                  step={createForm.discountType === "PERCENT" ? 1 : 0.01}
                  value={createForm.value}
                  onChange={(e) => setCreateForm((p) => ({ ...p, value: e.target.value }))}
                  className="ios-input h-10 w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Applicable category (optional)</label>
                <input
                  value={createForm.applicableCategory}
                  onChange={(e) => setCreateForm((p) => ({ ...p, applicableCategory: e.target.value }))}
                  className="ios-input h-10 w-full"
                  placeholder="e.g. FLOOR"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Start</label>
                <input
                  type="datetime-local"
                  required
                  value={createForm.startAt}
                  onChange={(e) => setCreateForm((p) => ({ ...p, startAt: e.target.value }))}
                  className="ios-input h-10 w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">End</label>
                <input
                  type="datetime-local"
                  required
                  value={createForm.endAt}
                  onChange={(e) => setCreateForm((p) => ({ ...p, endAt: e.target.value }))}
                  className="ios-input h-10 w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="ios-primary-btn h-10 px-4">
                {submitting ? "Creating..." : "Create"}
              </button>
              <button type="button" onClick={() => setOpenCreate(false)} className="ios-secondary-btn h-10 px-4">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">Status:</span>
          {(["ALL", "active", "upcoming", "expired"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === s ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {s === "ALL" ? "All" : statusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      )}

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">Name</TableHead>
              <TableHead className="text-slate-400">Type</TableHead>
              <TableHead className="text-right text-slate-400">Value</TableHead>
              <TableHead className="text-slate-400">Category</TableHead>
              <TableHead className="text-slate-400">Start</TableHead>
              <TableHead className="text-slate-400">End</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeletonRows columns={8} rows={5} />
            ) : filteredRows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                  No promotions found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id} className="border-white/10 text-slate-300">
                  <TableCell className="font-medium text-white">{row.name}</TableCell>
                  <TableCell className="text-slate-400">{row.discountType === "PERCENT" ? "Percentage" : "Fixed"}</TableCell>
                  <TableCell className="text-right text-white">{row.discountType === "PERCENT" ? `${row.value}%` : `$${row.value.toFixed(2)}`}</TableCell>
                  <TableCell className="text-slate-400">{row.applicableCategory ?? "—"}</TableCell>
                  <TableCell className="text-slate-400">{new Date(row.startAt).toLocaleString()}</TableCell>
                  <TableCell className="text-slate-400">{new Date(row.endAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={togglingId === row.id}
                      onClick={() => toggleEnabled(row.id, row.enabled)}
                      className="ios-secondary-btn h-8 px-3 text-xs"
                    >
                      {togglingId === row.id ? "..." : row.enabled ? "Disable" : "Enable"}
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
