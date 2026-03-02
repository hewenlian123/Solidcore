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
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="linear-card p-8 text-sm text-slate-500">Loading supplier...</div>
      ) : (
        <>
          <div className="linear-card p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.supplier.name}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Contact: {data.supplier.contactName} · Phone: {data.supplier.phone} · Category:{" "}
              {data.supplier.category}
            </p>
          </div>

          <div className="linear-card overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Sales Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Special Status</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Action</TableHead>
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
                    <TableRow key={order.id} className="odd:bg-white even:bg-slate-50/40">
                      <TableCell className="font-semibold text-slate-900">{order.orderNumber}</TableCell>
                      <TableCell>{order.customer.name}</TableCell>
                      <TableCell>{order.projectName ?? "-"}</TableCell>
                      <TableCell>{order.status}</TableCell>
                      <TableCell>{order.specialOrderStatus ?? "-"}</TableCell>
                      <TableCell>
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
