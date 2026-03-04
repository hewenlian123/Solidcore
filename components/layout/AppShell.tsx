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
  Factory,
  LayoutDashboard,
  ListOrdered,
  MapPin,
  Menu,
  Package,
  Search,
  RefreshCcw,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Ticket,
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
  }>;
};

const shellItems: ShellNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "SALES", "WAREHOUSE"] },
  {
    label: "Orders",
    href: "/orders",
    icon: ShoppingBag,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/orders", "/sales-orders"],
    children: [
      { label: "Order Management", href: "/orders", roles: ["ADMIN", "SALES"], matchStartsWith: ["/orders"] },
      { label: "Sales Orders", href: "/sales-orders", roles: ["ADMIN", "SALES"], matchStartsWith: ["/sales-orders"] },
    ],
  },
  { label: "Price List", href: "/price-list", icon: Tag, roles: ["ADMIN", "SALES"] },
  { label: "Invoices", href: "/invoices", icon: ReceiptText, roles: ["ADMIN", "SALES"] },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/customers"],
    children: [{ label: "All Customers", href: "/customers", roles: ["ADMIN", "SALES"], matchStartsWith: ["/customers"] }],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["ADMIN", "WAREHOUSE", "SALES"],
    matchStartsWith: ["/inventory", "/products", "/warehouses", "/suppliers"],
    children: [
      { label: "Overview/Summary", href: "/inventory", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/inventory"] },
      { label: "Products", href: "/products", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/products"] },
      { label: "Reorder List", href: "/inventory/reorder", roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Movements", href: "/inventory/movements", roles: ["ADMIN", "WAREHOUSE", "SALES"] },
      { label: "Stock / Locations", href: "/warehouses", roles: ["ADMIN", "WAREHOUSE", "SALES"], matchStartsWith: ["/warehouses"] },
      { label: "Suppliers", href: "/suppliers", roles: ["ADMIN", "SALES"], matchStartsWith: ["/suppliers"] },
    ],
  },
  {
    label: "After-Sales",
    href: "/after-sales",
    icon: ShieldCheck,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/after-sales"],
    children: [
      { label: "Tickets", href: "/after-sales", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales"] },
      { label: "Returns", href: "/after-sales/returns", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales/returns"] },
      { label: "Store Credit", href: "/after-sales/store-credit", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales/store-credit"] },
    ],
  },
  { label: "Tickets", href: "/tickets", icon: Ticket, roles: ["ADMIN", "SALES"] },
  { label: "Returns", href: "/returns", icon: RotateCcw, roles: ["ADMIN", "SALES"], matchStartsWith: ["/returns"] },
  {
    label: "Store Credit",
    href: "/store-credit",
    icon: Wallet,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/store-credit", "/after-sales/store-credit"],
    children: [
      { label: "Overview", href: "/store-credit", roles: ["ADMIN", "SALES"], matchStartsWith: ["/store-credit"] },
      { label: "After-Sales Credit", href: "/after-sales/store-credit", roles: ["ADMIN", "SALES"], matchStartsWith: ["/after-sales/store-credit"] },
    ],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    roles: ["ADMIN", "SALES"],
    matchStartsWith: ["/analytics", "/reconciliation"],
    children: [
      { label: "Overview", href: "/analytics", roles: ["ADMIN", "SALES"], matchStartsWith: ["/analytics"] },
      { label: "Reconciliation", href: "/reconciliation", roles: ["ADMIN", "SALES"], matchStartsWith: ["/reconciliation"] },
    ],
  },
  { label: "Fulfillment", href: "/fulfillment", icon: ListOrdered, roles: ["ADMIN", "WAREHOUSE"], matchStartsWith: ["/fulfillment", "/outbound", "/delivery"] },
  { label: "Suppliers", href: "/suppliers", icon: Factory, roles: ["ADMIN", "SALES"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["ADMIN", "SALES"] },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN"],
    matchStartsWith: ["/settings"],
    children: [{ label: "System Settings", href: "/settings", roles: ["ADMIN"], matchStartsWith: ["/settings"] }],
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
  const [searchResults, setSearchResults] = useState<{
    products: GlobalProductResult[];
    orders: GlobalOrderResult[];
    customers: GlobalCustomerResult[];
  }>({ products: [], orders: [], customers: [] });
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const isLogin = pathname === "/login";
  const canView = canViewPath(role, pathname);

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
        <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-inherit">
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
    return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] tracking-tight">{children}</div>;
  }

  if (!authenticated && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--muted)]">
        Loading session...
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-[var(--text)] tracking-tight"
      style={{ background: "linear-gradient(135deg, #e8eef7 0%, #dde6f5 50%, #e4e8f5 100%)" }}
    >
      <div className="pointer-events-none fixed -left-24 -top-16 z-0 h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.30)_0%,rgba(59,130,246,0)_72%)] blur-[74px]" />
      <div className="pointer-events-none fixed -right-20 bottom-[-40px] z-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.26)_0%,rgba(99,102,241,0)_72%)] blur-[82px]" />
      <div className="pointer-events-none fixed left-[36%] top-[8%] z-0 h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.18)_0%,rgba(56,189,248,0)_76%)] blur-[74px]" />

      {open ? <button type="button" className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm xl:hidden" onClick={() => setOpen(false)} /> : null}

      <aside
        className={`fixed inset-y-4 left-4 z-40 w-[248px] overflow-hidden rounded-3xl border border-white/80 border-r-white/90 bg-white/60 shadow-[0_12px_30px_rgba(15,23,42,0.10)] backdrop-blur-[20px] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-[120%] xl:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Boxes className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-slate-900">Solidcore</h2>
                <p className="text-xs leading-5 text-slate-500">Building Materials CRM</p>
              </div>
              <button type="button" className="rounded-xl p-1 text-slate-500 hover:bg-white/70 xl:hidden" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-2">
            <div className="space-y-1.5">
              {visibleItems.map((item) => {
                const childActive = item.children?.some(
                  (child) => pathname === child.href || child.matchStartsWith?.some((prefix) => pathname.startsWith(prefix)),
                );
                const active =
                  pathname === item.href || item.matchStartsWith?.some((prefix) => pathname.startsWith(prefix)) || childActive;
                const Icon = item.icon;
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const collapsed = collapsedItems[item.label] ?? !childActive;
                return (
                  <div key={item.href}>
                    <div
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] transition ${
                        active
                          ? "bg-slate-900 font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
                          : "text-slate-600 hover:bg-white/90 hover:text-slate-900"
                      }`}
                    >
                      <Link href={item.href} prefetch={true} className="flex min-w-0 flex-1 items-center gap-3" onClick={() => setOpen(false)}>
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
                          className={`rounded-md p-0.5 ${active ? "text-white/85 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200/70"}`}
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
                            pathname === child.href || child.matchStartsWith?.some((prefix) => pathname.startsWith(prefix));
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              prefetch={true}
                              className={`block rounded-xl px-2.5 py-1.5 text-[12px] transition ${
                                childIsActive
                                  ? "bg-slate-100 font-semibold text-slate-900"
                                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                              }`}
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

          <div className="px-4 pb-4 pt-3">
            <div className="w-full rounded-2xl border border-white/70 bg-white/85 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-900">Solidcore Pro</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">74%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 w-[74%] rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>Premium tools enabled</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3 flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-3 py-2.5 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2">
                <Settings className="h-3.5 w-3.5" />
                Profile
              </span>
              <button type="button" className="rounded-md p-1 hover:bg-slate-100/80" aria-label="Collapse sidebar">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-10 xl:pl-[282px]">
        <header className="px-6 pb-0 pt-4 md:px-8">
          <div className="glass-card glass-card-content rounded-[20px] border-white/80 bg-white/60 px-6 py-4 backdrop-blur-[20px]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <button type="button" className="rounded-xl border border-slate-200/70 bg-white p-2.5 text-slate-500 xl:hidden" onClick={() => setOpen(true)}>
                  <Menu className="h-4 w-4" />
                </button>
                <div>
                  <h1 className="text-[32px] font-semibold leading-none tracking-tight text-slate-900">{title ?? toTitle(pathname)}</h1>
                  <p className="mt-1.5 text-[14px] text-slate-500">{subtitle ?? "Welcome back, Admin 👋"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div ref={searchContainerRef} className="relative hidden w-[430px] xl:block">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 py-2.5">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => {
                        if (searchQuery.trim().length >= 2) setSearchOpen(true);
                      }}
                      placeholder="Search products, orders, customers..."
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {searchOpen ? (
                    <div className="absolute left-0 right-0 top-[48px] z-50 max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_35px_rgba(15,23,42,0.16)] backdrop-blur-md">
                      {searchLoading ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Searching...</div>
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
                                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                                >
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.name}
                                      className="h-8 w-8 rounded-md border border-slate-200 object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                                      IMG
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-slate-900">{highlightText(item.name, searchQuery)}</p>
                                    <p className="truncate text-xs text-slate-500">{highlightText(item.sku || "-", searchQuery)}</p>
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
                                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-slate-900">{highlightText(item.orderNumber, searchQuery)}</p>
                                    <p className="truncate text-xs text-slate-500">{highlightText(item.customerName, searchQuery)}</p>
                                  </div>
                                  <span className="shrink-0 text-xs font-medium text-slate-600">${Number(item.total || 0).toFixed(2)}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {searchResults.customers.length > 0 ? (
                            <div>
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
                                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-slate-900">{highlightText(item.name, searchQuery)}</p>
                                    <p className="truncate text-xs text-slate-500">
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
                            <div className="px-3 py-2 text-xs text-slate-500">No results found</div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
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
                  {role}
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 text-sm text-slate-700"
                >
                  Last 7 days
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 text-sm text-slate-700"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/login";
                  }}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {userName?.slice(0, 1)?.toUpperCase() || "A"}
                  </span>
                  <span>{userName || "Admin"}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="px-6 pb-10 pt-6 md:px-8">{canView ? children : <AccessDenied />}</main>
      </div>
    </div>
  );
}
