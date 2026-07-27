import { NextResponse } from "next/server";
import { inspectSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const result = await inspectSystemHealth();

  return NextResponse.json(
    {
      status: result.ready ? "ok" : "error",
      services: result.services,
      responseTime: Date.now() - start,
      timestamp,
      error: result.error,
    },
    { status: result.ready ? 200 : 503 },
  );
}
