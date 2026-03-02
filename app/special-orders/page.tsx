"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customer: string;
  product: string;
  qty: number;
  supplier: string | null;
  poId: string | null;
  poNumber: string | null;
  eta: string | null;
  orderDate: string;
  daysWaiting: number;
  status: string;
  alert: "DELAYED" | null;
  delayed: boolean;
};

export default function SpecialOrdersPage() {
  const { role } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/special-orders", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to fetch special orders");
        setRows(payload.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch special orders");
      }
    };
    void load();
  }, [role]);

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Special Orders Tracking</h1>
        <p className="mt-2 text-sm text-slate-500">
          Open special-order line items with supplier, PO, ETA, waiting days, and delay alert.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Sales Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>PO #</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Days Waiting</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Alert</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-slate-500">
                  No special orders in progress.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell className="font-semibold text-slate-900">{row.salesOrderNumber}</TableCell>
                  <TableCell>{row.customer}</TableCell>
                  <TableCell>{row.product}</TableCell>
                  <TableCell>{row.qty}</TableCell>
                  <TableCell>{row.supplier || "-"}</TableCell>
                  <TableCell>{row.poNumber || "-"}</TableCell>
                  <TableCell>
                    {row.eta
                      ? new Date(row.eta).toLocaleDateString("en-US", { timeZone: "UTC" })
                      : "-"}
                  </TableCell>
                  <TableCell>{row.daysWaiting}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>
                    {row.delayed ? (
                      <span className="inline-flex rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                        Delayed
                      </span>
                    ) : (
                      <span className="inline-flex rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        On Track
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/orders/${row.salesOrderId}`} className="ios-secondary-btn h-9 px-3 py-2 text-sm">
                      View Order
                    </Link>
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

