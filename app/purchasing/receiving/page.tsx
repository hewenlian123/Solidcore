"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PurchaseOrderRow = {
  id: string;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedArrival: string | null;
  totalCost: string | number;
  supplier: { id: string; name: string } | null;
};

export default function ReceivingPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/purchase-orders", {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load purchase orders.");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const openRows = useMemo(
    () => rows.filter((row) => String(row.status ?? "").toUpperCase() !== "RECEIVED"),
    [rows],
  );

  return (
    <section className="space-y-6">
      <header className="glass-card p-8">
        <div className="glass-card-content flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Receiving</h1>
            <p className="mt-2 text-sm text-slate-400">Open POs ready to receive into inventory.</p>
          </div>
          <Link href="/purchasing/orders" className="ios-secondary-btn h-10 px-3 text-sm">
            All Purchase Orders
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="glass-card overflow-hidden p-0">
        <div className="glass-card-content overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
                <TableHead className="text-slate-400">PO #</TableHead>
                <TableHead className="text-slate-400">Supplier</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">Order Date</TableHead>
                <TableHead className="text-slate-400">ETA</TableHead>
                <TableHead className="text-right text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="p-6 text-center text-slate-400">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : openRows.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="p-6 text-center text-slate-400">
                    No open purchase orders to receive.
                  </TableCell>
                </TableRow>
              ) : (
                openRows.map((row) => (
                  <TableRow key={row.id} className="border-white/10 text-slate-300 transition-colors hover:bg-white/[0.06]">
                    <TableCell className="font-semibold text-white">{row.poNumber}</TableCell>
                    <TableCell>{row.supplier?.name ?? "-"}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{new Date(row.orderDate).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell>
                      {row.expectedArrival
                        ? new Date(row.expectedArrival).toLocaleDateString("en-US", { timeZone: "UTC" })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/purchasing/orders/${row.id}`} className="ios-primary-btn h-8 px-2 text-xs">
                        Receive
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
