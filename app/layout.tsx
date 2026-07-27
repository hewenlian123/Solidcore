import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { RoleProvider } from "@/components/layout/role-provider";
import { PWARegister } from "@/components/pwa/pwa-register";
import { AppQueryProvider } from "@/components/providers/query-provider";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "SolidCore",
  description: "SolidCore Building Supply operations",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F4EF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body className="min-h-screen bg-canvas text-foreground antialiased">
        <div className="app-safe-area min-h-screen">
          <div>
            <AppQueryProvider>
              <RoleProvider>
                <NextTopLoader
                  color="#292A26"
                  height={2}
                  showSpinner={false}
                  crawl={true}
                  crawlSpeed={220}
                  speed={280}
                  shadow={false}
                />
                <Toaster theme="light" richColors closeButton />
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
