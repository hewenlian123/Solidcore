"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Ellipsis,
  FileText,
  House,
  Package,
  PackageCheck,
  Plus,
  Settings,
  ShoppingBag,
  Users,
  WalletCards,
} from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { useRole } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { canViewPath, Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  match?: string[];
};

const roleLabels: Record<Role, string> = {
  ADMIN: "Owner / Manager",
  SALES: "Sales",
  WAREHOUSE: "Warehouse / Receiving",
};

const navByRole: Record<Role, NavItem[]> = {
  SALES: [
    {
      label: "Sell",
      href: "/dashboard",
      icon: ShoppingBag,
      match: ["/dashboard", "/sales-orders/new"],
    },
    {
      label: "Orders",
      href: "/orders",
      icon: ClipboardList,
      match: ["/orders", "/sales-orders"],
    },
    {
      label: "Customers",
      href: "/customers",
      icon: Users,
      match: ["/customers"],
    },
  ],
  WAREHOUSE: [
    {
      label: "Today",
      href: "/warehouse",
      icon: CalendarDays,
      match: ["/warehouse"],
    },
    {
      label: "Fulfillment",
      href: "/fulfillment/outbound",
      icon: Boxes,
      match: ["/fulfillment", "/outbound", "/delivery"],
    },
    {
      label: "Inventory",
      href: "/inventory",
      icon: Package,
      match: ["/inventory"],
    },
    {
      label: "Receiving",
      href: "/purchasing/receiving",
      icon: PackageCheck,
      match: ["/purchasing/receiving", "/purchasing/orders/"],
    },
  ],
  ADMIN: [
    { label: "Today", href: "/dashboard", icon: House, match: ["/dashboard"] },
    {
      label: "Orders",
      href: "/orders",
      icon: ClipboardList,
      match: ["/orders", "/sales-orders"],
    },
    {
      label: "Inventory",
      href: "/inventory",
      icon: Package,
      match: ["/inventory"],
    },
  ],
};

const secondaryItems: Array<NavItem & { roles: Role[]; description: string }> =
  [
    {
      label: "Products",
      href: "/products",
      icon: Package,
      roles: ["ADMIN", "SALES", "WAREHOUSE"],
      description: "Catalog and product details",
    },
    {
      label: "Invoices & Payments",
      href: "/invoices",
      icon: WalletCards,
      roles: ["ADMIN", "SALES"],
      description: "Invoices, balances, and posted payments",
    },
    {
      label: "Reports",
      href: "/reports",
      icon: FileText,
      roles: ["ADMIN", "SALES"],
      description: "Operational and financial review",
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      roles: ["ADMIN"],
      description: "Company and access settings",
    },
  ];

