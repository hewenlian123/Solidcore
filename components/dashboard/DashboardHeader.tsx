import { Bell, ChevronDown, RefreshCcw, Search } from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="glass-card rounded-2xl px-6 py-5">
      <div className="glass-card-content flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-none tracking-tight text-white">Dashboard</h1>
          <p className="mt-2 text-[13px] text-white/40">Welcome back, Admin 👋</p>
        </div>

        <div className="flex flex-1 items-center gap-4 xl:max-w-[560px]">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 backdrop-blur-xl">
            <Search className="h-4 w-4 text-white/60" />
            <input
              readOnly
              value=""
              placeholder="Search products, orders, customers..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button type="button" className="rounded-xl border border-white/[0.10] bg-white/[0.05] p-2.5 text-white/60 transition hover:bg-white/[0.06] hover:text-white backdrop-blur-xl">
            <RefreshCcw className="h-4 w-4" />
          </button>
          <button type="button" className="relative rounded-xl border border-white/[0.10] bg-white/[0.05] p-2.5 text-white/60 transition hover:bg-white/[0.06] hover:text-white backdrop-blur-xl">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white backdrop-blur-xl"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="dashboard-live-dot" />
              <span className="text-[12px] font-medium text-emerald-400">Live</span>
            </span>
            Last 7 days
            <ChevronDown className="h-4 w-4 text-white/40" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-2.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white backdrop-blur-xl"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-white">
              A
            </span>
            <span>Admin</span>
            <ChevronDown className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </div>
    </header>
  );
}
