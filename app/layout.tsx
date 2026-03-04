import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { RoleProvider } from "@/components/layout/role-provider";
import { PWARegister } from "@/components/pwa/pwa-register";
import { AppQueryProvider } from "@/components/providers/query-provider";
import NextTopLoader from "nextjs-toploader";

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
      <body className="bg-[var(--bg)] text-[var(--text)] antialiased [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
        <AppQueryProvider>
          <RoleProvider>
            <NextTopLoader
              color="#0F172A"
              height={2}
              showSpinner={false}
              crawl={true}
              crawlSpeed={220}
              speed={280}
              shadow="0 0 10px rgba(15, 23, 42, 0.3)"
            />
            <PWARegister />
            <AppShell>{children}</AppShell>
          </RoleProvider>
        </AppQueryProvider>
      </body>
    </html>
  );
}
