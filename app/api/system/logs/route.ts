import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export type LogEntry = {
  time: string;
  type: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  id?: string;
};

// In-memory log buffer for demo; in production use a log store or external service
const LOG_BUFFER: LogEntry[] = [];
const MAX_LOGS = 200;

export function appendLog(entry: Omit<LogEntry, "time" | "id">) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  LOG_BUFFER.unshift({ ...entry, time, id });
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN"])) return deny();

  const limit = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("limit")) || 50));
  const typeFilter = request.nextUrl.searchParams.get("type") as LogEntry["type"] | null;

  // Seed demo logs if empty
  let logs = LOG_BUFFER.length > 0 ? [...LOG_BUFFER] : getDemoLogs();
  if (typeFilter) logs = logs.filter((l) => l.type === typeFilter);
  logs = logs.slice(0, limit);

  return NextResponse.json(logs);
}

function getDemoLogs(): LogEntry[] {
  const now = new Date();
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return [
    { time: fmt(now), type: "INFO", message: "GET /api/orders", id: "1" },
    { time: fmt(new Date(now.getTime() - 12000)), type: "INFO", message: "GET /api/sales-orders", id: "2" },
    { time: fmt(new Date(now.getTime() - 25000)), type: "INFO", message: "GET /api/health", id: "3" },
    { time: fmt(new Date(now.getTime() - 40000)), type: "WARN", message: "Slow query: SalesOrder.findMany > 500ms", id: "4" },
    { time: fmt(new Date(now.getTime() - 55000)), type: "ERROR", message: "Database timeout", id: "5" },
    { time: fmt(new Date(now.getTime() - 70000)), type: "INFO", message: "POST /api/invoices", id: "6" },
    { time: fmt(new Date(now.getTime() - 85000)), type: "DEBUG", message: "Prisma query: inventory_stock", id: "7" },
    { time: fmt(new Date(now.getTime() - 100000)), type: "INFO", message: "GET /api/dashboard", id: "8" },
  ];
}
