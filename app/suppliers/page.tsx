"use client";

import { Factory, Plus, Phone, User } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Supplier = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  category: string;
};

const CATEGORY_BADGE: Record<string, string> = {
  "Profile Supplier": "bg-indigo-100 text-indigo-800",
  "Glass Supplier": "bg-cyan-100 text-cyan-800",
  "Hardware": "bg-amber-100 text-amber-800",
};

export default function SuppliersPage() {
  const { role } = useRole();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    category: "Profile Supplier",
  });

  const load = async () => {
    try {
      const res = await fetch("/api/suppliers", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load suppliers");
      setSuppliers(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suppliers");
    }
  };

  useEffect(() => {
    load();
  }, [role]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Create failed");
      setOpen(false);
      setForm({ name: "", contactName: "", phone: "", category: "Profile Supplier" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <section className="space-y-8">
      <div className="glass-card p-8">
        <div className="glass-card-content flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Supplier Management</h1>
            <p className="mt-2 text-sm text-slate-400">Maintain supplier info and link preferred suppliers to products.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ios-primary-btn inline-flex h-12 items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead>Supplier Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Primary Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500">
                  No suppliers yet
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((item) => (
                <TableRow key={item.id} className="border-white/10 transition-colors hover:bg-white/10">
                  <TableCell className="font-semibold text-white">
                    <Link href={`/suppliers/${item.id}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-slate-300">
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      {item.contactName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-slate-500" />
                      {item.phone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold ${
                        CATEGORY_BADGE[item.category] ?? "bg-white/5 text-slate-300 border border-white/10"
                      }`}
                    >
                      <Factory className="h-3.5 w-3.5" />
                      {item.category}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="glass-card w-full max-w-md p-8">
            <div className="glass-card-content">
            <h3 className="text-base font-semibold text-white">Add Supplier</h3>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <Field label="Supplier Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
              <Field label="Contact" value={form.contactName} onChange={(v) => setForm((p) => ({ ...p, contactName: v }))} />
              <Field label="Contact Phone" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
              <label className="block space-y-1">
                <span className="text-sm text-slate-400">Primary Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="ios-input h-12 w-full"
                >
                  <option>Profile Supplier</option>
                  <option>Glass Supplier</option>
                  <option>Hardware</option>
                </select>
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="ios-secondary-btn h-12 flex-1">
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-12 flex-1">
                  Save
                </button>
              </div>
            </form>
            </div>
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
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ios-input h-12 w-full"
      />
    </label>
  );
}
