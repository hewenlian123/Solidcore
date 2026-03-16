import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

// In-memory counters for demo; in production use Redis/Vercel Analytics or similar
let requestCount = 0;
let errorCount = 0;
let latencySum = 0;
let latencyN = 0;
const windowStart = Date.now();
const ONE_MINUTE = 60 * 1000;

function recordRequest(latencyMs: number, isError?: boolean) {
  const now = Date.now();
  if (now - windowStart > ONE_MINUTE) return; // optional: reset or use sliding window
  requestCount += 1;
  if (isError) errorCount += 1;
  latencySum += latencyMs;
  latencyN += 1;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN"])) return deny();

  // Simulated metrics for the monitoring UI (replace with real metrics in production)
  const now = Date.now();
  const requestsPerMinute = requestCount || Math.floor(80 + Math.random() * 80);
  const errorsPerMinute = errorCount || Math.floor(Math.random() * 3);
  const avgLatency = latencyN > 0 ? Math.round(latencySum / latencyN) : 35 + Math.floor(Math.random() * 30);

  return NextResponse.json({
    requests: requestsPerMinute,
    errors: errorsPerMinute,
    latency: `${avgLatency}ms`,
    latencyMs: avgLatency,
    activeUsers: 5 + Math.floor(Math.random() * 8),
    timestamp: new Date(now).toISOString(),
  });
}
