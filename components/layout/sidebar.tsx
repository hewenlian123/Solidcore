"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardList,
  Factory,
  FileBarChart2,
  FileText,
  FlaskConical,
  Heart,
  LayoutDashboard,
  MapPin,
  Package,
  PackageCheck,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Ticket,
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
  key: "overview" | "sales" | "fulfillment" | "inventory" | "purchasing" | "priceManagement" | "afterSales" | "finance" | "analytics" | "system" | "settings";
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
        label: "Sales Orders",
        href: "/orders",
        icon: ShoppingCart,
        roles: ["ADMIN", "SALES"],
        matchStartsWith: ["/orders"],
      },
      { label: "Quotes", href: "/orders?docType=QUOTE", icon: FileText, roles: ["ADMIN", "SALES"] },
      { label: "Invoices", href: "/invoices", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Payments", href: "/finance/payments", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Returns", href: "/after-sales/returns", icon: ShieldCheck, roles: ["ADMIN", "SALES"] },
      { label: "Customers", href: "/customers", icon: Users, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    roles: ["ADMIN", "WAREHOUSE"],
    items: [
      { label: "Fulfillment Queue", href: "/fulfillment/outbound", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/fulfillment/outbound"] },
      { label: "Pickup", href: "/fulfillment", icon: Package, roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/fulfillment"] },
      { label: "Delivery", href: "/delivery", icon: Truck, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Picking", href: "/warehouse/picking", icon: PackageCheck, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Packing", href: "/warehouse/packing", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    roles: ["ADMIN", "WAREHOUSE", "SALES"],
    items: [
      { label: "Overview", href: "/inventory", icon: LayoutDashboard, roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Products", href: "/products", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Stock Levels", href: "/inventory/stock", icon: MapPin, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Reorder List", href: "/inventory/reorder", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Movements", href: "/inventory/movements", icon: ClipboardList, roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Warehouses", href: "/warehouses", icon: MapPin, roles: ["ADMIN", "WAREHOUSE"] },
    ],
  },
  {
    key: "purchasing",
    label: "Purchasing",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Purchase Orders", href: "/purchasing/orders", icon: FileText, roles: ["ADMIN", "SALES"] },
      { label: "Suppliers", href: "/suppliers", icon: Factory, roles: ["ADMIN", "SALES"] },
      { label: "Receiving", href: "/purchasing/receiving", icon: PackageCheck, roles: ["ADMIN", "SALES"] },
      { label: "Vendor Bills", href: "/purchasing/bills", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "priceManagement",
    label: "Price Management",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Price List", href: "/price-list", icon: Tag, roles: ["ADMIN", "SALES"] },
      { label: "Margin Control", href: "/price-management/margin", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Promotions", href: "/price-management/promotions", icon: Tag, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "afterSales",
    label: "After-Sales",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Tickets", href: "/after-sales", icon: Ticket, roles: ["ADMIN", "SALES"] },
      { label: "Store Credit", href: "/after-sales/store-credit", icon: ShieldCheck, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Revenue", href: "/finance/revenue", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Expenses", href: "/finance/expenses", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Profit", href: "/finance/profit", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Reports", href: "/reports", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    roles: ["ADMIN", "SALES"],
    items: [
      { label: "Sales Analytics", href: "/analytics/sales", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Inventory Analytics", href: "/analytics/inventory", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
      { label: "Customer Analytics", href: "/analytics/customers", icon: FileBarChart2, roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    key: "system",
    label: "System",
    roles: ["ADMIN"],
    items: [
      { label: "System Health", href: "/system/health", icon: Heart, roles: ["ADMIN"] },
      { label: "Run All Tests", href: "/system/tests", icon: FlaskConical, roles: ["ADMIN"] },
      { label: "Feature Tests", href: "/system/feature-tests", icon: Package, roles: ["ADMIN"] },
      { label: "UI Tests", href: "/system/ui-tests", icon: LayoutDashboard, roles: ["ADMIN"] },
      { label: "System Metrics", href: "/system/metrics", icon: BarChart3, roles: ["ADMIN"] },
      { label: "System Logs", href: "/system/logs", icon: ScrollText, roles: ["ADMIN"] },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    roles: ["ADMIN"],
    items: [{ label: "Settings", href: "/settings", icon: Settings, roles: ["ADMIN"] }],
  },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useRole();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const fastPrefetchRoutes = useMemo(
    () =>
      new Set([
        "/dashboard",
        "/orders",
        "/inventory",
        "/products",
        "/customers",
        "/price-list",
      ]),
    [],
  );
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

  const prefetchFastRoute = (href: string) => {
    if (!fastPrefetchRoutes.has(href)) return;
    if (!canViewPath(role, href)) return;
    router.prefetch(href);
  };

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
        className={`glass-sidebar fixed left-0 top-0 z-40 h-screen w-72 shadow-[0_10px_40px_rgba(0,0,0,0.4)] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-6">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-white/80" />
            <span className="text-sm font-semibold tracking-tight text-white">Solidcore</span>
          </div>

          <button
            type="button"
            aria-label="Close sidebar"
            className="rounded-xl p-1 text-white/70 hover:bg-white/[0.06] md:hidden"
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
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2 backdrop-blur-xl"
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
                      groupActive ? "text-white" : "text-white/50 hover:text-white/80"
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
                                    ? "bg-white/[0.06] font-semibold text-white"
                                    : "font-normal text-white/70 hover:bg-white/[0.04] hover:text-white"
                                }`}
                                prefetch={true}
                                onMouseEnter={() => prefetchFastRoute(item.href)}
                                onClick={onClose}
                              >
                                <Icon className={`h-4 w-4 ${active ? "text-white" : "text-white/60"}`} />
                                <span>{item.label}</span>
                              </Link>
                            ) : (
                              <div
                                className={`rounded-xl ${
                                  active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                                  <Link
                                    href={item.href}
                                    className={`flex min-w-0 items-center gap-3 text-sm transition ${
                                      active
                                        ? "font-semibold text-white"
                                        : "font-normal text-white/70 hover:text-white"
                                    }`}
                                    prefetch={true}
                                    onMouseEnter={() => prefetchFastRoute(item.href)}
                                    onClick={onClose}
                                  >
                                    <Icon className={`h-4 w-4 ${active ? "text-white" : "text-white/60"}`} />
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
                                    className={`rounded-md p-1 ${active ? "text-white/80 hover:bg-white/[0.06]" : "text-white/60 hover:bg-white/[0.06]"}`}
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
                                                ? "bg-white/[0.08] font-semibold text-white"
                                                : active
                                                  ? "text-white/80 hover:bg-white/[0.06] hover:text-white"
                                                  : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                                            }`}
                                            prefetch={true}
                                            onMouseEnter={() => prefetchFastRoute(child.href)}
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
