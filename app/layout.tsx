import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoleProvider } from "@/components/layout/role-provider";
import { PWARegister } from "@/components/pwa/pwa-register";
import { AppQueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: "Solidcore Building Materials Management",
  description: "Integrated management for windows, flooring, mirrors, doors, and warehouse operations",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body className="bg-slate-50 text-slate-900 antialiased [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
        <AppQueryProvider>
          <RoleProvider>
            <PWARegister />
            <DashboardShell>{children}</DashboardShell>
          </RoleProvider>
        </AppQueryProvider>
      </body>
    </html>
  );
}
