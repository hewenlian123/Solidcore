import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupabaseClient } from "@/lib/supabaseClient";

const REQUIRED_ENV = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const services: Record<string, string> = {
      server: "running",
      database: "disconnected",
      prisma: "inactive",
      supabase: "disconnected",
    };

    // 1. Database + Prisma: $queryRaw SELECT 1
    try {
      await prisma.$queryRaw`SELECT 1`;
      services.database = "connected";
      services.prisma = "active";
    } catch (dbError) {
      console.error("Health check database error:", dbError);
      const elapsed = Date.now() - start;
      return NextResponse.json(
        {
          status: "error",
          services: { ...services, database: "error", prisma: "error" },
          responseTime: elapsed,
          timestamp,
          error: dbError instanceof Error ? dbError.message : "Database check failed",
        },
        { status: 503 }
      );
    }

    // 2. Required environment variables
    const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
    if (missingEnv.length > 0) {
      const elapsed = Date.now() - start;
      return NextResponse.json(
        {
          status: "error",
          services: { ...services, env: "missing" },
          responseTime: elapsed,
          timestamp,
          error: `Missing env: ${missingEnv.join(", ")}`,
        },
        { status: 503 }
      );
    }

    // 3. Supabase connectivity (client + auth endpoint reachable)
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.getSession();
      if (error) {
        services.supabase = "error";
      } else {
        services.supabase = "connected";
      }
    } catch (supabaseError) {
      console.error("Health check Supabase error:", supabaseError);
      services.supabase = "error";
    }

    const responseTime = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      services,
      responseTime,
      timestamp,
    });
  } catch (err) {
    const responseTime = Date.now() - start;
    console.error("Health check error:", err);
    return NextResponse.json(
      {
        status: "error",
        services: { server: "running", database: "unknown", prisma: "unknown", supabase: "unknown" },
        responseTime,
        timestamp,
        error: err instanceof Error ? err.message : "Health check failed",
      },
      { status: 503 }
    );
  }
}
