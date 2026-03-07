"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Scan } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScanModal } from "@/components/scanner/scan-modal";

type OutboundOrder = {
  id: string;
  orderNo: string;
  createdAt: string;
  status: "PENDING_PRODUCTION" | "IN_PRODUCTION" | "READY_DELIVERY" | "SETTLED";
  customer: { name: string };
  items: Array<{
    id: string;
    product: { id: string; name: string; barcode?: string | null };
    lengthMm: number | null;
    widthMm: number | null;
    quantity: string;
  }>;
};

type SalesOutboundRow = {
  id: string;
  salesOrderId: string;
  type: "PICKUP" | "DELIVERY";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  scheduledDate: string;
  salesOrder: {
    id: string;
    orderNumber: string;
    customer: { name: string };
  };
};

export default function OutboundPage() {
  const { role } = useRole();
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [salesQueue, setSalesQueue] = useState<SalesOutboundRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [loadedItemIds, setLoadedItemIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [res, salesRes] = await Promise.all([
          fetch("/api/orders", {
            cache: "no-store",
            headers: { "x-user-role": role },
          }),
          fetch("/api/outbound/sales-orders", {
            cache: "no-store",
            headers: { "x-user-role": role },
          }),
        ]);
        const payload = await res.json();
        const salesPayload = await salesRes.json();
        if (!res.ok) throw new Error(payload.error ?? "Load failed");
        if (!salesRes.ok) throw new Error(salesPayload.error ?? "Load failed");
        const filtered = (payload.data ?? []).filter((order: OutboundOrder) =>
          ["IN_PRODUCTION", "READY_DELIVERY"].includes(order.status),
        );
        setOrders(filtered);
        setSalesQueue(salesPayload.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Load failed");
      }
    };
    fetchData();
  }, [role]);

  const itemIndex = useMemo(() => {
    const list: Array<{ id: string; key: string }> = [];
    for (const order of orders) {
      for (const item of order.items) {
        list.push({ id: item.id, key: item.product.id.toLowerCase() });
        if (item.product.barcode) list.push({ id: item.id, key: item.product.barcode.toLowerCase() });
        list.push({ id: item.id, key: item.product.name.toLowerCase() });
      }
    }
    return list;
  }, [orders]);

  const onScanDetected = (decoded: string) => {
    const key = decoded.trim().toLowerCase();
    const hit = itemIndex.find((item) => item.key === key || item.key.includes(key));
    if (!hit) {
      setError(`No matching outbound product found: ${decoded}`);
      return;
    }
    setScanOpen(false);
    setLoadedItemIds((prev) => (prev.includes(hit.id) ? prev : [...prev, hit.id]));
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Outbound Queue</h1>
            <p className="mt-2 text-sm text-slate-500">Warehouse-only view for in-production and pending-delivery orders.</p>
          </div>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="ios-primary-btn inline-flex h-12 items-center justify-center gap-2"
          >
            <Scan className="h-4 w-4" />
            Scan & Load
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
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Spec Confirmed</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500">
                  No outbound orders available
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const item = order.items[0];
                return (
                  <TableRow key={order.id} className="border-white/10 transition-colors hover:bg-white/10">
                    <TableCell className="font-semibold text-slate-900">{order.orderNo}</TableCell>
                    <TableCell>{order.customer?.name ?? "-"}</TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {item?.lengthMm && item?.widthMm
                        ? `${item.lengthMm}x${item.widthMm}mm`
                        : "Spec Confirmed"}
                    </TableCell>
                    <TableCell>
                      {item?.quantity ?? "-"}
                      {item && loadedItemIds.includes(item.id) ? (
                        <span className="ml-2 inline-flex rounded-lg bg-emerald-100/70 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Loaded
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{new Date(order.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/orders/${order.id}`}
                        className="ios-secondary-btn h-9 px-3 py-2 text-sm"
                      >
                        View Document
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesQueue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500">
                  No sales order outbound items
                </TableCell>
              </TableRow>
            ) : (
              salesQueue.map((row) => (
                <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                  <TableCell className="font-semibold text-slate-900">
                    {row.salesOrder.orderNumber}
                  </TableCell>
                  <TableCell>{row.salesOrder.customer?.name ?? "-"}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>
                    {new Date(row.scheduledDate).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                    })}
                  </TableCell>
                  <TableCell>
                    {row.status === "SCHEDULED"
                      ? "pending"
                      : row.status === "IN_PROGRESS"
                        ? "ready"
                        : row.status === "COMPLETED"
                          ? "completed"
                          : "voided"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/orders/${row.salesOrderId}`}
                      className="ios-secondary-btn h-9 px-3 py-2 text-sm"
                    >
                      Open Sales Order
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ScanModal
        open={scanOpen}
        title="Order Shipment Scan"
        onClose={() => setScanOpen(false)}
        onDetected={onScanDetected}
      />
    </section>
  );
}
