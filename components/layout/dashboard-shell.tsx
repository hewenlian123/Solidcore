"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { useRole } from "@/components/layout/role-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { canViewPath } from "@/lib/rbac";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { role, authenticated, loading } = useRole();
  const isLogin = pathname === "/login";
  const isDashboardHome = pathname === "/dashboard";
  const canView = canViewPath(role, pathname);

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

  if (isDashboardHome) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] tracking-tight">
        <main className="px-6 pb-10 pt-8 md:px-10">{canView ? children : <AccessDenied />}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] tracking-tight">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="md:pl-72">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="px-6 pb-10 pt-8 md:px-10">{canView ? children : <AccessDenied />}</main>
      </div>
    </div>
  );
}
