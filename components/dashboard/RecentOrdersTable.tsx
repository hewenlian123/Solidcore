import { Download, Ellipsis } from "lucide-react";
import type { RecentOrderRow } from "@/components/dashboard/dashboardMock";

const statusClass: Record<RecentOrderRow["status"], string> = {
  Paid: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
  Pending: "bg-amber-500/20 text-amber-300 border border-amber-400/30",
  Shipped: "bg-sky-500/20 text-sky-300 border border-sky-400/30",
  Overdue: "bg-rose-500/20 text-rose-300 border border-rose-400/30",
};

const paymentClass: Record<RecentOrderRow["payment"], string> = {
  "Credit Card": "bg-white/[0.05] text-white/70 border border-white/[0.10]",
  PayPal: "bg-white/[0.05] text-white/70 border border-white/[0.10]",
  "Bank Transfer": "bg-white/[0.05] text-white/70 border border-white/[0.10]",
  Stripe: "bg-white/[0.05] text-white/70 border border-white/[0.10]",
};

export function RecentOrdersTable({ rows }: { rows: RecentOrderRow[] }) {
  return (
    <article className="glass-card glass-card-readable px-6 py-5">
      <div className="glass-card-content mb-4 flex items-center justify-between">
        <h3 className="text-[19px] font-semibold text-white">Recent Orders</h3>
        <div className="inline-flex items-center gap-1">
          <button type="button" className="rounded-lg border border-white/[0.1] bg-white/[0.06] p-2 text-white/60 hover:text-white">
            <Download className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg border border-white/[0.1] bg-white/[0.06] p-2 text-white/60 hover:text-white">
            <Ellipsis className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="glass-card-content overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-[11px] font-medium uppercase tracking-wide txt-secondary">
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
              <tr key={row.id} className="border-b border-white/[0.06] txt-secondary last:border-0 hover:bg-white/[0.04]">
                <td className="py-3.5 pr-4 font-medium text-white">{row.id}</td>
                <td className="py-3.5 pr-4">{row.customer}</td>
                <td className="py-3.5 pr-4 txt-muted">{row.date}</td>
                <td className="py-3.5 pr-4 font-medium text-white">{row.total}</td>
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
