import { Bell, ChevronDown, RefreshCcw, Search } from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="rounded-[20px] border border-white/60 bg-white/80 px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.10)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-none tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-2 text-[13px] text-slate-500">Welcome back, Admin 👋</p>
        </div>

        <div className="flex flex-1 items-center gap-4 xl:max-w-[560px]">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              readOnly
              value=""
              placeholder="Search products, orders, customers..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button type="button" className="rounded-xl border border-slate-200/70 bg-white p-2.5 text-slate-500 transition hover:text-slate-700">
            <RefreshCcw className="h-4 w-4" />
          </button>
          <button type="button" className="relative rounded-xl border border-slate-200/70 bg-white p-2.5 text-slate-500 transition hover:text-slate-700">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 text-sm text-slate-700"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="dashboard-live-dot" />
              <span className="text-[12px] font-medium text-emerald-600">Live</span>
            </span>
            Last 7 days
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 text-sm text-slate-700"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              A
            </span>
            <span>Admin</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>
    </header>
  );
}
