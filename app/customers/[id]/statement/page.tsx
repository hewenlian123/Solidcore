"use client";

import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { exportStatementPdf } from "@/lib/pdf/export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatementRow = {
  id: string;
  orderNo: string;
  date: string;
  productName: string;
  totalPrice: number;
  paidAmount: number;
  unpaidAmount: number;
};

type StatementPayload = {
  customer: {
    id: string;
    name: string;
    phone: string;
    installAddress: string;
  };
  rows: StatementRow[];
  summary: {
    total: number;
    paid: number;
    unpaid: number;
  };
};

export default function CustomerStatementPage() {
  const { role } = useRole();
  const params = useParams<{ id: string }>();
  const customerId = String(params?.id ?? "");
  const [data, setData] = useState<StatementPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatement = async () => {
      if (!customerId) return;
      try {
        const res = await fetch(`/api/customers/${customerId}/statement`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load statement");
        setData(payload.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load statement");
      } finally {
        setLoading(false);
      }
    };

    fetchStatement();
  }, [customerId, role]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const onExportPdf = () => {
    if (!data) return;
    exportStatementPdf({
      customerName: data.customer.name,
      rows: data.rows.map((r) => ({
        date: new Date(r.date).toLocaleDateString("en-US", { timeZone: "UTC" }),
        productName: r.productName,
        total: r.totalPrice,
        paid: r.paidAmount,
        unpaid: r.unpaidAmount,
      })),
    });
  };

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customer Statement</h1>
            <p className="mt-2 text-sm text-slate-500">View receivable, paid, and unpaid amounts by order.</p>
          </div>
          <button
            type="button"
            onClick={onExportPdf}
            className="ios-secondary-btn inline-flex h-11 items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="linear-card p-8">
        {loading ? (
          <p className="text-sm text-slate-500">Loading customer info...</p>
        ) : data?.customer ? (
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 md:grid-cols-3">
            <p>
              <span className="text-slate-500">Customer: </span>
              <span className="font-medium text-slate-900">{data.customer.name}</span>
            </p>
            <p>
              <span className="text-slate-500">Phone：</span>
              <span className="font-medium text-slate-900">{data.customer.phone}</span>
            </p>
            <p>
              <span className="text-slate-500">Install Address：</span>
              <span className="font-medium text-slate-900">{data.customer.installAddress}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No customer data</p>
        )}
      </div>

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Order Date</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Unpaid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500">
                  Loading details...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500">
                  No statement records
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                  <TableCell>{new Date(row.date).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                  <TableCell className="font-medium text-slate-800">{row.orderNo}</TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell>${row.totalPrice.toFixed(2)}</TableCell>
                  <TableCell>${row.paidAmount.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-xl bg-amber-100/70 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      ${row.unpaidAmount.toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data?.summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard title="Total Receivable" value={data.summary.total} tone="slate" />
          <SummaryCard title="Total Paid" value={data.summary.paid} tone="green" />
          <SummaryCard title="Total Unpaid" value={data.summary.unpaid} tone="amber" />
        </div>
      ) : null}

      <Link
        href="/customers"
        className="ios-secondary-btn inline-flex items-center gap-2 px-4 py-2 text-sm"
      >
        <FileText className="h-4 w-4" />
        Back to Customer Management
      </Link>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "slate" | "green" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-100/60 text-green-800"
      : tone === "amber"
        ? "bg-amber-100/70 text-amber-800"
        : "bg-slate-100/80 text-slate-800";

  return (
    <article className="linear-card p-8">
      <p className="text-xs text-slate-400">{title}</p>
      <p className={`mt-3 inline-flex rounded-xl px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
        ${value.toFixed(2)}
      </p>
    </article>
  );
}
