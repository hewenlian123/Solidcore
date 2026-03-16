import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const REQUIRED_ENV = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

type TestResult = { name: string; status: "passed" | "failed"; message?: string };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN"])) return deny();

  const results: TestResult[] = [];

  // 1. Database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.push({ name: "database", status: "passed" });
  } catch (e) {
    results.push({ name: "database", status: "failed", message: e instanceof Error ? e.message : "Connection failed" });
  }

  // 2. API availability (we're inside the API, so it's available)
  results.push({ name: "api", status: "passed" });

  // 3. Environment variables
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length === 0) {
    results.push({ name: "environment", status: "passed" });
  } else {
    results.push({ name: "environment", status: "failed", message: `Missing: ${missing.join(", ")}` });
  }

  // 4. SalesOrder table access
  try {
    await prisma.salesOrder.findFirst({ select: { id: true } });
    results.push({ name: "sales_orders", status: "passed" });
  } catch (e) {
    results.push({ name: "sales_orders", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 5. Inventory table access
  try {
    await prisma.inventoryStock.findFirst({ select: { id: true } });
    results.push({ name: "inventory", status: "passed" });
  } catch (e) {
    results.push({ name: "inventory", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  // 6. Warehouse table access
  try {
    await prisma.warehouse.findFirst({ select: { id: true } });
    results.push({ name: "warehouse", status: "passed" });
  } catch (e) {
    results.push({ name: "warehouse", status: "failed", message: e instanceof Error ? e.message : "Access failed" });
  }

  const allPassed = results.every((t) => t.status === "passed");
  return NextResponse.json({
    status: allPassed ? "completed" : "completed",
    tests: results,
    passed: results.filter((t) => t.status === "passed").length,
    total: results.length,
  });
}
