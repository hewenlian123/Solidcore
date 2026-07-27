import { NextResponse } from "next/server";
import { inspectSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await inspectSystemHealth();

  return NextResponse.json(
    {
      success: result.ready,
      error: result.error,
      data: {
        application: result.services.server,
        database: result.services.database,
        migrations: result.services.migrations,
        schema: result.services.schema,
        optionalDependencies: {
          supabase: result.services.supabase,
        },
      },
    },
    { status: result.ready ? 200 : 503 },
  );
}
