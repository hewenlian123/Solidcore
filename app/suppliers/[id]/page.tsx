"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SupplierDetailPayload = {
  supplier: {
    id: string;
    name: string;
    contactName: string;
    phone: string;
    category: string;
  };
  salesOrders: Array<{
    id: string;
    orderNumber: string;
    projectName: string | null;
    status: string;
    specialOrderStatus: string | null;
    etaDate: string | null;
    customer: { id: string; name: string; phone: string | null };
  }>;
};

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [data, setData] = useState<SupplierDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/suppliers/${id}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load supplier detail");
        setData(payload.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load supplier detail");
      }
    };
    load();
  }, [id, role]);

  return (
    <section className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="glass-card p-8 text-sm text-slate-400">Loading supplier...</div>
      ) : (
        <>
          <div className="glass-card p-8">
            <div className="glass-card-content">
              <h1 className="text-2xl font-semibold tracking-tight text-white">{data.supplier.name}</h1>
              <p className="mt-2 text-sm text-slate-400">
                Contact: {data.supplier.contactName} · Phone: {data.supplier.phone} · Category:{" "}
                {data.supplier.category}
              </p>
            </div>
          </div>

          <div className="glass-card overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 bg-white/5 hover:bg-white/5">
                  <TableHead className="text-slate-300">Sales Order #</TableHead>
                  <TableHead className="text-slate-300">Customer</TableHead>
                  <TableHead className="text-slate-300">Project</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Special Status</TableHead>
                  <TableHead className="text-slate-300">ETA</TableHead>
                  <TableHead className="text-slate-300">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.salesOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No special sales orders linked to this supplier.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.salesOrders.map((order) => (
                    <TableRow key={order.id} className="border-white/5 odd:bg-white/5 even:bg-transparent">
                      <TableCell className="font-semibold text-white">{order.orderNumber}</TableCell>
                      <TableCell className="text-slate-300">{order.customer.name}</TableCell>
                      <TableCell className="text-slate-300">{order.projectName ?? "-"}</TableCell>
                      <TableCell className="text-slate-300">{order.status}</TableCell>
                      <TableCell className="text-slate-300">{order.specialOrderStatus ?? "-"}</TableCell>
                      <TableCell className="text-slate-300">
                        {order.etaDate
                          ? new Date(order.etaDate).toLocaleDateString("en-US", {
                              timeZone: "UTC",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/orders/${order.id}`} className="ios-secondary-btn h-9 px-3 py-2 text-xs">
                          View Order
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
