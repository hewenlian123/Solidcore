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
  themeColor: "#0B0F19",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body className="min-h-screen bg-[#0B0F19] text-[var(--text)] antialiased [font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
        <div className="relative min-h-screen overflow-hidden">
          {/* Minimal premium SaaS background — subtle vertical gradient only */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-0"
            style={{
              background: "linear-gradient(180deg, #0B0F19 0%, #0F172A 100%)",
            }}
          />

          <div className="relative z-10">
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
          </div>
        </div>
      </body>
    </html>
  );
}
