"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  ClipboardList,
  Factory,
  FileBarChart2,
  LayoutDashboard,
  MapPin,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Role } from "@/lib/rbac";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  matchStartsWith?: string[];
};

type NavGroup = {
  key: "overview" | "sales" | "fulfillment" | "inventory" | "finance" | "settings";
  label: string;
  roles: Role[];
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    roles: ["ADMIN", "SALES", "WAREHOUSE"],
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN"] }],
  },
  {
    key: "sales",
    label: "Sales",
    roles: ["ADMIN", "SALES"],
    items: [
      {
        label: "Orders",
        href: "/orders",
        icon: ShoppingCart,
        roles: ["ADMIN", "SALES"],
        matchStartsWith: ["/orders", "/sales-orders"],
      },
      { label: "Price List", href: "/price-list", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Invoices", href: "/invoices", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Customers", href: "/customers", icon: Users, roles: ["ADMIN", "SALES"] },
      { label: "After-Sales", href: "/after-sales", icon: ShieldCheck, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    roles: ["ADMIN", "WAREHOUSE"],
    items: [
      { label: "Fulfillment Dashboard", href: "/fulfillment", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Outbound Queue", href: "/outbound", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Delivery Schedule", href: "/delivery", icon: Truck, roles: ["ADMIN", "WAREHOUSE"] },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    roles: ["ADMIN", "WAREHOUSE", "SALES"],
    items: [
      { label: "Products", href: "/products", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Stock / Locations", href: "/warehouses", icon: MapPin, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Suppliers", href: "/suppliers", icon: Factory, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Finance", href: "/finance", icon: FileBarChart2, roles: ["ADMIN"] },
      { label: "Payments", href: "/finance/payments", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Reports", href: "/reports", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    roles: ["ADMIN"],
    items: [{ label: "System Settings", href: "/settings", icon: Settings, roles: ["ADMIN"] }],
  },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { role } = useRole();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const visibleGroups = useMemo(
    () =>
      navGroups
        .filter((group) => group.roles.includes(role))
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.roles.includes(role)),
        }))
        .filter((group) => group.items.length > 0),
    [role],
  );

  const isItemActive = (item: NavItem) => {
    if (pathname === item.href) return true;
    if (!item.matchStartsWith || item.matchStartsWith.length === 0) return pathname.startsWith(item.href);
    return item.matchStartsWith.some((prefix) => pathname.startsWith(prefix));
  };

  const isGroupActive = (group: NavGroup) => group.items.some((item) => isItemActive(item));

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-72 border-r border-slate-100 bg-white/70 backdrop-blur-md transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-semibold tracking-tight text-slate-800">Solidcore</span>
          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            className="rounded-xl p-1 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
          <div className="space-y-3">
            {visibleGroups.map((group) => {
              const collapsed = collapsedGroups[group.key] ?? false;
              const groupActive = isGroupActive(group);
              return (
                <section key={group.key} className="rounded-2xl border border-slate-100 bg-white/50 p-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({
                        ...prev,
                        [group.key]: !collapsed,
                      }))
                    }
                    className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide transition ${
                      groupActive ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`}
                    />
                  </button>

                  {!collapsed ? (
                    <ul className="mt-1 space-y-1.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isItemActive(item);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                active
                                  ? "bg-slate-100 font-semibold text-slate-900"
                                  : "font-normal text-slate-500 hover:bg-white hover:text-slate-900"
                              }`}
                              onClick={onClose}
                            >
                              <Icon className={`h-4 w-4 ${active ? "text-slate-800" : "text-slate-400"}`} />
                              <span>{item.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
