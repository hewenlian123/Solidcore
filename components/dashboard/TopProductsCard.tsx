import { ArrowUpRight, Check } from "lucide-react";
import type { TopProductRow } from "@/components/dashboard/dashboardMock";

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function thumbSrc(seed: string) {
  const palettes = [
    ["#dbeafe", "#93c5fd"],
    ["#dcfce7", "#86efac"],
    ["#fef3c7", "#fcd34d"],
    ["#f3e8ff", "#c4b5fd"],
    ["#fee2e2", "#fca5a5"],
  ] as const;
  const index = Math.abs(
    seed.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0),
  ) % palettes.length;
  const [c1, c2] = palettes[index];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='56' height='56' rx='14' fill='url(#g)'/><rect x='12' y='12' width='32' height='32' rx='8' fill='rgba(255,255,255,0.42)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function TopProductsCard({ rows }: { rows: TopProductRow[] }) {
  return (
    <article className="glass-card glass-card-moderate px-5 py-5">
      <div className="glass-card-content mb-4 flex items-center justify-between">
        <h3 className="text-[19px] font-semibold text-slate-900">Top Products</h3>
        <button type="button" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          View All
        </button>
      </div>

      <div className="glass-card-content space-y-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_86px_100px_62px] items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Product</span>
          <span className="text-right">Sales</span>
          <span className="text-right">Revenue</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_86px_100px_62px] items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <div className="flex min-w-0 items-center gap-3">
              <img src={thumbSrc(`${row.name}-${row.sku}`)} alt={row.name} className="h-11 w-11 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">SKU {row.sku}</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">Sales {row.sales.toLocaleString("en-US")}</div>
            <div className="text-right text-[13px] font-semibold text-slate-900">{formatCurrency(row.revenue)}</div>
            <span className="ml-2 inline-flex items-center justify-end gap-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              <ArrowUpRight className="h-3.5 w-3.5" />
              {row.trend}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
