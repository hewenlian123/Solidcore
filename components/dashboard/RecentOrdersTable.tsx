import { Download, Ellipsis } from "lucide-react";
import type { RecentOrderRow } from "@/components/dashboard/dashboardMock";

const statusClass: Record<RecentOrderRow["status"], string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Shipped: "bg-sky-100 text-sky-700",
  Overdue: "bg-rose-100 text-rose-700",
};

const paymentClass: Record<RecentOrderRow["payment"], string> = {
  "Credit Card": "bg-slate-100 text-slate-700",
  PayPal: "bg-blue-100 text-blue-700",
  "Bank Transfer": "bg-violet-100 text-violet-700",
  Stripe: "bg-indigo-100 text-indigo-700",
};

export function RecentOrdersTable({ rows }: { rows: RecentOrderRow[] }) {
  return (
    <article className="glass-card glass-card-readable px-6 py-5">
      <div className="glass-card-content mb-4 flex items-center justify-between">
        <h3 className="text-[19px] font-semibold text-slate-900">Recent Orders</h3>
        <div className="inline-flex items-center gap-1">
          <button type="button" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500">
            <Download className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500">
            <Ellipsis className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="glass-card-content overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200/70 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <th className="pb-3.5 pr-4">Order ID</th>
              <th className="pb-3.5 pr-4">Customer</th>
              <th className="pb-3.5 pr-4">Date</th>
              <th className="pb-3.5 pr-4">Total</th>
              <th className="pb-3.5 pr-4">Status</th>
              <th className="pb-3.5 pr-0">Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-200/50 text-slate-700 last:border-0 hover:bg-slate-50/70">
                <td className="py-3.5 pr-4 font-medium text-slate-900">{row.id}</td>
                <td className="py-3.5 pr-4">{row.customer}</td>
                <td className="py-3.5 pr-4 text-slate-500">{row.date}</td>
                <td className="py-3.5 pr-4 font-medium">{row.total}</td>
                <td className="py-3.5 pr-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[row.status]}`}>{row.status}</span>
                </td>
                <td className="py-3.5 pr-0">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${paymentClass[row.payment]}`}>{row.payment}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
