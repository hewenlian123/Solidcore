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
  const { role } = useRole();
  const canView = canViewPath(role, pathname);

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 tracking-tight">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="md:pl-72">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="px-6 pb-10 pt-8 md:px-10">{canView ? children : <AccessDenied />}</main>
      </div>
    </div>
  );
}
