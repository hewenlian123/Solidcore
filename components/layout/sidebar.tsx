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
import { canViewPath, Role } from "@/lib/rbac";

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
  children?: Array<{
    label: string;
    href: string;
    roles: Role[];
    matchStartsWith?: string[];
  }>;
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
      {
        label: "After-Sales",
        href: "/after-sales",
        icon: ShieldCheck,
        roles: ["ADMIN", "SALES"],
        matchStartsWith: ["/after-sales"],
        children: [
          { label: "Tickets", href: "/after-sales", roles: ["ADMIN", "SALES"] },
          { label: "Returns", href: "/after-sales/returns", roles: ["ADMIN", "SALES"] },
          { label: "Store Credit", href: "/after-sales/store-credit", roles: ["ADMIN", "SALES"] },
        ],
      },
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
      { label: "Inventory Summary", href: "/inventory", icon: LayoutDashboard, roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Products", href: "/products", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Reorder List", href: "/inventory/reorder", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Movements", href: "/inventory/movements", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE", "SALES"] },
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
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const visibleGroups = useMemo(
    () =>
      navGroups
        .filter((group) => group.roles.includes(role))
        .map((group) => ({
          ...group,
          items: group.items
            .filter((item) => item.roles.includes(role))
            .map((item) => ({
              ...item,
              children: item.children
                ? item.children.filter((child) => child.roles.includes(role) && canViewPath(role, child.href))
                : undefined,
            }))
            .filter((item) => {
              const itemAllowed = canViewPath(role, item.href);
              const hasVisibleChildren = Boolean(item.children && item.children.length > 0);
              return itemAllowed || hasVisibleChildren;
            }),
        }))
        .filter((group) => group.items.length > 0),
    [role],
  );

  const isChildActive = (item: { href: string; matchStartsWith?: string[] }) => {
    if (pathname === item.href) return true;
    if (!item.matchStartsWith || item.matchStartsWith.length === 0) return false;
    return item.matchStartsWith.some((prefix) => pathname.startsWith(prefix));
  };

  const isItemActive = (item: NavItem) => {
    if (item.children?.some((child) => isChildActive(child))) return true;
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
        className={`fixed left-0 top-0 z-40 h-screen w-72 border-r transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{ background: "#EEF2F7", borderColor: "var(--border)" }}
      >
        <div className="flex h-16 items-center justify-between border-b px-6" style={{ borderColor: "var(--border)" }}>
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
                <section
                  key={group.key}
                  className="rounded-2xl border bg-white/70 p-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({
                        ...prev,
                        [group.key]: !collapsed,
                      }))
                    }
                    className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide transition ${
                      groupActive ? "text-slate-800" : "text-[var(--muted)] hover:text-slate-700"
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
                        const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                        const itemCollapsed = collapsedItems[item.href] ?? false;
                        const visibleChildren = hasChildren
                          ? item.children!.filter((child) => child.roles.includes(role))
                          : [];
                        return (
                          <li key={item.href}>
                            {!hasChildren ? (
                              <Link
                                href={item.href}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                                  active
                                    ? "bg-[#111827] font-semibold text-white"
                                    : "font-normal text-[var(--muted)] hover:bg-[rgba(15,23,42,0.04)] hover:text-slate-900"
                                }`}
                                onClick={onClose}
                              >
                                <Icon className={`h-4 w-4 ${active ? "text-white" : "text-slate-400"}`} />
                                <span>{item.label}</span>
                              </Link>
                            ) : (
                              <div
                                className={`rounded-xl ${
                                  active ? "bg-[#111827]" : "hover:bg-[rgba(15,23,42,0.04)]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                                  <Link
                                    href={item.href}
                                    className={`flex min-w-0 items-center gap-3 text-sm transition ${
                                      active
                                        ? "font-semibold text-white"
                                        : "font-normal text-[var(--muted)] hover:text-slate-900"
                                    }`}
                                    onClick={onClose}
                                  >
                                    <Icon className={`h-4 w-4 ${active ? "text-white" : "text-slate-400"}`} />
                                    <span>{item.label}</span>
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCollapsedItems((prev) => ({
                                        ...prev,
                                        [item.href]: !itemCollapsed,
                                      }))
                                    }
                                    className={`rounded-md p-1 ${active ? "text-white/80 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200/60"}`}
                                    aria-label={`Toggle ${item.label}`}
                                  >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${itemCollapsed ? "-rotate-90" : "rotate-0"}`} />
                                  </button>
                                </div>
                                {!itemCollapsed ? (
                                  <ul className="pb-2 pl-10 pr-2">
                                    {visibleChildren.map((child) => {
                                      const childActive = isChildActive(child);
                                      return (
                                        <li key={child.href}>
                                          <Link
                                            href={child.href}
                                            className={`block rounded-lg px-2 py-1.5 text-xs ${
                                              childActive
                                                ? "bg-white font-semibold text-slate-900"
                                                : active
                                                  ? "text-white/80 hover:bg-white/10 hover:text-white"
                                                  : "text-[var(--muted)] hover:bg-white hover:text-slate-900"
                                            }`}
                                            onClick={onClose}
                                          >
                                            {child.label}
                                          </Link>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : null}
                              </div>
                            )}
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
