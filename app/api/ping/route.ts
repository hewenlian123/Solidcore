import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      success: true,
      error: null,
      data: { database: "connected" },
    });
  } catch (error) {
    console.error("Ping database error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connectivity check failed.",
        data: null,
      },
      { status: 503 },
    );
  }
}
