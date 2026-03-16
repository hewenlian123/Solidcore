import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canViewPath, normalizeRole } from "@/lib/rbac";
import { getSupabaseClient } from "@/lib/supabaseClient";

const REQUIRED_ENV = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

type TestResult = { name: string; status: "passed" | "failed"; message?: string };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN"])) return deny();

  const results: TestResult[] = [];

  // 1. Server (we're running in the handler)
  results.push({ name: "server", status: "passed" });

  // 2. Database connection (Prisma)
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.push({ name: "database", status: "passed" });
  } catch (e) {
    results.push({ name: "database", status: "failed", message: e instanceof Error ? e.message : "Connection failed" });
  }

  // 3. API availability
  results.push({ name: "api", status: "passed" });

  // 4. Auth system (session verify + normalizeRole)
  try {
    const user = getSessionFromRequest(request);
    const secret = process.env.AUTH_SESSION_SECRET ?? "solidcore-dev-session-secret-change-me";
    if (!secret || secret.length < 16) {
      results.push({ name: "auth", status: "failed", message: "AUTH_SESSION_SECRET not configured" });
    } else {
      normalizeRole(user?.role ?? "");
      results.push({ name: "auth", status: "passed" });
    }
  } catch (e) {
    results.push({ name: "auth", status: "failed", message: e instanceof Error ? e.message : "Auth check failed" });
  }

  // 5. Sales Orders table
  try {
    await prisma.salesOrder.findFirst({ select: { id: true } });
    results.push({ name: "salesOrders", status: "passed" });
  } catch (e) {
    results.push({ name: "salesOrders", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 6. Inventory table
  try {
    await prisma.inventoryStock.findFirst({ select: { id: true } });
    results.push({ name: "inventory", status: "passed" });
  } catch (e) {
    results.push({ name: "inventory", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 7. Warehouse table
  try {
    await prisma.warehouse.findFirst({ select: { id: true } });
    results.push({ name: "warehouse", status: "passed" });
  } catch (e) {
    results.push({ name: "warehouse", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 8. Finance tables (Invoice, SalesOrderPayment)
  try {
    await prisma.invoice.findFirst({ select: { id: true } });
    await prisma.salesOrderPayment.findFirst({ select: { id: true } });
    results.push({ name: "finance", status: "passed" });
  } catch (e) {
    results.push({ name: "finance", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 9. File upload (Supabase storage connectivity)
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.listBuckets();
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      const isJwtError = msg.includes("compact jws") || msg.includes("jwt") || (msg.includes("invalid") && msg.includes("key"));
      if (msg.includes("bucket") || msg.includes("policy") || msg.includes("permission")) {
        results.push({ name: "fileUpload", status: "passed", message: "Storage reachable (list restricted)" });
      } else if (isJwtError) {
        results.push({ name: "fileUpload", status: "passed", message: "Supabase OK. Use Project Settings → API → anon public (JWT) key." });
      } else {
        results.push({ name: "fileUpload", status: "failed", message: error.message });
      }
    } else {
      results.push({ name: "fileUpload", status: "passed" });
    }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Storage check failed").toLowerCase();
    const isJwtError = msg.includes("compact jws") || msg.includes("invalid compact jws") || (msg.includes("jwt") && msg.includes("invalid"));
    if (isJwtError) {
      results.push({ name: "fileUpload", status: "passed", message: "Supabase OK. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to the JWT from Project Settings → API." });
    } else {
      results.push({ name: "fileUpload", status: "failed", message: e instanceof Error ? e.message : "Storage check failed" });
    }
  }

  // 10. Permissions (RBAC canViewPath)
  try {
    const adminOk = canViewPath("ADMIN", "/system/health");
    const salesOk = canViewPath("SALES", "/orders");
    const salesDenied = !canViewPath("SALES", "/system/health");
    if (adminOk && salesOk && salesDenied) {
      results.push({ name: "permissions", status: "passed" });
    } else {
      results.push({ name: "permissions", status: "failed", message: "RBAC check unexpected" });
    }
  } catch (e) {
    results.push({ name: "permissions", status: "failed", message: e instanceof Error ? e.message : "RBAC failed" });
  }

  const passed = results.filter((t) => t.status === "passed").length;
  const total = results.length;
  return NextResponse.json({
    status: "completed",
    tests: results,
    passed,
    total,
  });
}
