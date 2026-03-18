"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Heart,
  LayoutDashboard,
  Menu,
  Package,
  PackageOpen,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShoppingBag,
  Tag,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { useRole } from "@/components/layout/role-provider";
import { canViewPath, Role } from "@/lib/rbac";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

type GlobalProductResult = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
};

type GlobalOrderResult = {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
};

type GlobalCustomerResult = {
  id: string;
  name: string;
  phone: string | null;
  companyName: string | null;
};

type ShellNavItem = {
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
    exact?: boolean;
  }>;
};

const shellItems: ShellNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "SALES", "WAREHOUSE"] },
  {
    label: "Sales",
    href: "/orders",
    icon: ShoppingBag,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/orders", "/sales-orders", "/invoices", "/finance/payments", "/after-sales/returns", "/returns", "/customers"],
    children: [
      { label: "Quotes", href: "/orders?docType=QUOTE", roles: ["ADMIN", "SALES"] },
      { label: "Sales Orders", href: "/orders", roles: ["ADMIN", "SALES"], matchStartsWith: ["/orders"] },
      { label: "Invoices", href: "/invoices", roles: ["ADMIN", "SALES"], matchStartsWith: ["/invoices"] },
      { label: "Payments", href: "/finance/payments", roles: ["ADMIN", "SALES"], matchStartsWith: ["/finance/payments"] },
      { label: "Returns", href: "/after-sales/returns", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales/returns", "/returns"] },
      { label: "Customers", href: "/customers", roles: ["ADMIN", "SALES"], matchStartsWith: ["/customers"] },
    ],
  },
  {
    label: "Fulfillment",
    href: "/fulfillment/outbound",
    icon: PackageOpen,
    roles: ["ADMIN", "WAREHOUSE"],
    matchStartsWith: ["/warehouse", "/fulfillment", "/delivery", "/outbound"],
    children: [
      { label: "Fulfillment Queue", href: "/fulfillment/outbound", roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/fulfillment/outbound", "/outbound"] },
      { label: "Picking", href: "/warehouse/picking", roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Packing", href: "/warehouse/packing", roles: ["ADMIN", "WAREHOUSE"] },
      { label: "Pickup", href: "/fulfillment", roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/fulfillment"] },
      { label: "Delivery", href: "/delivery", roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/delivery"] },
    ],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["ADMIN", "WAREHOUSE", "SALES"],
    matchStartsWith: ["/inventory", "/products", "/warehouses"],
    children: [
      { label: "Overview", href: "/inventory", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/inventory"] },
      { label: "Products", href: "/products", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/products"] },
      { label: "Stock Levels", href: "/inventory/stock", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/inventory/stock"] },
      { label: "Reorder List", href: "/inventory/reorder", roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Movements", href: "/inventory/movements", roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Warehouses", href: "/warehouses", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/warehouses"] },
    ],
  },
  {
    label: "Purchasing",
    href: "/purchasing/orders",
    icon: ClipboardList,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/purchasing", "/suppliers"],
    children: [
      { label: "Purchase Orders", href: "/purchasing/orders", roles: ["ADMIN", "SALES"], matchStartsWith: ["/purchasing/orders"] },
      { label: "Suppliers", href: "/suppliers", roles: ["ADMIN", "SALES"], matchStartsWith: ["/suppliers"] },
      { label: "Receiving", href: "/purchasing/receiving", roles: ["ADMIN", "SALES"] },
      { label: "Vendor Bills", href: "/purchasing/bills", roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    label: "Price Management",
    href: "/price-list",
    icon: Tag,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/price-list", "/price-management"],
    children: [
      { label: "Price List", href: "/price-list", roles: ["ADMIN", "SALES"], matchStartsWith: ["/price-list"] },
      { label: "Margin Control", href: "/price-management/margin", roles: ["ADMIN", "SALES"] },
      { label: "Promotions", href: "/price-management/promotions", roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    label: "After-Sales",
    href: "/after-sales",
    icon: RotateCcw,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/after-sales", "/tickets", "/store-credit"],
    children: [
      { label: "Tickets", href: "/after-sales", roles: ["ADMIN", "SALES"], exact: true },
      { label: "Store Credit", href: "/after-sales/store-credit", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales/store-credit", "/store-credit"] },
    ],
  },
  {
    label: "Finance",
    href: "/finance",
    icon: Wallet,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/finance", "/reports"],
    children: [
      { label: "Revenue", href: "/finance/revenue", roles: ["ADMIN", "SALES"] },
      { label: "Expenses", href: "/finance/expenses", roles: ["ADMIN", "SALES"] },
      { label: "Profit", href: "/finance/profit", roles: ["ADMIN", "SALES"] },
      { label: "Reports", href: "/reports", roles: ["ADMIN", "SALES"], matchStartsWith: ["/reports"] },
    ],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/analytics", "/reconciliation"],
    children: [
      { label: "Sales Analytics", href: "/analytics/sales", roles: ["ADMIN", "SALES"] },
      { label: "Inventory Analytics", href: "/analytics/inventory", roles: ["ADMIN", "SALES"] },
      { label: "Customer Analytics", href: "/analytics/customers", roles: ["ADMIN", "SALES"] },
    ],
  },
  {
    label: "System",
    href: "/system/health",
    icon: Heart,
    roles: ["ADMIN"],
    matchStartsWith: ["/system"],
    children: [
      { label: "System Health", href: "/system/health", roles: ["ADMIN"], matchStartsWith: ["/system/health"] },
      { label: "Run All Tests", href: "/system/tests", roles: ["ADMIN"], matchStartsWith: ["/system/tests"] },
      { label: "Feature Tests", href: "/system/feature-tests", roles: ["ADMIN"], matchStartsWith: ["/system/feature-tests"] },
      { label: "UI Tests", href: "/system/ui-tests", roles: ["ADMIN"], matchStartsWith: ["/system/ui-tests"] },
      { label: "System Metrics", href: "/system/metrics", roles: ["ADMIN"], matchStartsWith: ["/system/metrics"] },
      { label: "System Logs", href: "/system/logs", roles: ["ADMIN"], matchStartsWith: ["/system/logs"] },
    ],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN"],
    matchStartsWith: ["/settings"],
    children: [
      { label: "Users", href: "/settings/users", roles: ["ADMIN"] },
      { label: "Roles", href: "/settings/roles", roles: ["ADMIN"] },
      { label: "Company", href: "/settings", roles: ["ADMIN"] },
      { label: "Tax", href: "/settings/tax", roles: ["ADMIN"] },
      { label: "Integrations", href: "/settings/integrations", roles: ["ADMIN"] },
    ],
  },
];

function toTitle(pathname: string) {
  if (pathname === "/dashboard") return "Dashboard";
  const clean = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  return clean
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AppShell({ children, title, subtitle }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, userName, authenticated, loading } = useRole();
  const [open, setOpen] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
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
  const [searchResults, setSearchResults] = useState<{
    products: GlobalProductResult[];
    orders: GlobalOrderResult[];
    customers: GlobalCustomerResult[];
  }>({ products: [], orders: [], customers: [] });
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const isLogin = pathname === "/login";
  const canView = canViewPath(role, pathname);

  /** POS-style order entry: hide global header (title, search, filters, user) so the page starts with the entry top bar. */
  const isSalesOrderEditor =
    pathname === "/sales-orders/new" || pathname === "/sales-orders/pos" || pathname.startsWith("/sales-orders/edit/");

  const highlightText = (text: string, query: string) => {
    const base = String(text ?? "");
    const q = String(query ?? "").trim();
    if (!q) return base;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    const parts = base.split(regex);
    const qLower = q.toLowerCase();
    return parts.map((part, index) =>
      part.toLowerCase() === qLower ? (
        <mark key={`${part}-${index}`} className="rounded bg-slate-500/30 px-0.5 text-inherit">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  };

  const visibleItems = useMemo(
    () =>
      shellItems
        .filter((item) => item.roles.includes(role))
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => child.roles.includes(role) && canViewPath(role, child.href)),
        }))
        .filter((item) => canViewPath(role, item.href) || Boolean(item.children && item.children.length > 0)),
    [role],
  );

  useEffect(() => {
    if (!authenticated) return;
    fastPrefetchRoutes.forEach((href) => {
      if (!canViewPath(role, href)) return;
      router.prefetch(href);
    });
  }, [authenticated, fastPrefetchRoutes, role, router]);

  const prefetchFastRoute = (href: string) => {
    if (!fastPrefetchRoutes.has(href)) return;
    if (!canViewPath(role, href)) return;
    router.prefetch(href);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!searchContainerRef.current) return;
      if (searchContainerRef.current.contains(event.target as Node)) return;
      setSearchOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [searchOpen]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults({ products: [], orders: [], customers: [] });
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const params = new URLSearchParams();
        params.set("q", q);
        const res = await fetch(`/api/search/global?${params.toString()}`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to search");
        const data = payload.data ?? {};
        setSearchResults({
          products: Array.isArray(data.products) ? data.products : [],
          orders: Array.isArray(data.orders) ? data.orders : [],
          customers: Array.isArray(data.customers) ? data.customers : [],
        });
        setSearchOpen(true);
      } catch {
        setSearchResults({ products: [], orders: [], customers: [] });
        setSearchOpen(true);
      } finally {
        setSearchLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery, role]);

  if (isLogin) {
    return <div className="min-h-screen bg-transparent text-slate-100 tracking-tight">{children}</div>;
  }

  if (!authenticated && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-sm text-slate-400">
        Loading session...
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-transparent text-slate-100 tracking-tight">

      {open ? <button type="button" className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm xl:hidden" onClick={() => setOpen(false)} /> : null}

      <aside
        className={`glass-sidebar fixed inset-y-4 left-0 z-40 w-[220px] overflow-hidden rounded-[16px] shadow-[0_10px_40px_rgba(0,0,0,0.4)] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-[120%] xl:translate-x-0"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-5 pb-4 pt-5 shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-lg shadow-slate-500/20">
                  <Boxes className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-white">Solidcore</h2>
                <p className="text-xs leading-5 text-slate-400">Building Materials CRM</p>
              </div>
              <button type="button" className="rounded-xl p-1 text-slate-400 hover:bg-white/10 hover:text-white xl:hidden" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="so-sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-1">
            <div className="space-y-1.5">
              {visibleItems.map((item) => {
                const childActive = item.children?.some(
                  (child) =>
                    child.exact
                      ? pathname === child.href
                      : pathname === child.href || child.matchStartsWith?.some((prefix) => pathname.startsWith(prefix)),
                );
                const active =
                  pathname === item.href || item.matchStartsWith?.some((prefix) => pathname.startsWith(prefix)) || childActive;
                const Icon = item.icon;
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const collapsed = collapsedItems[item.label] ?? !childActive;
                return (
                  <div key={item.href}>
                    <div
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] transition-all duration-200 ${
                        active
                          ? "bg-white/[0.06] font-semibold text-white shadow-[0_10px_40px_rgba(0,0,0,0.25)] border border-white/[0.10]"
                          : "text-slate-300 hover:bg-white/[0.06] hover:text-white border border-transparent"
                      } ${hasChildren ? "cursor-pointer" : ""}`}
                    >
                      <Link
                        href={item.href}
                        prefetch={true}
                        className="flex min-w-0 flex-1 items-center gap-3"
                        onMouseEnter={() => prefetchFastRoute(item.href)}
                        onClick={(e) => {
                          if (hasChildren) {
                            e.preventDefault();
                            setCollapsedItems((prev) => ({ ...prev, [item.label]: !collapsed }));
                          }
                          setOpen(false);
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="flex-1">{item.label}</span>
                      </Link>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedItems((prev) => ({
                              ...prev,
                              [item.label]: !collapsed,
                            }))
                          }
                          className={`rounded-md p-0.5 ${active ? "text-white/85 hover:bg-white/10" : "text-slate-500 hover:bg-white/10"}`}
                          aria-label={`Toggle ${item.label}`}
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`} />
                        </button>
                      ) : active ? (
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/85" />
                      ) : null}
                    </div>
                    {hasChildren && !collapsed ? (
                      <div className="mt-1 space-y-1 pl-8">
                        {item.children!.map((child) => {
                          const childIsActive =
                            child.exact
                              ? pathname === child.href
                              : pathname === child.href || child.matchStartsWith?.some((prefix) => pathname.startsWith(prefix));
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              prefetch={true}
                              className={`block rounded-xl px-2.5 py-1 text-[12px] transition-all duration-200 ${
                                childIsActive
                                  ? "bg-white/[0.06] font-semibold text-white"
                                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                              }`}
                              onMouseEnter={() => prefetchFastRoute(child.href)}
                              onClick={() => setOpen(false)}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 border-t border-white/[0.06] px-4 pb-4 pt-3">
            <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white">Solidcore Pro</p>
                <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-white/70">74%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.08]">
                <div className="h-1.5 w-[74%] rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Premium tools enabled</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3 flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2">
                <Settings className="h-3.5 w-3.5" />
                Profile
              </span>
              <button type="button" className="rounded-md p-1 hover:bg-white/10 hover:text-white" aria-label="Collapse sidebar">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Spacer for fixed sidebar on desktop so flex content aligns */}
      <div className="hidden w-[220px] shrink-0 xl:block" aria-hidden="true" />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col pl-4 pr-4">
        {!isSalesOrderEditor ? (
          <header className="sticky top-0 z-20 flex min-h-[52px] items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 backdrop-blur-xl">
            {/* LEFT: Page title + Subtitle */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.06] p-2 text-slate-400 hover:text-white xl:hidden"
                onClick={() => setOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-white">
                  {title ?? toTitle(pathname)}
                </h1>
                <p className="truncate text-sm text-slate-400">{subtitle ?? "Welcome back, Admin"}</p>
              </div>
            </div>

            {/* RIGHT: Search + Notification + Admin dropdown + Date range + User avatar */}
            <div className="flex shrink-0 items-center gap-3">
              <div ref={searchContainerRef} className="relative hidden w-[420px] xl:block">
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-white/50" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                      if (searchQuery.trim().length >= 2) setSearchOpen(true);
                    }}
                    placeholder="Search products, orders, customers..."
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </div>
                {searchOpen ? (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[420px] overflow-y-auto rounded-lg border border-white/[0.08] bg-slate-900/98 p-2 shadow-xl backdrop-blur-xl">
                      {searchLoading ? (
                        <div className="px-3 py-2 text-xs text-white/50">Searching...</div>
                      ) : (
                        <>
                          {searchResults.products.length > 0 ? (
                            <div className="mb-1">
                              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Products
                              </p>
                              {searchResults.products.slice(0, 4).map((item) => (
                                <button
                                  key={`p-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery("");
                                    router.push(`/products/${item.productId}`);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-white hover:bg-white/10"
                                >
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.name}
                                      className="h-8 w-8 rounded-md border border-white/10 object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.10] bg-white/[0.05] text-[10px] text-white/50">
                                      IMG
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-white">{highlightText(item.name, searchQuery)}</p>
                                    <p className="truncate text-xs text-white/50">{highlightText(item.sku || "-", searchQuery)}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {searchResults.orders.length > 0 ? (
                            <div className="mb-1">
                              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Orders
                              </p>
                              {searchResults.orders.slice(0, 4).map((item) => (
                                <button
                                  key={`o-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery("");
                                    router.push(`/sales-orders/${item.id}`);
                                  }}
                                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-white hover:bg-white/10"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-white">{highlightText(item.orderNumber, searchQuery)}</p>
                                    <p className="truncate text-xs text-white/50">{highlightText(item.customerName, searchQuery)}</p>
                                  </div>
                                  <span className="shrink-0 text-xs font-medium text-white/70">${Number(item.total || 0).toFixed(2)}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {searchResults.customers.length > 0 ? (
                            <div className="mb-1">
                              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Customers
                              </p>
                              {searchResults.customers.slice(0, 4).map((item) => (
                                <button
                                  key={`c-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery("");
                                    router.push(`/customers?highlight=${item.id}`);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-white hover:bg-white/10"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-white">{highlightText(item.name, searchQuery)}</p>
                                    <p className="truncate text-xs text-slate-400">
                                      {highlightText(item.phone || "-", searchQuery)}{" "}
                                      {item.companyName ? <>· {highlightText(item.companyName, searchQuery)}</> : ""}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {searchResults.products.length === 0 &&
                          searchResults.orders.length === 0 &&
                          searchResults.customers.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-slate-400">No results found</div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              <button type="button" className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white" aria-label="Refresh">
                <RefreshCcw className="h-4 w-4" />
              </button>
              <button type="button" className="relative rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-sm text-slate-200"
              >
                {role}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-sm text-slate-200"
              >
                Last 7 days
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-sm text-slate-200"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
                  {userName?.slice(0, 1)?.toUpperCase() || "A"}
                </span>
                <span className="hidden sm:inline">{userName || "Admin"}</span>
              </button>
            </div>
          </header>
        ) : null}

        <main className={`pb-6 ${isSalesOrderEditor ? "pt-0 flex flex-1 min-h-0 flex-col" : "pt-4"}`}>{canView ? children : <AccessDenied />}</main>
      </div>
    </div>
  );
}