function itemIsActive(item: NavItem, pathname: string) {
  return (item.match ?? [item.href]).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { role, userName, authenticated, loading } = useRole();
  const [moreOpen, setMoreOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const isLogin = pathname === "/login";
  const canView = canViewPath(role, pathname);
  const showDesktopCreateSale =
    role !== "WAREHOUSE" &&
    (pathname === "/dashboard" || pathname === "/invoices");
  const isFocusedEditor =
    pathname === "/sales-orders/new" ||
    pathname === "/sales-orders/pos" ||
    pathname.startsWith("/sales-orders/edit/");

  const primaryItems = navByRole[role];
  const visibleSecondaryItems = useMemo(
    () =>
      secondaryItems.filter(
        (item) => item.roles.includes(role) && canViewPath(role, item.href),
      ),
    [role],
  );

  useEffect(() => {
    if (!authenticated) return;
    [...primaryItems, ...visibleSecondaryItems].forEach((item) =>
      router.prefetch(item.href),
    );
  }, [authenticated, primaryItems, router, visibleSecondaryItems]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompactNavigation(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (isLogin) {
    return (
      <div className="min-h-screen bg-canvas text-foreground">{children}</div>
    );
  }

  if (!authenticated && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-sm text-foreground-secondary">
        Loading session...
      </div>
    );
  }

  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <div className="min-h-screen bg-canvas text-foreground">
        {!isFocusedEditor && !compactNavigation ? (
          <header className="sticky top-0 z-40 hidden h-[72px] border-b border-border bg-surface md:block">
            <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-6 px-7 xl:px-8">
              <div className="flex min-w-0 items-center gap-8">
                <Link
                  href={role === "WAREHOUSE" ? "/warehouse" : "/dashboard"}
                  className="flex min-w-[118px] flex-col justify-center"
                >
                  <span className="text-base font-bold leading-5 text-foreground">
                    SolidCore
                  </span>
                  <span className="text-xs leading-4 text-foreground-secondary">
                    {roleLabels[role]}
                  </span>
                </Link>
                <nav
                  aria-label="Primary"
                  className="flex h-full items-center gap-1"
                >
                  {primaryItems.map((item) => {
                    const active = itemIsActive(item, pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-11 min-w-[82px] items-center justify-center rounded-sc-sm px-3 text-[13px] font-medium transition-colors duration-fast hover:bg-hover hover:text-foreground",
                          active
                            ? "font-semibold text-accent"
                            : "text-foreground-secondary",
                        )}
                      >
                        {item.label}
                        {active ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-6 bottom-0 h-0.5 rounded-sm bg-accent"
                          />
                        ) : null}
                      </Link>
                    );
                  })}
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      aria-label="More destinations"
                      className={cn(
                        "relative flex h-11 min-w-[82px] items-center justify-center rounded-sc-sm px-3 text-[13px] font-medium text-foreground-secondary transition-colors duration-fast hover:bg-hover hover:text-foreground",
                        visibleSecondaryItems.some((item) =>
                          itemIsActive(item, pathname),
                        ) && "font-semibold text-accent",
                      )}
                    >
                      More
                    </button>
                  </SheetTrigger>
                </nav>
              </div>
              {showDesktopCreateSale ? (
                <Button onClick={() => router.push("/sales-orders/new")}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create Sale
                </Button>
              ) : (
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {userName || "SolidCore"}
                  </p>
                  <p className="text-xs text-foreground-secondary">
                    Local workspace
                  </p>
                </div>
              )}
            </div>
          </header>
        ) : null}

        <main
          className={cn(
            "min-w-0",
            !isFocusedEditor &&
              "pb-[calc(80px+env(safe-area-inset-bottom,0px))] md:pb-0",
            isFocusedEditor && "min-h-screen",
          )}
        >
          {canView ? children : <AccessDenied />}
        </main>

        {!isFocusedEditor && compactNavigation ? (
          <nav
            aria-label="Primary"
            className="sc-mobile-safe-bottom fixed inset-x-0 bottom-0 z-40 grid min-h-[80px] grid-cols-4 border-t border-border bg-surface md:hidden"
          >
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const active = itemIsActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(
                    "flex min-h-[80px] min-w-0 flex-col items-center justify-center gap-1 px-1 pb-1 pt-2 text-[11px] leading-4 transition-colors duration-fast active:bg-selected",
                    active
                      ? "font-semibold text-accent"
                      : "text-foreground-secondary",
                  )}
                >
                  <Icon aria-hidden={true} className="h-[21px] w-[21px]" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })}
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="More destinations"
                className={cn(
                  "flex min-h-[80px] min-w-0 flex-col items-center justify-center gap-1 px-1 pb-1 pt-2 text-[11px] leading-4 text-foreground-secondary transition-colors duration-fast active:bg-selected",
                  visibleSecondaryItems.some((item) =>
                    itemIsActive(item, pathname),
                  ) && "font-semibold text-accent",
                )}
              >
                <Ellipsis aria-hidden="true" className="h-[21px] w-[21px]" />
                <span>More</span>
              </button>
            </SheetTrigger>
          </nav>
        ) : null}
      </div>
      <SheetContent
        side="right"
        className="w-[min(420px,100vw)] max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-h-[85vh] max-md:w-full max-md:rounded-t-sc-lg max-md:border-l-0 max-md:border-t"
      >
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
          <SheetDescription>{roleLabels[role]} destinations</SheetDescription>
        </SheetHeader>
        <nav
          aria-label="More destinations"
          className="mt-6 divide-y divide-divider"
        >
          {visibleSecondaryItems.map((item) => {
            const Icon = item.icon;
            const active = itemIsActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-[64px] items-center gap-3 px-1 py-3 transition-colors duration-fast hover:bg-hover",
                  active && "text-accent",
                )}
              >
                <Icon aria-hidden={true} className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {item.label}
                  </span>
                  <span className="block text-xs leading-4 text-foreground-secondary">
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-7 border-t border-divider pt-5">
          <p className="text-sm font-semibold text-foreground">
            {userName || "SolidCore user"}
          </p>
          <p className="mt-0.5 text-xs text-foreground-secondary">
            {roleLabels[role]}
          </p>
          <Button
            variant="secondary"
            className="mt-4 w-full"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
