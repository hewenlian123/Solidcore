import {
  Boxes,
  CreditCard,
  LayoutDashboard,
  LineChart,
  Package,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { dashboardMenu } from "@/components/dashboard/dashboardMock";

const iconMap = {
  LayoutDashboard,
  ShoppingBag,
  Tag,
  ReceiptText,
  Users,
  Package,
  ShieldCheck,
  Ticket,
  RotateCcw,
  Wallet,
  LineChart,
  Settings,
};

export function DashboardSidebar() {
  return (
    <aside className="rounded-[20px] border border-white/70 bg-[#F2F5FA] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.10)] xl:sticky xl:top-6 xl:h-[calc(100vh-64px)] xl:overflow-hidden">
      <div className="mb-7">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Boxes className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-slate-900">Solidcore</h2>
        <p className="text-xs leading-5 text-slate-500">Building Materials CRM</p>
      </div>

      <nav className="space-y-1.5">
        {dashboardMenu.map((item) => {
          const Icon = iconMap[item.icon as keyof typeof iconMap] ?? LayoutDashboard;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-[13px] transition ${
                item.active
                  ? "bg-slate-900 font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
                  : "text-slate-600 hover:bg-white/90 hover:text-slate-900"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-2xl border border-white/70 bg-white/85 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-900">Solidcore Pro</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">74%</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
          <div className="h-1.5 w-[74%] rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-slate-500">
          <div className="h-6 w-6 rounded-full bg-slate-200" />
          <div className="h-6 w-6 rounded-full bg-slate-300" />
          <div className="h-6 w-6 rounded-full bg-slate-200" />
        </div>
      </div>
    </aside>
  );
}
