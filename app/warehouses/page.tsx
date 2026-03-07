"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Warehouse } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WarehouseRow = {
  id: string;
  name: string;
  address: string;
  managerName: string;
};

const initialForm = {
  name: "",
  address: "",
  managerName: "",
};

export default function WarehousesPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    try {
      const res = await fetch("/api/warehouses", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load warehouses");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load warehouses");
    }
  };

  useEffect(() => {
    load();
  }, [role]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/warehouses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
        },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create warehouse");
      setOpen(false);
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create warehouse");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: WarehouseRow) => {
    if (!confirm(`Delete warehouse "${row.name}"?`)) return;
    setError(null);
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/warehouses/${row.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to delete warehouse");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete warehouse");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Warehouse Management</h1>
            <p className="mt-2 text-sm text-slate-500">
              Manage stock locations and create new warehouses directly from this page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ios-primary-btn inline-flex h-12 items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Warehouse
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead>Warehouse</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500">
                  No warehouses yet
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                  <TableCell className="font-semibold text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-slate-500" />
                      {row.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-700">{row.address}</TableCell>
                  <TableCell className="text-slate-700">{row.managerName}</TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={deletingId === row.id}
                      className="ios-secondary-btn h-9 px-3 text-xs text-rose-700 hover:text-rose-800 disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingId === row.id ? "Deleting..." : "Delete"}
                      </span>
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="linear-card w-full max-w-lg p-8">
            <h3 className="text-base font-semibold text-slate-900">Add Warehouse</h3>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <Field
                label="Warehouse Name"
                value={form.name}
                onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
              />
              <Field
                label="Address (optional)"
                value={form.address}
                onChange={(value) => setForm((prev) => ({ ...prev, address: value }))}
              />
              <Field
                label="Manager Name (optional)"
                value={form.managerName}
                onChange={(value) => setForm((prev) => ({ ...prev, managerName: value }))}
              />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="ios-secondary-btn h-12 flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="ios-primary-btn h-12 flex-1 disabled:opacity-60">
                  {saving ? "Saving..." : "Save Warehouse"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="ios-input h-12 w-full" />
    </label>
  );
}
